import crypto from 'crypto';
import { db } from '@loginhub/database';
import { usuarios, aplicativos, usuarios2fa, usuarios2faBackupCodes } from '@loginhub/schema';
import { eq, and, isNull } from 'drizzle-orm';
import type {
    TwoFactorSetupResponse,
    TwoFactorActivationResponse,
    TwoFactorStatus,
} from '@loginhub/schema';

// ==========================================
// PARÂMETROS
// ==========================================
const STEP_SEGUNDOS = 30;
const DIGITOS = 6;
/** Tolerância de relógio: aceita o step anterior e o próximo (±30s). */
const JANELA = 1;
const QTD_BACKUP_CODES = 10;
const ISSUER = 'LoginHUB';

// ==========================================
// CHAVE DE CIFRA
// ==========================================
/**
 * Chave de 32 bytes vinda de `TWOFA_ENC_KEY` (hex de 64 chars ou base64).
 *
 * Serve para dois usos distintos e propositalmente separados por contexto:
 * AES-256-GCM no secret TOTP e HMAC-SHA256 nos códigos de recuperação.
 *
 * Resolvida a cada chamada (e não no import) para que a ausência da variável
 * derrube só a rota de 2FA, não a subida inteira da API.
 */
const chave = (): Buffer => {
    const bruta = process.env.TWOFA_ENC_KEY;
    if (!bruta) throw new Error('TWOFA_NAO_CONFIGURADO');

    const buf = /^[0-9a-fA-F]{64}$/.test(bruta)
        ? Buffer.from(bruta, 'hex')
        : Buffer.from(bruta, 'base64');

    if (buf.length !== 32) throw new Error('TWOFA_NAO_CONFIGURADO');
    return buf;
};

/** Cifra o secret. Formato `v1:<iv>:<tag>:<ciphertext>`, tudo em base64. */
const cifrar = (texto: string): string => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', chave(), iv);
    const ct = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
};

const decifrar = (guardado: string): string => {
    const [versao, ivB64, tagB64, ctB64] = guardado.split(':');
    if (versao !== 'v1' || !ivB64 || !tagB64 || !ctB64) throw new Error('SECRET_CORROMPIDO');

    const decipher = crypto.createDecipheriv('aes-256-gcm', chave(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    try {
        return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
    } catch {
        // Tag GCM não confere: chave trocada ou registro adulterado.
        throw new Error('SECRET_CORROMPIDO');
    }
};

// ==========================================
// BASE32 (RFC 4648, sem padding)
// ==========================================
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buf: Buffer): string => {
    let bits = 0, valor = 0, saida = '';
    for (const byte of buf) {
        valor = (valor << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            saida += B32[(valor >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) saida += B32[(valor << (5 - bits)) & 31];
    return saida;
};

const base32Decode = (texto: string): Buffer => {
    let bits = 0, valor = 0;
    const bytes: number[] = [];
    for (const c of texto.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()) {
        const i = B32.indexOf(c);
        if (i === -1) throw new Error('SECRET_CORROMPIDO');
        valor = (valor << 5) | i;
        bits += 5;
        if (bits >= 8) {
            bytes.push((valor >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
};

// ==========================================
// TOTP (RFC 6238 sobre HOTP/RFC 4226)
// ==========================================
/**
 * HOTP: HMAC-SHA1 do contador em big-endian de 8 bytes, truncagem dinâmica.
 *
 * SHA-1 não é escolha de conveniência: é o que Google Authenticator, Authy,
 * 1Password e Microsoft Authenticator assumem por padrão. O `algorithm=` da URI
 * `otpauth://` é ignorado por vários deles, então divergir aqui quebraria a
 * compatibilidade prometida.
 */
const hotp = (segredo: Buffer, contador: number): string => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(contador));

    const h = crypto.createHmac('sha1', segredo).update(buf).digest();
    const offset = h[h.length - 1]! & 0x0f;
    const truncado =
        ((h[offset]! & 0x7f) << 24) |
        ((h[offset + 1]! & 0xff) << 16) |
        ((h[offset + 2]! & 0xff) << 8) |
        (h[offset + 3]! & 0xff);

    return (truncado % 10 ** DIGITOS).toString().padStart(DIGITOS, '0');
};

export const stepAtual = (agoraMs: number = Date.now()): number =>
    Math.floor(agoraMs / 1000 / STEP_SEGUNDOS);

/** Compara sem vazar tempo — evita distinguir "quase certo" de "errado". */
const igualSeguro = (a: string, b: string): boolean => {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

/**
 * Confere o código dentro da janela de tolerância.
 * Devolve o step que casou (para gravar como `ultimoStep`) ou `null`.
 */
export const verificarTotp = (
    secretBase32: string,
    codigo: string,
    agoraMs: number = Date.now(),
): number | null => {
    const limpo = codigo.replace(/\s/g, '');
    if (!/^\d{6}$/.test(limpo)) return null;

    const segredo = base32Decode(secretBase32);
    const base = stepAtual(agoraMs);

    for (let d = -JANELA; d <= JANELA; d++) {
        if (igualSeguro(hotp(segredo, base + d), limpo)) return base + d;
    }
    return null;
};

// ==========================================
// CÓDIGOS DE RECUPERAÇÃO
// ==========================================
/** Alfabeto sem 0/O/1/I/L — o usuário vai transcrever isto à mão de um papel. */
const ALFA_BACKUP = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const gerarBackupCode = (): string => {
    const bytes = crypto.randomBytes(10);
    // 10 chars de um alfabeto de 31 ≈ 49 bits de entropia.
    const chars = Array.from(bytes, (b) => ALFA_BACKUP[b % ALFA_BACKUP.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
};

const normalizarBackupCode = (codigo: string): string =>
    codigo.replace(/[\s-]/g, '').toUpperCase();

const hmacBackupCode = (codigo: string): string =>
    crypto.createHmac('sha256', chave()).update(normalizarBackupCode(codigo)).digest('hex');

// ==========================================
// SERVICE
// ==========================================
export class TwoFactorService {
    /**
     * Inicia (ou reinicia) o enrolamento: gera secret novo, grava cifrado como
     * pendente e devolve a URI `otpauth://`.
     *
     * Chamar de novo antes de confirmar descarta o secret anterior — é o botão
     * "gerar outro QR". Uma vez ativo, exige desativar antes de reenrolar, para
     * que ninguém troque o segundo fator só com a sessão em mãos.
     */
    public async iniciarSetup(usuarioId: string): Promise<TwoFactorSetupResponse> {
        const conta = await this.carregarConta(usuarioId);

        const atual = await this.carregarConfig(usuarioId);
        if (atual?.ativo) throw new Error('JA_ATIVO');

        const secret = base32Encode(crypto.randomBytes(20));
        const cifrado = cifrar(secret);

        if (atual) {
            // Pode ser um reenrolamento OU a linha vazia que o convite obrigatório
            // criou. Nos dois casos o secret anterior (se havia) é descartado.
            await db.update(usuarios2fa)
                .set({ secretCifrado: cifrado, ultimoStep: null, confirmadoEm: null })
                .where(eq(usuarios2fa.usuarioId, Number(usuarioId)));
        } else {
            await db.insert(usuarios2fa).values({
                usuarioId: Number(usuarioId),
                secretCifrado: cifrado,
                ativo: false,
            });
        }

        // O label carrega o nome do app: quem tem o mesmo e-mail em vários
        // tenants veria N entradas idênticas no autenticador sem isso.
        const label = `${conta.appNome} (${conta.email})`;
        const otpauthUri =
            `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(label)}` +
            `?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}` +
            `&algorithm=SHA1&digits=${DIGITOS}&period=${STEP_SEGUNDOS}`;

        return { secret, otpauthUri, label, issuer: ISSUER };
    }

    /**
     * Confirma o enrolamento com um código do app autenticador.
     *
     * É aqui que os códigos de recuperação nascem e que as sessões anteriores
     * caem: sem o corte, um JWT emitido antes da ativação continuaria válido
     * por 24h e ainda renovável por mais 7 dias pelo grace do `/auth/refresh` —
     * o 2FA não protegeria nada do que já estava em circulação.
     */
    public async confirmarSetup(usuarioId: string, codigo: string): Promise<Omit<TwoFactorActivationResponse, 'token' | 'expiresIn'>> {
        const config = await this.carregarConfig(usuarioId);
        if (!config?.secretCifrado) throw new Error('SETUP_NAO_INICIADO');
        if (config.ativo) throw new Error('JA_ATIVO');

        const step = verificarTotp(decifrar(config.secretCifrado), codigo);
        if (step === null) throw new Error('CODIGO_INVALIDO');

        const agora = new Date();
        await db.update(usuarios2fa)
            .set({ ativo: true, confirmadoEm: agora, ultimoStep: step, sessoesValidasDesde: agora })
            .where(eq(usuarios2fa.usuarioId, Number(usuarioId)));

        const backupCodes = await this.regravarBackupCodes(usuarioId);
        return { ativo: true, backupCodes, sessoesAnterioresInvalidadas: true };
    }

    /** `true` se a conta exige segundo fator no login. */
    public async estaAtivo(usuarioId: string): Promise<boolean> {
        const config = await this.carregarConfig(usuarioId);
        return !!config?.ativo;
    }

    /**
     * O que o login deve fazer com esta conta. Uma consulta só — é caminho
     * crítico, percorrido em toda autenticação.
     *
     *   'sessao'     → segue direto, sem segundo fator
     *   'desafio'    → 2FA ativo, exige código
     *   'enrolar'    → 2FA exigido pelo convite e ainda não configurado
     */
    public async estadoDoLogin(usuarioId: string): Promise<'sessao' | 'desafio' | 'enrolar'> {
        const config = await this.carregarConfig(usuarioId);
        if (!config) return 'sessao';
        if (config.ativo) return 'desafio';
        return config.obrigatorio ? 'enrolar' : 'sessao';
    }

    /**
     * Valida um código TOTP de conta já ativa e queima o step usado.
     *
     * O `ultimoStep` é o que impede replay: um código interceptado não vale uma
     * segunda vez, mesmo dentro dos 30s em que continua matematicamente correto.
     */
    public async verificarCodigo(usuarioId: string, codigo: string): Promise<void> {
        const config = await this.carregarConfig(usuarioId);
        if (!config?.ativo || !config.secretCifrado) throw new Error('NAO_ATIVO');

        const step = verificarTotp(decifrar(config.secretCifrado), codigo);
        if (step === null) throw new Error('CODIGO_INVALIDO');
        if (config.ultimoStep !== null && step <= config.ultimoStep) throw new Error('CODIGO_REUTILIZADO');

        await db.update(usuarios2fa)
            .set({ ultimoStep: step })
            .where(eq(usuarios2fa.usuarioId, Number(usuarioId)));
    }

    /** Consome um código de recuperação (uso único, marcado no banco). */
    public async consumirBackupCode(usuarioId: string, codigo: string): Promise<{ restantes: number }> {
        const config = await this.carregarConfig(usuarioId);
        if (!config?.ativo) throw new Error('NAO_ATIVO');

        const alvo = hmacBackupCode(codigo);
        const linhas = await db.select({ id: usuarios2faBackupCodes.id })
            .from(usuarios2faBackupCodes)
            .where(and(
                eq(usuarios2faBackupCodes.usuarioId, Number(usuarioId)),
                eq(usuarios2faBackupCodes.codigoHmac, alvo),
                isNull(usuarios2faBackupCodes.usadoEm),
            ))
            .limit(1);

        const linha = linhas[0];
        if (!linha) throw new Error('CODIGO_INVALIDO');

        // Marca só se ainda estiver não usado: dois envios simultâneos do mesmo
        // código não podem passar os dois.
        const gasto = await db.update(usuarios2faBackupCodes)
            .set({ usadoEm: new Date() })
            .where(and(eq(usuarios2faBackupCodes.id, linha.id), isNull(usuarios2faBackupCodes.usadoEm)))
            .returning({ id: usuarios2faBackupCodes.id });

        if (gasto.length === 0) throw new Error('CODIGO_INVALIDO');
        return { restantes: await this.contarBackupCodes(usuarioId) };
    }

    /** Regenera os códigos de recuperação. Os antigos morrem todos. */
    public async regenerarBackupCodes(usuarioId: string): Promise<string[]> {
        const config = await this.carregarConfig(usuarioId);
        if (!config?.ativo) throw new Error('NAO_ATIVO');
        return this.regravarBackupCodes(usuarioId);
    }

    /**
     * Desativa o 2FA.
     *
     * A linha permanece (com `ativo = false`) de propósito: `sessoesValidasDesde`
     * precisa continuar valendo, senão desativar o 2FA ressuscitaria as sessões
     * que a ativação tinha derrubado.
     */
    public async desativar(usuarioId: string): Promise<void> {
        const config = await this.carregarConfig(usuarioId);
        if (!config?.ativo) throw new Error('NAO_ATIVO');
        // Exigência veio do convite: só um admin pode remover, não o próprio
        // usuário — senão "obrigatório" seria só uma sugestão.
        if (config.obrigatorio) throw new Error('OBRIGATORIO');

        await db.update(usuarios2fa)
            .set({ ativo: false, confirmadoEm: null, ultimoStep: null })
            .where(eq(usuarios2fa.usuarioId, Number(usuarioId)));

        await db.delete(usuarios2faBackupCodes)
            .where(eq(usuarios2faBackupCodes.usuarioId, Number(usuarioId)));
    }

    public async status(usuarioId: string): Promise<TwoFactorStatus> {
        const config = await this.carregarConfig(usuarioId);
        if (!config) return { ativo: false, obrigatorio: false, backupCodesRestantes: 0 };
        return {
            ativo: config.ativo,
            obrigatorio: config.obrigatorio,
            confirmadoEm: config.confirmadoEm ? config.confirmadoEm.toISOString() : null,
            backupCodesRestantes: config.ativo ? await this.contarBackupCodes(usuarioId) : 0,
        };
    }

    /**
     * Piso de validade das sessões, se houver. O `authMiddleware` recusa JWT com
     * `iat` anterior a isto.
     */
    public async sessoesValidasDesde(usuarioId: string): Promise<Date | null> {
        const config = await this.carregarConfig(usuarioId);
        return config?.sessoesValidasDesde ?? null;
    }

    /**
     * Marca a conta como obrigada a ter 2FA.
     *
     * Cria a linha sem secret: ela existe só para registrar a exigência. O
     * segredo aparece quando a pessoa abre o convite e escaneia o QR.
     */
    public async marcarObrigatorio(usuarioId: string): Promise<void> {
        const atual = await this.carregarConfig(usuarioId);
        if (atual) {
            await db.update(usuarios2fa)
                .set({ obrigatorio: true })
                .where(eq(usuarios2fa.usuarioId, Number(usuarioId)));
            return;
        }

        await db.insert(usuarios2fa).values({
            usuarioId: Number(usuarioId),
            secretCifrado: null,
            ativo: false,
            obrigatorio: true,
        });
    }

    /** Remove a exigência (ação administrativa — ver `desativar`). */
    public async removerObrigatoriedade(usuarioId: string): Promise<void> {
        await db.update(usuarios2fa)
            .set({ obrigatorio: false })
            .where(eq(usuarios2fa.usuarioId, Number(usuarioId)));
    }

    /**
     * `true` quando o 2FA é exigido e o enrolamento ainda não terminou.
     *
     * É o caso de quem abandonou o convite no meio: senha definida, exigência
     * registrada, nenhum segundo fator. O login trata isso à parte para não
     * deixar a pessoa presa sem caminho de saída.
     */
    public async exigeEnrolamento(usuarioId: string): Promise<boolean> {
        const config = await this.carregarConfig(usuarioId);
        return !!config?.obrigatorio && !config.ativo;
    }

    // ---------- internos ----------

    private async carregarConfig(usuarioId: string) {
        const linhas = await db.select()
            .from(usuarios2fa)
            .where(eq(usuarios2fa.usuarioId, Number(usuarioId)))
            .limit(1);
        return linhas[0] ?? null;
    }

    private async carregarConta(usuarioId: string) {
        const linhas = await db.select({
            email: usuarios.email,
            appId: usuarios.appId,
            appNome: aplicativos.nome,
        })
            .from(usuarios)
            .innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
            .where(eq(usuarios.id, Number(usuarioId)))
            .limit(1);

        const conta = linhas[0];
        if (!conta) throw new Error('USUARIO_NAO_ENCONTRADO');
        return conta;
    }

    private async contarBackupCodes(usuarioId: string): Promise<number> {
        const linhas = await db.select({ id: usuarios2faBackupCodes.id })
            .from(usuarios2faBackupCodes)
            .where(and(
                eq(usuarios2faBackupCodes.usuarioId, Number(usuarioId)),
                isNull(usuarios2faBackupCodes.usadoEm),
            ));
        return linhas.length;
    }

    private async regravarBackupCodes(usuarioId: string): Promise<string[]> {
        await db.delete(usuarios2faBackupCodes)
            .where(eq(usuarios2faBackupCodes.usuarioId, Number(usuarioId)));

        const codigos = Array.from({ length: QTD_BACKUP_CODES }, gerarBackupCode);
        await db.insert(usuarios2faBackupCodes).values(
            codigos.map((c) => ({ usuarioId: Number(usuarioId), codigoHmac: hmacBackupCode(c) })),
        );
        return codigos;
    }
}

export const twoFactorService = new TwoFactorService();
