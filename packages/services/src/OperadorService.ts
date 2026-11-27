import fs from 'fs';
import path from 'path';
import { db } from '@loginhub/database';
import { aplicativos } from '@loginhub/schema';
import { eq } from 'drizzle-orm';
import { twoFactorService } from './TwoFactorService';

// ==========================================
// OPERADOR POR CPF (27/11/2026)
// ==========================================
//
// Pedido do dono da Sul: cadastrar o operador pedindo SÓ o CPF. A conta nasce
// com CPF + CPF (o CPF é o login e a senha inicial), nível `operador`, e o
// servidor já gera o 2FA do Google ATIVO. Como quem cadastra não tem o celular
// do operador, o segredo é gravado num arquivo da pasta `2fa-operador/` do
// servidor (fora do git: .gitignore e .dockerignore) para ser cadastrado no
// autenticador dele. A API NUNCA devolve o segredo.

const PASTA_PADRAO = '/app/2fa-operador';

/** CPF com os dois dígitos verificadores certos e sem sequência repetida. */
export const cpfValido = (bruto: string): boolean => {
    const c = String(bruto ?? '').replace(/\D/g, '');
    if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
    const dv = (n: number) => {
        let soma = 0;
        for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
        const r = (soma * 10) % 11;
        return r === 10 ? 0 : r;
    };
    return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
};

const formatarCpf = (c: string): string => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;

export interface OperadorCriado {
    usuarioId: string;
    cpf: string;
    /** Caminho RELATIVO do arquivo com o 2FA, dentro da pasta do servidor. */
    arquivo: string;
}

export class OperadorService {
    public pasta(): string {
        return process.env.OPERADOR_2FA_DIR || PASTA_PADRAO;
    }

    public async criar(appId: number, cpfBruto: string): Promise<OperadorCriado> {
        if (!cpfValido(cpfBruto)) throw Object.assign(new Error('CPF inválido.'), { code: 'VALIDATION' });
        const cpf = cpfBruto.replace(/\D/g, '');

        const [app] = await db.select({ id: aplicativos.id, nome: aplicativos.nome, cpf: aplicativos.aparelhoConfiavel })
            .from(aplicativos).where(eq(aplicativos.id, appId)).limit(1);
        if (!app) throw Object.assign(new Error('A app informada não existe.'), { code: 'RELATION_ERROR' });
        // Só app de login por CPF (hoje a Sul): em outro app o operador entra por e-mail.
        if (!app.cpf) throw Object.assign(new Error('Este aplicativo não usa login por CPF.'), { code: 'VALIDATION' });

        // Importação tardia: o index reexporta este arquivo.
        const { UserService } = await import('./index');
        const criado = await new UserService().addUser({
            app_id: String(appId),
            nome: `Operador ${formatarCpf(cpf)}`,
            email: cpf,
            password: cpf,
            role: 'operador',
        });
        const usuarioId = String(criado.user.id);

        const dois = await twoFactorService.provisionarAtivo(usuarioId);
        const arquivo = this.gravar(app.nome, cpf, dois);
        return { usuarioId, cpf, arquivo };
    }

    private gravar(appNome: string, cpf: string, dois: { secret: string; otpauthUri: string; backupCodes: string[] }): string {
        const pasta = this.pasta();
        fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
        const nome = `${cpf}.txt`;
        const destino = path.join(pasta, nome);
        const texto = [
            `Operador ${appNome} — CPF ${formatarCpf(cpf)}`,
            `Criado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            '',
            'Entrada: CPF + CPF (a senha inicial é o próprio CPF) + código do Google Authenticator.',
            '',
            `Segredo do Google Authenticator (base32): ${dois.secret}`,
            `Endereço otpauth (para QR Code): ${dois.otpauthUri}`,
            '',
            'Códigos de recuperação (uso único):',
            ...dois.backupCodes.map((c) => `  ${c}`),
            '',
        ].join('\n');
        fs.writeFileSync(destino, texto, { mode: 0o600 });
        // O processo roda como root no container; o arquivo vai para o dono da pasta
        // do projeto, para quem administra o servidor conseguir ler.
        try {
            const dono = fs.statSync(path.dirname(pasta));
            fs.chownSync(pasta, dono.uid, dono.gid);
            fs.chownSync(destino, dono.uid, dono.gid);
        } catch { /* sem permissão para trocar o dono: o arquivo fica como está */ }
        return path.posix.join('2fa-operador', nome);
    }
}

export const operadorService = new OperadorService();
