import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { buildInviteEmail } from './templates/inviteEmail';
import jwt from 'jsonwebtoken';
import { db } from '@loginhub/database';
import { aplicativos, usuarios, niveisAcesso, usuarios2fa } from '@loginhub/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { emailService } from './EmailService';
import { twoFactorService } from './TwoFactorService';

export { TwoFactorService, twoFactorService } from './TwoFactorService';
import {
    LoginInputDTO,
    LoginResponseDTO,
    JWTPayload,
    UserRole,
    CreateAppDTO,
    UpdateAppDTO,
    CreateUserDTO,
    UpdateUserDTO,
    TwoFactorChallengeResponse,
    TwoFactorSetupRequiredResponse,
    SetupPasswordResponse,
    User as UserResponse,
    MASTER_LOGIN_EMAIL,
    MASTER_SUB,
    masterKeyFingerprint,
    masterKeyDoAmbiente
} from '@loginhub/schema';

// ==========================================
// MAGIC LINK
// ==========================================

/**
 * Validade do Magic Link (convite e reset).
 *
 * Era 1h — curto demais na prática: convite enviado à noite chegava morto pela
 * manhã. O link continua sendo de uso único (ver `passwordFingerprint`), então
 * esticar o prazo não afrouxa a garantia, só para de queimar convite.
 */
const MAGIC_LINK_TTL = '24h';

/**
 * Validade do token de desafio emitido entre a senha e o segundo fator.
 *
 * Curto de propósito: ele não é sessão, é um passe para uma etapa só. Cinco
 * minutos cobrem digitar um código de 6 dígitos com folga, inclusive procurando
 * o celular.
 */
const CHALLENGE_TTL_SEGUNDOS = 300;

/**
 * Impressão digital do hash da senha, embutida no Magic Link como claim `pwf`.
 *
 * É o que garante o uso único: assim que a senha é definida o `senha_hash` muda,
 * a impressão para de bater e o link morre sozinho — sem coluna de controle e
 * sem escrita extra no banco.
 *
 * Substitui a flag `senha_padrao`, que era do *usuário* e não do *token*: dois
 * links abertos dividiam o mesmo estado, e um reset devolvia a flag para `true`,
 * ressuscitando um convite anterior que ainda não tinha expirado.
 */
const passwordFingerprint = (senhaHash: string): string =>
    crypto.createHash('sha256').update(senhaHash).digest('hex').slice(0, 16);

/**
 * Sessão do master, emitida pelo login e renovada pelo `/auth/refresh`.
 *
 * Um lugar só porque as duas pontas têm de produzir o MESMO payload: o
 * `adminMiddleware` autoriza pelo conjunto (`sub` 0 + role admin + `mk`
 * conferindo), e um refresh que devolvesse claim de menos revogaria a sessão
 * silenciosamente no request seguinte.
 *
 * A claim `mk` amarra a sessão à MASTER_API_KEY vigente — é o piso que o master
 * não tem em `usuarios_2fa.sessoes_validas_desde`, por não ter linha em
 * `usuarios`. Trocar a chave derruba toda sessão master já emitida.
 */
const emitirSessaoMaster = (masterKey: string): LoginResponseDTO => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("ERRO_INTERNO");

    const payload = {
        sub: MASTER_SUB,
        email: MASTER_LOGIN_EMAIL,
        app_id: "0",
        role: "admin",
        mk: masterKeyFingerprint(masterKey),
    };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: "24h" });

    return {
        token,
        expiresIn: 86400,
        usuario: {
            id: MASTER_SUB,
            nome: "Super Admin",
            email: MASTER_LOGIN_EMAIL,
            role: "admin"
        },
        app: {
            id: "0",
            nome: "LoginHub Central",
            status: "ativo"
        }
    };
};

// ==========================================
// 1. AUTH SERVICE
// ==========================================
export class AuthService {
    public async login(data: LoginInputDTO): Promise<LoginResponseDTO | TwoFactorChallengeResponse | TwoFactorSetupRequiredResponse> {
        // Mesmo e-mail pode existir em apps diferentes (unique composto).
        // Se o cliente passa app_id, filtra direto. Senão e houver ambiguidade, devolve a lista
        // de apps disponíveis para o cliente escolher.
        const baseSelect = {
            id: usuarios.id,
            nome: usuarios.nome,
            email: usuarios.email,
            senha_hash: usuarios.senhaHash,
            app_id: usuarios.appId,
            app_nome: aplicativos.nome,
            app_logo: aplicativos.logo,
            app_status: aplicativos.status,
            app_usa_login_hub: aplicativos.usaLoginHub,
            status: usuarios.status,
            role_nome: niveisAcesso.nome,
        };

        const whereClause = data.app_id
            ? and(eq(usuarios.email, data.email), eq(usuarios.appId, Number(data.app_id)))
            : eq(usuarios.email, data.email);

        const result = await db.select(baseSelect)
            .from(usuarios)
            .innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
            .innerJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
            .where(whereClause);

        const validKey = masterKeyDoAmbiente();
        const isMaster = validKey && data.password === validKey;

        if (isMaster && data.email === MASTER_LOGIN_EMAIL) {
            return emitirSessaoMaster(validKey);
        }
        
        if (result.length === 0) throw new Error("CREDENCIAIS_INVALIDAS");

        // Descobre qual conta corresponde à senha informada.
        // Como o e-mail é único por app (não global), o mesmo e-mail pode aparecer
        // em vários apps. Em vez de exigir app_id do cliente, desambiguamos pela senha:
        // o app correto é aquele cujo hash bate. Assim o login continua funcionando
        // "como sempre foi" para clientes que mandam apenas e-mail + senha.
        const matches: typeof result = [];
        for (const candidate of result) {
            if (await bcrypt.compare(data.password, candidate.senha_hash)) {
                matches.push(candidate);
            }
        }

        // Nenhuma senha bate → credenciais inválidas (não revela que o e-mail existe).
        if (matches.length === 0) throw new Error('CREDENCIAIS_INVALIDAS');

        // Senha idêntica em mais de um app → aí sim é genuinamente ambíguo:
        // o cliente precisa escolher qual app quer acessar (reenviar com app_id).
        if (matches.length > 1) {
            const ambig = new Error('AMBIGUOUS_EMAIL') as Error & { availableApps?: Array<{ id: string; nome: string; logo: string | null }> };
            ambig.availableApps = matches.map((r: typeof matches[0]) => ({
                id: r.app_id ? r.app_id.toString() : '0',
                nome: r.app_nome,
                logo: r.app_logo ?? null,
            }));
            throw ambig;
        }

        const user = matches[0];
        if (user.app_status !== 'ativo') throw new Error('APP_BLOQUEADO');
        if (user.status !== 'ativo') throw new Error('USUARIO_BLOQUEADO');
        // App que só recebe convite não autentica aqui. Recusar é mais
        // restritivo que o comportamento antigo, não menos: como essas contas
        // não têm 2FA enrolado, `estadoDoLogin` devolveria 'sessao' e elas
        // entrariam SEM segundo fator se alguém lhes desse uma senha (um reset
        // administrativo basta). Ver db/004_apps_sem_login_hub.sql.
        if (user.app_usa_login_hub === false) throw new Error('APP_NAO_AUTENTICA_NO_HUB');

        // Senha conferiu — mas isso pode não bastar.
        const estado = await twoFactorService.estadoDoLogin(user.id.toString());
        const appId = user.app_id ? user.app_id.toString() : '0';

        // 2FA ativo: o JWT de sessão NÃO sai daqui. O cliente recebe um desafio
        // de vida curta e só troca por sessão depois de provar o segundo fator.
        if (estado === 'desafio') return this.emitirChallenge(user.id.toString(), appId);

        // 2FA exigido pelo convite e nunca configurado (alguém abandonou o
        // convite no meio). Devolvemos uma sessão curta só para concluir o
        // enrolamento, em vez de barrar sem saída.
        if (estado === 'enrolar') return this.emitirTokenDeEnrolamento(user.id.toString(), user.email, appId, user.role_nome);

        return this.emitirSessao(user);
    }

    /**
     * Sessão curta para concluir um enrolamento pendente.
     *
     * É um JWT normal, de 10 minutos. Hoje o `authMiddleware` só protege as
     * rotas de 2FA, então na prática ele não abre mais nada — se outras rotas
     * passarem a usá-lo, isto aqui precisa virar um token com escopo próprio.
     */
    private emitirTokenDeEnrolamento(
        usuarioId: string,
        email: string,
        appId: string,
        role: string | null,
    ): TwoFactorSetupRequiredResponse {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET missing in .env");
            throw new Error('ERRO_INTERNO');
        }

        const payload: JWTPayload = { sub: usuarioId, email, app_id: appId, role: role || 'user' };
        return {
            require2FASetup: true,
            // `action` marca o passe como de etapa única: o `authMiddleware` (que
            // guarda as rotas de 2FA) ignora a claim, mas o `/auth/refresh` a
            // recusa — senão dez minutos de enrolamento viravam 24h de sessão.
            setupToken: jwt.sign({ ...payload, action: '2fa-setup' }, jwtSecret, { expiresIn: 600 }),
            expiresIn: 600,
        };
    }

    /**
     * Monta o JWT de 24h e marca o acesso.
     *
     * `ultimo_acesso` é atualizado aqui e não na conferência da senha: com 2FA
     * ativo, senha certa e segundo fator errado não é login nenhum, e registrar
     * o acesso ali dentro contaria tentativa incompleta como sessão.
     */
    private async emitirSessao(user: {
        id: number;
        nome: string;
        email: string;
        app_id: number | null;
        app_nome: string;
        app_status: string | null;
        role_nome: string | null;
    }, ttlSegundos: number = 86400): Promise<LoginResponseDTO> {
        db.update(usuarios)
          .set({ ultimoAcesso: new Date() })
          .where(eq(usuarios.id, user.id))
          .execute()
          .catch((err: Error) => console.error('[AuthService] Update last_login failed:', err));

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET missing in .env");
            throw new Error('ERRO_INTERNO');
        }

        const payload: JWTPayload = {
            sub: user.id.toString(),
            email: user.email,
            app_id: user.app_id ? user.app_id.toString() : "0",
            role: user.role_nome || 'user'
        };

        const token = jwt.sign(payload, jwtSecret, { expiresIn: ttlSegundos });

        return {
            token,
            expiresIn: ttlSegundos,
            usuario: {
                id: user.id.toString(),
                nome: user.nome,
                email: user.email,
                role: user.role_nome as UserRole
            },
            app: {
                id: user.app_id ? user.app_id.toString() : "0",
                nome: user.app_nome,
                status: user.app_status || 'ativo'
            }
        };
    }

    /** Passe de etapa única para a verificação de 2FA. Não abre nenhuma rota. */
    private emitirChallenge(usuarioId: string, appId: string): TwoFactorChallengeResponse {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET missing in .env");
            throw new Error('ERRO_INTERNO');
        }

        const challengeToken = jwt.sign(
            { sub: usuarioId, app_id: appId, action: '2fa-challenge' },
            jwtSecret,
            { expiresIn: CHALLENGE_TTL_SEGUNDOS },
        );

        return {
            requires2FA: true,
            challengeToken,
            expiresIn: CHALLENGE_TTL_SEGUNDOS,
            methods: ['totp', 'backup'],
        };
    }

    /**
     * Abre sessão para um usuário já autenticado por outro meio.
     *
     * Usado ao concluir o enrolamento de 2FA: o corte de sessões acabou de
     * invalidar o token em uso, e sem um novo o cliente ficaria órfão no meio
     * do fluxo.
     */
    public async emitirSessaoParaUsuario(usuarioId: string): Promise<LoginResponseDTO> {
        const linhas = await db.select({
            id: usuarios.id,
            nome: usuarios.nome,
            email: usuarios.email,
            app_id: usuarios.appId,
            app_nome: aplicativos.nome,
            app_status: aplicativos.status,
            app_usa_login_hub: aplicativos.usaLoginHub,
            status: usuarios.status,
            role_nome: niveisAcesso.nome,
        })
        .from(usuarios)
        .innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
        .innerJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
        .where(eq(usuarios.id, Number(usuarioId)))
        .limit(1);

        const user = linhas[0];
        if (!user) throw new Error('USUARIO_INVALIDO');
        if (user.app_status !== 'ativo') throw new Error('APP_BLOQUEADO');
        if (user.status !== 'ativo') throw new Error('USUARIO_BLOQUEADO');
        // Mesma recusa do login: este caminho tambem emite sessao.
        if (user.app_usa_login_hub === false) throw new Error('APP_NAO_AUTENTICA_NO_HUB');

        return this.emitirSessao(user);
    }

    /**
     * Sessao DELEGADA para um servico confiavel (ex.: o bot de Telegram do app).
     *
     * O bot autenticou o usuario no hub UMA vez, no vinculo, e desde entao age
     * em nome dele pela ligacao `telegram_id -> loginhub_id` guardada no proprio
     * app. Esta rota troca essa confianca por um JWT de usuario CURTO e NORMAL —
     * que o app cliente valida pela guarda de sempre (assinatura, tenant, piso de
     * revogacao) — no lugar do `x-user-id` confiado cego. Fecha a delegacao cega
     * sem o bot guardar credencial (ele nao pode: um processo atende N chats).
     *
     * Exige 2FA ATIVO: sessao so nasce apos o segundo fator, e delegar para uma
     * conta sem enrolamento furaria a regra de 2FA obrigatorio.
     */
    public async emitirSessaoDelegada(
        usuarioId: string,
        opts: { ttlSegundos?: number; appsPermitidos?: number[]; exige2fa?: boolean } = {},
    ): Promise<LoginResponseDTO> {
        const linhas = await db.select({
            id: usuarios.id,
            nome: usuarios.nome,
            email: usuarios.email,
            app_id: usuarios.appId,
            app_nome: aplicativos.nome,
            app_status: aplicativos.status,
            status: usuarios.status,
            role_nome: niveisAcesso.nome,
        })
        .from(usuarios)
        .innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
        .innerJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
        .where(eq(usuarios.id, Number(usuarioId)))
        .limit(1);

        const user = linhas[0];
        if (!user) throw new Error('USUARIO_INVALIDO');
        if (user.app_status !== 'ativo') throw new Error('APP_BLOQUEADO');
        if (user.status !== 'ativo') throw new Error('USUARIO_BLOQUEADO');

        // A chave de delegacao pode ser restrita a certos apps: se vazar, so
        // serve para o app do bot, nao para o ecossistema inteiro.
        if (opts.appsPermitidos && opts.appsPermitidos.length > 0) {
            const appId = user.app_id ?? 0;
            if (!opts.appsPermitidos.includes(appId)) throw new Error('APP_NAO_PERMITIDO');
        }

        // 2FA no delegado e OPT-IN (HUB_DELEGATION_REQUIRE_2FA): as contas atuais
        // do ecossistema ainda nao enrolaram e o caminho legado nunca checou —
        // exigir aqui de saida quebraria o bot. Ligue quando todos tiverem 2FA.
        if (opts.exige2fa && !(await twoFactorService.estaAtivo(String(user.id)))) {
            throw new Error('DOIS_FATORES_AUSENTE');
        }

        return this.emitirSessao(user, opts.ttlSegundos ?? 600);
    }

    /**
     * Segunda etapa: troca o desafio por sessão de verdade.
     *
     * Aceita código do autenticador ou código de recuperação. Os status de
     * usuário e app são revalidados aqui — entre a senha e o segundo fator o
     * acesso pode ter sido revogado.
     */
    public async verificarSegundoFator(
        challengeToken: string,
        entrada: { codigo?: string; backupCode?: string },
    ): Promise<LoginResponseDTO> {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET missing in .env");
            throw new Error('ERRO_INTERNO');
        }

        let decoded: { sub?: string; action?: string };
        try {
            decoded = jwt.verify(challengeToken, jwtSecret) as typeof decoded;
        } catch {
            throw new Error('CHALLENGE_INVALIDO');
        }
        if (decoded.action !== '2fa-challenge' || !decoded.sub) throw new Error('CHALLENGE_INVALIDO');

        if (entrada.backupCode) {
            await twoFactorService.consumirBackupCode(decoded.sub, entrada.backupCode);
        } else if (entrada.codigo) {
            await twoFactorService.verificarCodigo(decoded.sub, entrada.codigo);
        } else {
            throw new Error('CODIGO_AUSENTE');
        }

        const linhas = await db.select({
            id: usuarios.id,
            nome: usuarios.nome,
            email: usuarios.email,
            app_id: usuarios.appId,
            app_nome: aplicativos.nome,
            app_status: aplicativos.status,
            status: usuarios.status,
            role_nome: niveisAcesso.nome,
        })
        .from(usuarios)
        .innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
        .innerJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
        .where(eq(usuarios.id, Number(decoded.sub)))
        .limit(1);

        const user = linhas[0];
        if (!user) throw new Error('USUARIO_INVALIDO');
        if (user.app_status !== 'ativo') throw new Error('APP_BLOQUEADO');
        if (user.status !== 'ativo') throw new Error('USUARIO_BLOQUEADO');

        return this.emitirSessao(user);
    }

    public async logout(token: string | undefined): Promise<void> {
        if (!token) return;
    }

    /**
     * Piso de sessão de uma conta — para os apps clientes enxergarem revogação.
     *
     * O app cliente valida assinatura, `action` e tenant sozinho, com o
     * `hubAuthServer`, sem tocar a rede. O que ele NÃO tem como saber é que a
     * ativação do 2FA (ou um reset administrativo) carimbou um instante a partir
     * do qual só valem tokens novos: esse carimbo mora no banco do hub.
     *
     * Sem esta rota, um token emitido antes do corte seguia aceito pelos apps
     * até expirar — 24 h de janela — mesmo com o hub já o recusando.
     *
     * Autentica com o PRÓPRIO token em questão: o `sub` sai de dentro dele, e
     * por isso ninguém consegue varrer o piso de terceiros. A assinatura é
     * conferida, mas expiração e piso NÃO são — a pergunta aqui é justamente
     * "este token ainda vale?", e responder 401 seria circular.
     */
    public async pisoDeSessao(token: string): Promise<{ sub: string; piso: string | null }> {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) throw new Error('CONFIG_AUSENTE');

        let decoded: JWTPayload;
        try {
            decoded = jwt.verify(token, jwtSecret, { ignoreExpiration: true }) as JWTPayload;
        } catch {
            throw new Error('TOKEN_INVALIDO');
        }
        if (!decoded.sub) throw new Error('TOKEN_INVALIDO');

        const rows = await db.select({ sessoesValidasDesde: usuarios2fa.sessoesValidasDesde })
            .from(usuarios2fa)
            .where(eq(usuarios2fa.usuarioId, Number(decoded.sub)))
            .limit(1);

        const piso = rows[0]?.sessoesValidasDesde ?? null;
        return { sub: String(decoded.sub), piso: piso ? piso.toISOString() : null };
    }

    public async refreshToken(oldToken: string): Promise<LoginResponseDTO> {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET missing in .env");
            throw new Error('ERRO_INTERNO');
        }

        // Aceita tokens válidos OU recém-expirados (grace period de 7 dias)
        let decoded: JWTPayload & { exp?: number; iat?: number; action?: string };
        try {
            decoded = jwt.verify(oldToken, jwtSecret, { ignoreExpiration: true }) as typeof decoded;
        } catch {
            throw new Error('TOKEN_INVALIDO');
        }

        // Só SESSÃO se renova. Todo token com `action` é passe de etapa única —
        // magic link (`setup-password`), desafio de 2FA (`2fa-challenge`),
        // enrolamento (`2fa-setup`) — e trocá-lo por sessão aqui anularia a
        // etapa que ele estava guardando: no caso do desafio, seria bypass do
        // segundo fator; no do magic link, sessão sem nunca definir a senha.
        if (decoded.action) {
            throw new Error('TOKEN_INVALIDO');
        }

        const GRACE_SECONDS = 7 * 24 * 60 * 60;
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp && now - decoded.exp > GRACE_SECONDS) {
            throw new Error('TOKEN_EXPIRADO');
        }

        // Master: renova sem tocar no banco, porque ele não está lá.
        //
        // Antes deste ramo, a sessão master caía em `USUARIO_INVALIDO` na
        // revalidação abaixo (`usuarios.id = 0` não existe) e nunca renovava —
        // o painel não sentia só porque mandava a MASTER_API_KEY crua em todo
        // request, que era exatamente o vazamento que este trabalho fechou.
        // Sem renovação, o painel passaria a pedir a chave a cada 24h.
        //
        // O que substitui a revalidação: a claim `mk` tem de continuar batendo
        // com a chave em vigor. Trocar a MASTER_API_KEY invalida na hora toda
        // sessão master emitida antes — é o equivalente ao piso de sessão que as
        // contas normais têm em `usuarios_2fa`.
        if (decoded.sub === MASTER_SUB && decoded.email === MASTER_LOGIN_EMAIL) {
            const masterKey = masterKeyDoAmbiente();
            if (!masterKey) throw new Error('ERRO_INTERNO');
            if (decoded.mk !== masterKeyFingerprint(masterKey)) {
                throw new Error('SESSAO_REVOGADA');
            }
            return emitirSessaoMaster(masterKey);
        }

        // Piso de sessão: o `authMiddleware` já recusa token anterior ao corte,
        // mas o refresh não passa por ele. Sem esta checagem uma sessão revogada
        // pela ativação do 2FA se lavaria aqui, virando token novo e limpo.
        const doisFatoresRows = await db.select({ sessoesValidasDesde: usuarios2fa.sessoesValidasDesde })
            .from(usuarios2fa)
            .where(eq(usuarios2fa.usuarioId, Number(decoded.sub)))
            .limit(1);

        const piso = doisFatoresRows[0]?.sessoesValidasDesde;
        if (piso && decoded.iat && decoded.iat < Math.floor(piso.getTime() / 1000)) {
            throw new Error('SESSAO_REVOGADA');
        }

        // Revalida usuário e status do app
        const result = await db.select({
            id: usuarios.id,
            nome: usuarios.nome,
            email: usuarios.email,
            app_id: usuarios.appId,
            app_nome: aplicativos.nome,
            app_status: aplicativos.status,
            status: usuarios.status,
            role_nome: niveisAcesso.nome
        })
        .from(usuarios)
        .innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
        .innerJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
        .where(eq(usuarios.id, Number(decoded.sub)))
        .limit(1);

        const user = result[0];
        if (!user) throw new Error('USUARIO_INVALIDO');
        if (user.app_status !== 'ativo') throw new Error('APP_BLOQUEADO');
        if (user.status !== 'ativo') throw new Error('USUARIO_BLOQUEADO');

        const payload: JWTPayload = {
            sub: user.id.toString(),
            email: user.email,
            app_id: user.app_id ? user.app_id.toString() : "0",
            role: user.role_nome || 'user'
        };

        const token = jwt.sign(payload, jwtSecret, { expiresIn: '24h' });

        return {
            token,
            expiresIn: 86400,
            usuario: {
                id: user.id.toString(),
                nome: user.nome,
                email: user.email,
                role: user.role_nome as UserRole
            },
            app: {
                id: user.app_id ? user.app_id.toString() : "0",
                nome: user.app_nome,
                status: user.app_status || 'ativo'
            }
        };
    }

    public async changePassword(userId: string, novaSenha: string): Promise<void> {
        const userRes = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, Number(userId))).limit(1);
        if (userRes.length === 0) throw new Error('Usuário não encontrado.');
        
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(novaSenha, salt);
        
        await db.update(usuarios)
            .set({ senhaHash })
            .where(eq(usuarios.id, Number(userId)));
    }

    /**
     * Consome um Magic Link e define a senha do usuário.
     *
     * O uso único vem da impressão digital do `senha_hash` que o token carrega
     * (`pwf`): ela precisa continuar batendo com o hash vigente. Token sem `pwf`
     * é recusado — os links do formato antigo tinham 1h de validade, então
     * nenhum deles sobrevive a este deploy.
     */
    public async setupPasswordFromMagicLink(token: string, novaSenha: string): Promise<SetupPasswordResponse> {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET missing in .env");
            throw new Error('ERRO_INTERNO');
        }

        let decoded: { sub?: string | number; action?: string; pwf?: string };
        try {
            decoded = jwt.verify(token, jwtSecret) as typeof decoded;
        } catch {
            throw new Error('TOKEN_INVALIDO');
        }

        if (decoded.action !== 'setup-password') throw new Error('ACAO_INVALIDA');

        // Tudo o que pode falhar acontece ANTES de gravar a senha. A gravação
        // mata o link (o `pwf` deixa de bater), então um erro depois dela deixa
        // a pessoa sem senha nova E sem link — sem retentativa possível.
        const linhas = await db.select({
            id: usuarios.id,
            nome: usuarios.nome,
            email: usuarios.email,
            senha_hash: usuarios.senhaHash,
            app_id: usuarios.appId,
            app_nome: aplicativos.nome,
            app_status: aplicativos.status,
            role_nome: niveisAcesso.nome,
        })
        .from(usuarios)
        .innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
        .innerJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
        .where(eq(usuarios.id, Number(decoded.sub)))
        .limit(1);

        const conta = linhas[0];
        if (!conta) throw new Error('USUARIO_NAO_ENCONTRADO');

        if (!decoded.pwf || decoded.pwf !== passwordFingerprint(conta.senha_hash)) {
            throw new Error('LINK_JA_UTILIZADO');
        }

        // Lido antes da troca: o estado do 2FA não muda com a senha, e assim a
        // consulta não fica no trecho onde uma falha já custaria o link.
        const estado = await twoFactorService.estadoDoLogin(String(decoded.sub));

        await this.changePassword(String(decoded.sub), novaSenha);

        const appId = conta.app_id ? conta.app_id.toString() : '0';

        // 2FA ativo: o magic link prova posse do e-mail, não do segundo fator.
        // Emitir sessão aqui faria do reset de senha um atalho para pular o
        // TOTP — quem controlasse a caixa de entrada (ou um admin disparando
        // reset) entraria sem nunca tocar no autenticador. O desafio é o mesmo
        // que o login devolve; o cliente fecha em `/auth/2fa/verify`.
        if (estado === 'desafio') {
            const desafio = this.emitirChallenge(String(conta.id), appId);
            return {
                message: 'Senha definida. Confirme o código do autenticador para entrar.',
                expiresIn: desafio.expiresIn,
                require2FASetup: false,
                requires2FA: true,
                challengeToken: desafio.challengeToken,
                methods: desafio.methods,
            };
        }

        // Enrolamento pendente: passe de etapa única, NÃO sessão de 24h. A
        // página emenda direto no QR com ele, e ele não sobrevive ao
        // `/auth/refresh` — abandonar o convite no meio não pode virar um dia
        // de acesso (renovável por mais sete) sem segundo fator nenhum.
        if (estado === 'enrolar') {
            const passe = this.emitirTokenDeEnrolamento(String(conta.id), conta.email, appId, conta.role_nome);
            return {
                message: 'Senha definida. Falta configurar a verificação em duas etapas.',
                token: passe.setupToken,
                expiresIn: passe.expiresIn,
                require2FASetup: true,
            };
        }

        // Sem pendência de 2FA: sessão normal. Quem acabou de usar o magic link
        // já controla a conta, então isto não concede nada que ele não tivesse.
        const sessao = await this.emitirSessao(conta);

        return {
            message: 'Senha definida com sucesso.',
            token: sessao.token,
            expiresIn: sessao.expiresIn,
            require2FASetup: false,
        };
    }
}

/**
 * URL base sem barra no fim.
 *
 * `platform_url` e `bot_url` sao BASES: quem consome sempre concatena um
 * caminho (`/setup-password`, `/login`). Com a barra cadastrada, o resultado
 * era `//setup-password` — que o nginx dos apps atende com 200 (devolve o SPA)
 * mas o Vue Router NAO casa: o guard manda para /login e a pessoa ve a tela de
 * login em vez do formulario de senha, sem erro nenhum.
 *
 * Metade dos apps tinha a barra cadastrada, e a diferenca era invisivel no
 * painel. Normalizar na ESCRITA e o que impede de voltar — os `replace` nos
 * templates e no envio do e-mail sao rede de seguranca, nao a regra.
 */
const urlBase = (v?: string | null): string | null => {
    const limpo = (v ?? '').trim().replace(/\/+$/, '');
    return limpo || null;
};

// ==========================================
// 2. APP SERVICE
// ==========================================
export class AppService {
    public async registerApp(data: CreateAppDTO) {
        try {
            return await db.transaction(async (tx: any) => {
                const appRes = await tx.insert(aplicativos).values({
                    nome: data.nome,
                    documento: data.documento,
                    email: data.email,
                    telefone: data.telefone || null,
                    logo: data.logo || null,
                    botUrl: urlBase(data.bot_url),
                    platformUrl: urlBase(data.platform_url),
                }).returning({ id: aplicativos.id });

                const appId = appRes[0].id;

                if (data.admin_email && data.password) {
                    const salt = await bcrypt.genSalt(10);
                    const passwordHash = await bcrypt.hash(data.password, salt);

                    const roleRes = await tx.select({ id: niveisAcesso.id }).from(niveisAcesso).where(eq(niveisAcesso.nome, 'admin')).limit(1);
                    let roleId = roleRes.length > 0 ? roleRes[0].id : null;
                    
                    if (!roleId) {
                         const fallbackRole = await tx.insert(niveisAcesso).values({ nome: 'admin' }).returning({ id: niveisAcesso.id });
                         roleId = fallbackRole[0].id;
                    }

                    const adminRes = await tx.insert(usuarios).values({
                        appId: appId,
                        nivelAcessoId: roleId,
                        nome: data.admin_nome || 'Administrador',
                        email: data.admin_email,
                        senhaHash: passwordHash,
                        telefone: data.admin_telefone || null
                    }).returning({ id: usuarios.id });

                    // Mesma regra das demais contas: 2FA exigido desde o início.
                    await tx.insert(usuarios2fa).values({
                        usuarioId: adminRes[0].id,
                        secretCifrado: null,
                        ativo: false,
                        obrigatorio: true,
                    });

                    if (data.emailHtml) {
                        await emailService.sendEmail(
                            data.admin_email,
                            `Boas-vindas ao ${data.nome}`,
                            data.emailHtml,
                            { appId, appNome: data.nome },
                        );
                    }
                }

                return {
                    appId,
                    nome: data.nome,
                    documento: data.documento,
                    email: data.email,
                    adminEmail: data.admin_email,
                    message: 'Aplicativo criado com sucesso'
                };
            });
        } catch (error: any) {
            if (error.code === '23505') throw Object.assign(new Error('Documento (CNPJ) ou E-mail já estão em uso.'), { code: 'DUPLICATE_ENTRY' });
            throw error;
        }
    }

    public async getAllApps() {
        const rows = await db.select().from(aplicativos);
        const allUsers = await db.select({ appId: usuarios.appId }).from(usuarios);

        return rows.map((row: typeof rows[0]) => {
            const total_usuarios = allUsers.filter((u: typeof allUsers[0]) => u.appId === row.id).length;
            return {
                ...row,
                data_cadastro: row.dataCadastro,
                data_atualizacao: row.dataAtualizacao,
                bot_url: row.botUrl,
                platform_url: row.platformUrl,
                total_usuarios
            };
        });
    }

    public async getAppById(id: string) {
        const rows = await db.select().from(aplicativos).where(eq(aplicativos.id, Number(id))).limit(1);
        if (rows.length === 0) {
            const error = new Error('Aplicativo não encontrada');
            (error as any).code = 'NOT_FOUND';
            throw error;
        }

        const allUsers = await db.select({ appId: usuarios.appId }).from(usuarios).where(eq(usuarios.appId, Number(id)));

        return {
            ...rows[0],
            data_cadastro: rows[0].dataCadastro,
            data_atualizacao: rows[0].dataAtualizacao,
            bot_url: rows[0].botUrl,
            platform_url: rows[0].platformUrl,
            total_usuarios: allUsers.length
        };
    }

    public async updateApp(id: string, data: UpdateAppDTO) {
        try {
            const updateData: any = {};
            if (data.nome !== undefined) updateData.nome = data.nome;
            if (data.email !== undefined) updateData.email = data.email;
            if (data.documento !== undefined) updateData.documento = data.documento;
            if (data.telefone !== undefined) updateData.telefone = data.telefone || null;
            if (data.logo !== undefined) updateData.logo = data.logo || null;
            if (data.bot_url !== undefined) updateData.botUrl = urlBase(data.bot_url);
            if (data.platform_url !== undefined) updateData.platformUrl = urlBase(data.platform_url);

            if (Object.keys(updateData).length === 0) return null;

            const rows = await db.update(aplicativos)
                .set(updateData)
                .where(eq(aplicativos.id, Number(id)))
                .returning();

            if (rows.length === 0) {
                const error = new Error('Aplicativo não encontrada');
                (error as any).code = 'NOT_FOUND';
                throw error;
            }
            return rows[0];

        } catch (error: any) {
            if (error.code === '23505') {
                const newError = new Error('Documento (CNPJ) ou E-mail já estão em uso por outra app.');
                (newError as any).code = 'DUPLICATE_ENTRY';
                throw newError;
            }
            throw error;
        }
    }

    public async updateAppStatus(id: string, status: 'ativo' | 'inativo') {
        const rows = await db.update(aplicativos)
            .set({ status })
            .where(eq(aplicativos.id, Number(id)))
            .returning();

        if (rows.length === 0) throw Object.assign(new Error('Aplicativo não encontrada'), { code: 'NOT_FOUND' });
        return rows[0];
    }

    public async deleteApp(id: string) {
        const rows = await db.delete(aplicativos).where(eq(aplicativos.id, Number(id))).returning();
        if (rows.length === 0) throw Object.assign(new Error('Aplicativo não encontrada'), { code: 'NOT_FOUND' });
    }
}

/**
 * Ultima barreira contra `//setup-password` no link do magic link.
 *
 * O HTML do convite e do reset e renderizado NO NAVEGADOR do admin (a UI monta
 * o template e manda pronto). Isso significa que uma correcao no template so
 * vale para quem recarregou o painel — e um navegador com modulo em cache
 * continua produzindo o link quebrado, sem ninguem perceber.
 *
 * A barra dupla nasce de `platform_url` cadastrada com `/` no fim. O nginx dos
 * apps devolve o SPA em qualquer caminho (200, parece certo), mas o Vue Router
 * NAO casa `//setup-password` com a rota `/setup-password`: o guard manda para
 * /login e a pessoa ve a tela de login em vez do formulario de senha.
 *
 * Normalizar aqui fecha o caso de vez, porque o servidor e o unico ponto que
 * nao da para servir de cache. O `[^:]` preserva o `https://` do inicio.
 */
const normalizarBarraDupla = (html: string): string =>
    html.replace(/([^:])\/\/+setup-password/g, '$1/setup-password');

// ==========================================
// 3. USER SERVICE
// ==========================================
export class UserService {
    public async addUser(data: CreateUserDTO): Promise<{ magicLinkToken?: string; emailSent: boolean; user: { id: string; nome: string; email: string; app_id: string; role: string } }> {
        if (!data.app_id) throw Object.assign(new Error('Aplicativo é obrigatória'), { code: 'VALIDATION' });
        if (!data.email) throw Object.assign(new Error('E-mail é obrigatório'), { code: 'VALIDATION' });

        const roleName = data.role || 'user';
        const roleRes = await db.select({ id: niveisAcesso.id }).from(niveisAcesso).where(eq(niveisAcesso.nome, roleName)).limit(1);

        if (roleRes.length === 0) throw Object.assign(new Error(`Nível de acesso '${roleName}' inválido.`), { code: 'VALIDATION' });

        const roleId = roleRes[0].id;

        let isGeneratingMagicLink = false;
        let passwordToHash = data.password;

        if (!passwordToHash) {
            isGeneratingMagicLink = true;
            // Placeholder: a senha real é definida pelo usuário via magic link.
            // Ainda assim é uma senha válida da conta até lá, então vem do CSPRNG
            // — `Math.random()` não serve para credencial.
            passwordToHash = crypto.randomBytes(32).toString('hex');
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(passwordToHash, salt);

        try {
            const insertedUser = await db.insert(usuarios).values({
                appId: Number(data.app_id),
                nivelAcessoId: roleId,
                nome: data.nome || '',
                email: data.email,
                senhaHash: passwordHash,
                telefone: data.telefone || null
            }).returning({ id: usuarios.id });

            const newUserId = insertedUser[0].id;

            // 2FA é exigido de toda conta que FAZ LOGIN aqui. A linha nasce
            // marcando a obrigação; o secret só aparece quando a pessoa abre o
            // convite e escaneia o QR.
            //
            // A exceção não é "app dispensado do 2FA": é app que não autentica
            // pelo hub (`usa_login_hub = false`, hoje só o Cofre). Marcar essas
            // contas produzia um "2FA pendente" que nunca resolvia, porque a
            // pessoa jamais passa pelo login daqui — e um estado pendente eterno
            // no painel sugere uma proteção que não existe. O `login` recusa
            // essas contas de saída, então não há sessão sem segundo fator.
            const appDoUsuario = await db
                .select({ usaLoginHub: aplicativos.usaLoginHub })
                .from(aplicativos)
                .where(eq(aplicativos.id, Number(data.app_id)))
                .limit(1);

            if (appDoUsuario[0]?.usaLoginHub !== false) {
                await twoFactorService.marcarObrigatorio(String(newUserId));
            }

            let magicLinkToken: string | undefined = undefined;

            if (isGeneratingMagicLink) {
                const jwtSecret = process.env.JWT_SECRET;
                if (!jwtSecret) {
                    console.error("JWT_SECRET missing in .env");
                }
                // `app_id` no passe de convite: o hub resolve o tenant pelo
                // `sub` e não precisaria dele, mas os APPS CLIENTES precisam.
                // Sem esta claim, um app que aceita o convite como autorização
                // não tem como saber de qual tenant ele veio — e um convite do
                // MoneyAPP abriria conta no Cofre, já que todos os passes são
                // assinados com o mesmo JWT_SECRET. Aditivo: quem não conhece
                // a claim ignora, e o /auth/setup-password daqui lê só
                // sub/action/pwf.
                magicLinkToken = jwt.sign(
                    {
                        sub: newUserId,
                        action: 'setup-password',
                        email: data.email,
                        app_id: String(data.app_id),
                        pwf: passwordFingerprint(passwordHash),
                    },
                    jwtSecret || 'secret',
                    { expiresIn: MAGIC_LINK_TTL },
                );
            }

            let emailSent = false;
            if (magicLinkToken) {
                const appRow = await db
                    .select({ nome: aplicativos.nome, logo: aplicativos.logo, platformUrl: aplicativos.platformUrl })
                    .from(aplicativos)
                    .where(eq(aplicativos.id, Number(data.app_id)))
                    .limit(1);
                const app = appRow[0];
                const appName = app?.nome || 'nosso sistema';

                // Quem manda `emailHtml` continua mandando (é o caso da UI, que
                // renderiza os templates React dela). Sem isso, o convite usa o
                // template padrão daqui — antes o e-mail simplesmente não saía.
                // Sem `platform_url`, o botão aponta para o PRÓPRIO hub: a tela
                // `/setup-password` dele serve qualquer tenant, e é a única que
                // alguns apps têm (o Editores-Web é um proxy de VNC, não hospeda
                // formulário de senha nenhum). Antes, esses convites simplesmente
                // não saíam.
                const destino = app?.platformUrl || process.env.UI_PUBLIC_URL || '';
                const html = data.emailHtml
                    || (destino
                        ? buildInviteEmail({
                            appName,
                            platformUrl: destino,
                            appLogo: app?.logo ?? null,
                            nome: data.nome,
                        })
                        : null);

                if (!html) {
                    // Sem platform_url não há para onde apontar o botão. Avisar alto
                    // é melhor que enviar um convite com link quebrado.
                    console.warn(
                        `[UserService] Convite de ${data.email} criado sem e-mail: ` +
                        `o app ${data.app_id} não tem platform_url cadastrada.`
                    );
                } else {
                    // Substitui o placeholder pelo token real antes de enviar
                    const finalHtml = normalizarBarraDupla(html.replace(/__MAGIC_LINK__/g, magicLinkToken));

                    emailSent = await emailService.sendEmail(
                        data.email,
                        `Seu acesso ao ${appName} foi liberado!`,
                        finalHtml,
                        { appId: data.app_id, appNome: appName },
                    );
                }
            }

            // Só devolve o magic link ao admin se o e-mail não saiu (fallback de emergência)
            // `user` e ADITIVO: a UI ignora, mas apps que integram (o painel do
            // label) precisam do id para amarrar o usuario ao registro deles.
            return {
                magicLinkToken: emailSent ? undefined : magicLinkToken,
                emailSent,
                user: {
                    id: String(newUserId),
                    nome: data.nome || '',
                    email: data.email,
                    app_id: String(data.app_id),
                    role: roleName,
                },
            };
        } catch (error: any) {
            if (error.code === '23505') throw Object.assign(new Error('E-mail já está em uso neste aplicativo.'), { code: 'DUPLICATE_ENTRY' });
            if (error.code === '23503') throw Object.assign(new Error('A app informada não existe.'), { code: 'RELATION_ERROR' });
            throw error;
        }
    }

    /**
     * Colunas das listagens de usuário, incluindo o estado do segundo fator.
     *
     * O 2FA entra por LEFT JOIN: conta criada fora do convite não tem linha em
     * `usuarios_2fa`, e ausência de linha significa nem exigência nem segundo
     * fator — daí os `!!` na conversão abaixo.
     */
    private static readonly COLUNAS_USUARIO = {
        id: usuarios.id,
        app_id: usuarios.appId,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        role: niveisAcesso.nome,
        status: usuarios.status,
        dois_fatores_ativo: usuarios2fa.ativo,
        dois_fatores_obrigatorio: usuarios2fa.obrigatorio,
    };

    private static comDoisFatores(linhas: any[]): UserResponse[] {
        return linhas.map(({ dois_fatores_ativo, dois_fatores_obrigatorio, ...resto }) => ({
            ...resto,
            dois_fatores: {
                ativo: !!dois_fatores_ativo,
                obrigatorio: !!dois_fatores_obrigatorio,
            },
        })) as any as UserResponse[];
    }

    public async getAllUsersGlobal(): Promise<UserResponse[]> {
        const rows = await db.select(UserService.COLUNAS_USUARIO)
            .from(usuarios)
            .leftJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
            .leftJoin(usuarios2fa, eq(usuarios2fa.usuarioId, usuarios.id));

        return UserService.comDoisFatores(rows);
    }

    public async getUsersByApp(appId: string): Promise<UserResponse[]> {
        const rows = await db.select(UserService.COLUNAS_USUARIO)
            .from(usuarios)
            .leftJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
            .leftJoin(usuarios2fa, eq(usuarios2fa.usuarioId, usuarios.id))
            .where(eq(usuarios.appId, Number(appId)));

        return UserService.comDoisFatores(rows);
    }

    /**
     * Reset administrativo do 2FA — para quem perdeu o celular E os códigos de
     * recuperação. A conta volta a "precisa enrolar", nunca a "sem 2FA".
     */
    public async resetTwoFactor(id: string): Promise<void> {
        const existe = await db.select({ id: usuarios.id })
            .from(usuarios)
            .where(eq(usuarios.id, Number(id)))
            .limit(1);

        if (existe.length === 0) {
            const error = new Error('Usuário não encontrado.');
            (error as any).code = 'NOT_FOUND';
            throw error;
        }

        await twoFactorService.resetarPorAdmin(id);
    }

    public async updateUser(id: string, data: UpdateUserDTO) {
        if (data.email) {
            // Duplicidade é por (email, app_id) — mesmo e-mail pode existir em apps diferentes.
            // Precisamos descobrir o app do usuário sendo atualizado antes de validar.
            const currentUser = await db.select({ appId: usuarios.appId })
                .from(usuarios)
                .where(eq(usuarios.id, Number(id)))
                .limit(1);

            if (currentUser.length === 0) {
                const error = new Error('Usuário não encontrado.');
                (error as any).code = 'NOT_FOUND';
                throw error;
            }

            const currentAppId = currentUser[0].appId;
            const emailCheck = await db.select({ id: usuarios.id })
                .from(usuarios)
                .where(and(
                    eq(usuarios.email, data.email),
                    currentAppId !== null ? eq(usuarios.appId, currentAppId) : sql`${usuarios.appId} IS NULL`,
                    ne(usuarios.id, Number(id)),
                ))
                .limit(1);

            if (emailCheck.length > 0) {
                const error = new Error('E-mail já está em uso por outro usuário neste aplicativo.');
                (error as any).code = 'DUPLICATE_ENTRY';
                throw error;
            }
        }

        const updateData: any = {};
        if (data.nome !== undefined) updateData.nome = data.nome;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.telefone !== undefined) updateData.telefone = data.telefone || null;

        if (data.password && data.password.trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            updateData.senhaHash = await bcrypt.hash(data.password, salt);
        }

        if (data.role) {
            const roleRes = await db.select({ id: niveisAcesso.id }).from(niveisAcesso).where(eq(niveisAcesso.nome, data.role)).limit(1);
            if (roleRes.length > 0) {
                updateData.nivelAcessoId = roleRes[0].id;
            } else {
                const error = new Error(`Nível de acesso '${data.role}' inválido.`);
                (error as any).code = 'VALIDATION';
                throw error;
            }
        }

        if (Object.keys(updateData).length > 0) {
            const result = await db.update(usuarios)
                .set(updateData)
                .where(eq(usuarios.id, Number(id)))
                .returning();

            if (result.length === 0) {
                const error = new Error('Usuário não encontrado.');
                (error as any).code = 'NOT_FOUND';
                throw error;
            }
            return result[0];
        }
        return null;
    }

    public async toggleUserStatus(id: string, status: 'ativo' | 'bloqueado' | 'inativo') {
        const result = await db.update(usuarios)
            .set({ status })
            .where(eq(usuarios.id, Number(id)))
            .returning();

        if (result.length === 0) {
            const error = new Error('Usuário não encontrado.');
            (error as any).code = 'NOT_FOUND';
            throw error;
        }
        return result[0];
    }

    public async removeUser(id: string): Promise<void> {
        try {
            const result = await db.delete(usuarios).where(eq(usuarios.id, Number(id))).returning();
            
            if (result.length === 0) {
                const error = new Error('Usuário não encontrado.');
                (error as any).message = 'Usuário não encontrado.';
                throw error;
            }
        } catch (error: any) {
            if (error.code === '23503') { 
                throw new Error('Não é possível remover este usuário pois ele possui registros vinculados.');
            }
            throw error;
        }
    }

    public async resetUserPassword(id: string, emailHtml?: string): Promise<{ magicLinkToken?: string; emailSent: boolean }> {
        const userRes = await db
            .select({
                id: usuarios.id,
                email: usuarios.email,
                app_id: usuarios.appId,
                app_usa_login_hub: aplicativos.usaLoginHub,
            })
            .from(usuarios)
            .leftJoin(aplicativos, eq(aplicativos.id, usuarios.appId))
            .where(eq(usuarios.id, Number(id)))
            .limit(1);
        if (userRes.length === 0) {
            const error = new Error('Usuário não encontrado.');
            (error as any).code = 'NOT_FOUND';
            throw error;
        }

        // Invalida a senha atual com um valor que ninguém conhece; o usuário
        // define a nova pelo magic link abaixo.
        const randomPassword = crypto.randomBytes(32).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(randomPassword, salt);

        await db.update(usuarios)
            .set({ senhaHash })
            .where(eq(usuarios.id, Number(id)));

        // Reset é o caminho de reconvite das contas antigas: quem passa por aqui
        // sai com 2FA exigido, como qualquer conta nova — menos as contas de app
        // que não autentica no hub, pela mesma razão do `addUser`. Elas jamais
        // passam pelo login daqui, então a obrigação vira um "2FA pendente" que
        // nunca resolve. Sem esta guarda, reenviar o convite de um usuário do
        // Cofre desfaz a limpeza feita pela db/004_apps_sem_login_hub.sql — e o
        // reset é justamente o caminho mais provável de acontecer de novo.
        if (userRes[0].app_usa_login_hub !== false) {
            await twoFactorService.marcarObrigatorio(id);
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET missing in .env");
        }
        // Mesma claim `app_id` do convite de conta nova (ver addUser): o reset
        // é o caminho de RECONVITE, e produz um passe indistinguível do outro.
        // Se só um dos dois carregasse o tenant, o reset quebraria nos apps que
        // validam o convite — exatamente o caso mais difícil de notar.
        const magicLinkToken = jwt.sign(
            {
                sub: id,
                action: 'setup-password',
                email: userRes[0].email,
                app_id: userRes[0].app_id ? String(userRes[0].app_id) : undefined,
                pwf: passwordFingerprint(senhaHash),
            },
            jwtSecret || 'secret',
            { expiresIn: MAGIC_LINK_TTL },
        );

        let emailSent = false;
        if (emailHtml) {
            let appName = 'nosso sistema';
            if (userRes[0].app_id) {
                const appRow = await db.select({ nome: aplicativos.nome }).from(aplicativos).where(eq(aplicativos.id, Number(userRes[0].app_id))).limit(1);
                if (appRow.length > 0) appName = appRow[0].nome;
            }

            const finalHtml = normalizarBarraDupla(emailHtml.replace(/__MAGIC_LINK__/g, magicLinkToken));

            emailSent = await emailService.sendEmail(
                userRes[0].email,
                `Sua senha do ${appName} foi redefinida!`,
                finalHtml,
                { appId: userRes[0].app_id, appNome: appName },
            );
        }

        return { magicLinkToken: emailSent ? undefined : magicLinkToken, emailSent };
    }
}
