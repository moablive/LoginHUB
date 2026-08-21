import { Request, Response } from 'express';
import { AuthService, AppService, UserService, twoFactorService } from '@loginhub/services';
import { LoginInputDTO, CreateAppDTO, UpdateAppDTO, CreateUserDTO, UpdateUserDTO, DbError } from '@loginhub/schema';

const authService = new AuthService();
const appService = new AppService();
const userService = new UserService();

// ==========================================
// AUTH CONTROLLER
// ==========================================
export class AuthController {
    static async login(
        req: Request<Record<string, never>, Record<string, never>, LoginInputDTO>, 
        res: Response
    ) {
        try {
            const { email, password, app_id } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    error: 'Dados incompletos',
                    message: 'E-mail e senha são obrigatórios.'
                });
            }

            const result = await authService.login({ email, password, app_id });
            return res.status(200).json(result);

        } catch (error: unknown) {
            const err = error as Error & { availableApps?: Array<{ id: string; nome: string; logo: string | null }> };
            console.error('[AuthController] Erro:', err.message);

            switch (err.message) {
                case 'CREDENCIAIS_INVALIDAS':
                    return res.status(401).json({ error: 'Acesso Negado', message: 'E-mail ou senha incorretos.' });
                case 'APP_BLOQUEADO':
                    return res.status(403).json({ error: 'Acesso Suspenso', message: 'Sua app está inativa. Contate o suporte.' });
                case 'USUARIO_BLOQUEADO':
                    return res.status(403).json({ error: 'Conta Inativa', message: 'Seu usuário foi desativado.' });
                case 'AMBIGUOUS_EMAIL':
                    return res.status(409).json({
                        error: 'AMBIGUOUS_EMAIL',
                        message: 'Este e-mail está vinculado a mais de um aplicativo. Selecione qual deseja acessar.',
                        availableApps: err.availableApps ?? [],
                    });
                default:
                    return res.status(500).json({ error: 'Erro Interno', message: 'Erro ao processar login.' });
            }
        }
    }

    static async logout(req: Request, res: Response) {
        return res.status(200).json({ message: 'Logout realizado.', action: 'CLEAR_LOCAL_STORAGE' });
    }

    static async refresh(req: Request, res: Response) {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'TOKEN_AUSENTE', message: 'Token não fornecido.' });
        }
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || !parts[1]) {
            return res.status(401).json({ error: 'FORMATO_INVALIDO', message: 'Formato de token inválido.' });
        }

        try {
            const result = await authService.refreshToken(parts[1]);
            return res.status(200).json(result);
        } catch (err: unknown) {
            const error = err as Error;
            switch (error.message) {
                case 'TOKEN_INVALIDO':
                    return res.status(401).json({ error: 'TOKEN_INVALIDO', message: 'Token inválido. Faça login novamente.' });
                case 'TOKEN_EXPIRADO':
                    return res.status(401).json({ error: 'TOKEN_EXPIRADO', message: 'Sessão expirada. Faça login novamente.' });
                case 'SESSAO_REVOGADA':
                    return res.status(401).json({ error: 'SESSAO_REVOGADA', message: 'Sessão encerrada por alteração de segurança. Faça login novamente.' });
                case 'USUARIO_INVALIDO':
                    return res.status(401).json({ error: 'USUARIO_INVALIDO', message: 'Usuário não encontrado.' });
                case 'APP_BLOQUEADO':
                    return res.status(403).json({ error: 'APP_BLOQUEADO', message: 'Acesso da organização foi suspenso.' });
                default:
                    console.error('[AuthController] refresh:', error);
                    return res.status(500).json({ error: 'ERRO_INTERNO', message: 'Falha ao renovar token.' });
            }
        }
    }

    // changePassword removido — troca de senha agora é feita exclusivamente via magic link (setup-password)

    static async setupPassword(req: Request, res: Response) {
        try {
            const { token, novaSenha } = req.body;

            if (!token || !novaSenha) {
                return res.status(400).json({ error: 'Dados incompletos', message: 'O token e a nova senha são obrigatórios.' });
            }

            const resultado = await authService.setupPasswordFromMagicLink(token, novaSenha);
            return res.status(200).json(resultado);
        } catch (err: unknown) {
            const error = err as Error;
            switch (error.message) {
                case 'ERRO_INTERNO':
                    return res.status(500).json({ error: 'Configuração', message: 'JWT_SECRET não configurado.' });
                case 'TOKEN_INVALIDO':
                    return res.status(401).json({ error: 'Token Inválido', message: 'O link de acesso é inválido ou expirou.' });
                case 'ACAO_INVALIDA':
                    return res.status(401).json({ error: 'Token Inválido', message: 'O link de acesso não é válido para esta ação.' });
                case 'USUARIO_NAO_ENCONTRADO':
                    return res.status(404).json({ error: 'Não Encontrado', message: 'Usuário não encontrado.' });
                case 'LINK_JA_UTILIZADO':
                    return res.status(401).json({ error: 'Token Inválido', message: 'Este link de acesso já foi utilizado.' });
                default:
                    console.error('[AuthController] setupPassword:', error.message);
                    return res.status(500).json({ error: 'Erro Interno', message: 'Erro ao definir a senha.' });
            }
        }
    }
}

// ==========================================
// 2FA CONTROLLER
// ==========================================

/**
 * Traduz os erros do domínio de 2FA em HTTP.
 *
 * Códigos errados, reutilizados e de conta sem 2FA saem todos como 401 com a
 * MESMA mensagem de propósito: distinguir "código inválido" de "essa conta nem
 * tem 2FA" entregaria de graça, a quem tem só a senha, a informação de quais
 * contas valem a pena atacar.
 */
const responder2FA = (res: Response, erro: Error) => {
    switch (erro.message) {
        case 'TWOFA_NAO_CONFIGURADO':
            console.error('[2FA] TWOFA_ENC_KEY ausente ou fora do formato (32 bytes em hex ou base64).');
            return res.status(500).json({ error: 'Configuração', message: '2FA não está configurado neste servidor.' });
        case 'SECRET_CORROMPIDO':
            console.error('[2FA] Falha ao decifrar o secret — chave trocada ou registro adulterado.');
            return res.status(500).json({ error: 'Erro Interno', message: 'Não foi possível ler a configuração de 2FA.' });
        case 'JA_ATIVO':
            return res.status(409).json({ error: 'JA_ATIVO', message: 'O 2FA já está ativo nesta conta.' });
        case 'SETUP_NAO_INICIADO':
            return res.status(409).json({ error: 'SETUP_NAO_INICIADO', message: 'Inicie o setup antes de confirmar.' });
        case 'NAO_ATIVO':
            return res.status(409).json({ error: 'NAO_ATIVO', message: 'Esta conta não tem 2FA ativo.' });
        case 'OBRIGATORIO':
            return res.status(403).json({
                error: 'OBRIGATORIO',
                message: 'O 2FA é obrigatório nesta conta e não pode ser desativado por você. Fale com um administrador.',
            });
        case 'CODIGO_AUSENTE':
            return res.status(400).json({ error: 'Dados incompletos', message: 'Informe o código.' });
        case 'CHALLENGE_INVALIDO':
            return res.status(401).json({ error: 'CHALLENGE_INVALIDO', message: 'Desafio inválido ou expirado. Faça login novamente.' });
        case 'CODIGO_INVALIDO':
        case 'CODIGO_REUTILIZADO':
            return res.status(401).json({ error: 'CODIGO_INVALIDO', message: 'Código inválido.' });
        case 'USUARIO_NAO_ENCONTRADO':
        case 'USUARIO_INVALIDO':
            return res.status(404).json({ error: 'Não Encontrado', message: 'Usuário não encontrado.' });
        case 'APP_BLOQUEADO':
            return res.status(403).json({ error: 'APP_BLOQUEADO', message: 'Acesso da organização suspenso.' });
        case 'USUARIO_BLOQUEADO':
            return res.status(403).json({ error: 'USUARIO_BLOQUEADO', message: 'Seu usuário foi desativado.' });
        default:
            console.error('[2FA]', erro);
            return res.status(500).json({ error: 'Erro Interno', message: 'Falha ao processar 2FA.' });
    }
};

const usuarioDaSessao = (req: Request): string => String((req as any).user?.sub ?? '');

export class TwoFactorController {
    /** POST /auth/2fa/setup — gera secret e a URI otpauth (cliente desenha o QR). */
    static async setup(req: Request, res: Response) {
        try {
            return res.status(200).json(await twoFactorService.iniciarSetup(usuarioDaSessao(req)));
        } catch (err) {
            return responder2FA(res, err as Error);
        }
    }

    /** POST /auth/2fa/verify-setup — confirma com um código e devolve os backup codes. */
    static async verifySetup(req: Request, res: Response) {
        try {
            const { codigo } = req.body ?? {};
            if (!codigo) throw new Error('CODIGO_AUSENTE');

            const usuarioId = usuarioDaSessao(req);
            const resultado = await twoFactorService.confirmarSetup(usuarioId, String(codigo));
            // A ativação carimbou o piso de sessão, invalidando o token que veio
            // nesta requisição. Emitir a nova sessão aqui evita deixar o cliente
            // sem credencial no meio do fluxo de convite.
            const sessao = await authService.emitirSessaoParaUsuario(usuarioId);

            return res.status(200).json({
                ...resultado,
                token: sessao.token,
                expiresIn: sessao.expiresIn,
                message: 'Guarde os códigos de recuperação: eles não serão exibidos de novo.',
            });
        } catch (err) {
            return responder2FA(res, err as Error);
        }
    }

    /** POST /auth/2fa/verify — troca o desafio do login por sessão de 24h. */
    static async verify(req: Request, res: Response) {
        try {
            const { challengeToken, codigo } = req.body ?? {};
            if (!challengeToken) throw new Error('CHALLENGE_INVALIDO');
            if (!codigo) throw new Error('CODIGO_AUSENTE');

            const sessao = await authService.verificarSegundoFator(String(challengeToken), { codigo: String(codigo) });
            return res.status(200).json(sessao);
        } catch (err) {
            return responder2FA(res, err as Error);
        }
    }

    /** POST /auth/2fa/verify-backup — mesma troca, usando código de recuperação. */
    static async verifyBackup(req: Request, res: Response) {
        try {
            const { challengeToken, backupCode } = req.body ?? {};
            if (!challengeToken) throw new Error('CHALLENGE_INVALIDO');
            if (!backupCode) throw new Error('CODIGO_AUSENTE');

            const sessao = await authService.verificarSegundoFator(String(challengeToken), { backupCode: String(backupCode) });
            return res.status(200).json(sessao);
        } catch (err) {
            return responder2FA(res, err as Error);
        }
    }

    /** POST /auth/2fa/disable — exige código do autenticador OU de recuperação. */
    static async disable(req: Request, res: Response) {
        try {
            const usuarioId = usuarioDaSessao(req);
            const { codigo, backupCode } = req.body ?? {};

            if (backupCode) {
                await twoFactorService.consumirBackupCode(usuarioId, String(backupCode));
            } else if (codigo) {
                await twoFactorService.verificarCodigo(usuarioId, String(codigo));
            } else {
                throw new Error('CODIGO_AUSENTE');
            }

            await twoFactorService.desativar(usuarioId);
            return res.status(200).json({ ativo: false, message: '2FA desativado.' });
        } catch (err) {
            return responder2FA(res, err as Error);
        }
    }

    /**
     * GET|POST /auth/2fa/backup-codes — regenera os códigos, exigindo TOTP.
     *
     * O GET existe porque foi especificado assim, mas o código viaja na query
     * string — que vai parar em log de acesso e histórico do navegador. Prefira
     * o POST, que é a mesma rota com o código no corpo.
     */
    static async backupCodes(req: Request, res: Response) {
        try {
            const usuarioId = usuarioDaSessao(req);
            const codigo = (req.body?.codigo ?? req.query?.code ?? req.query?.codigo) as string | undefined;
            if (!codigo) throw new Error('CODIGO_AUSENTE');

            await twoFactorService.verificarCodigo(usuarioId, String(codigo));
            const backupCodes = await twoFactorService.regenerarBackupCodes(usuarioId);

            return res.status(200).json({
                backupCodes,
                message: 'Os códigos anteriores foram invalidados.',
            });
        } catch (err) {
            return responder2FA(res, err as Error);
        }
    }

    /** GET /auth/2fa/status — se está ativo e quantos backup codes restam. */
    static async status(req: Request, res: Response) {
        try {
            return res.status(200).json(await twoFactorService.status(usuarioDaSessao(req)));
        } catch (err) {
            return responder2FA(res, err as Error);
        }
    }
}

// ==========================================
// APP CONTROLLER
// ==========================================
export class AppController {
    static async createApp(req: Request<{}, {}, CreateAppDTO>, res: Response) {
        try {
            const result = await appService.registerApp(req.body);
            return res.status(201).json(result);
        } catch (err: unknown) {
            const error = err as DbError;
            console.error('[AppController] createApp:', error);

            if (error.code === 'DUPLICATE_ENTRY') {
                return res.status(409).json({ error: 'Conflito de Dados', message: error.message || 'Documento ou E-mail já registrados.' });
            }
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async getAllApps(req: Request, res: Response) {
        try {
            const apps = await appService.getAllApps();
            return res.status(200).json(apps);
        } catch (err: unknown) {
            console.error('[AppController] getAllApps:', err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async getById(req: Request<{ id: string }>, res: Response) {
        const { id } = req.params;
        try {
            const app = await appService.getAppById(id);
            return res.status(200).json(app);
        } catch (err: unknown) {
            const error = err as { code?: string, message?: string };
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ error: 'Aplicativo não encontrada' });
            }
            console.error('[AppController] getById:', err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async toggleAppStatus(req: Request<{ id: string }, {}, { status: string }>, res: Response) {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !['ativo', 'inativo'].includes(status)) {
            return res.status(400).json({ error: "Status deve ser 'ativo' ou 'inativo'." });
        }

        try {
            const app = await appService.updateAppStatus(id, status as 'ativo' | 'inativo');
            return res.status(200).json({ message: `Status atualizado para ${status}.`, app });
        } catch (err: unknown) {
            const error = err as { code?: string };
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ error: 'Aplicativo não encontrada' });
            }
            console.error(`[AppController] toggleAppStatus:`, err);
            return res.status(500).json({ error: "Erro Interno" });
        }
    }

    static async deleteApp(req: Request<{ id: string }>, res: Response) {
        const { id } = req.params;
        try {
            await appService.deleteApp(id);
            return res.status(200).json({ message: 'Aplicativo removida com sucesso.' });
        } catch (err: unknown) {
            const error = err as { code?: string };
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ error: 'Aplicativo não encontrada' });
            }
            console.error('[AppController] deleteApp:', err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async updateApp(req: Request<{ id: string }, {}, UpdateAppDTO & { logo?: string | null; bot_url?: string | null; platform_url?: string | null }>, res: Response) {
        const { id } = req.params;
        const { nome, email, documento, telefone, logo, bot_url, platform_url } = req.body;

        try {
            const updatedApp = await appService.updateApp(id, { nome, email, documento, telefone: telefone || undefined, logo, bot_url, platform_url });
            return res.status(200).json(updatedApp);
        } catch (err: unknown) {
            const error = err as DbError;
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ message: 'Aplicativo não encontrada.' });
            }
            if (error.code === 'DUPLICATE_ENTRY') {
                return res.status(409).json({ error: 'Conflito de Dados', message: error.message || 'Documento ou E-mail já em uso.' });
            }
            console.error('[AppController] updateApp:', error);
            return res.status(500).json({ message: 'Erro interno ao atualizar app.' });
        }
    }
}

// ==========================================
// USER CONTROLLER
// ==========================================
export class UserController {
    static async addUser(req: Request<Record<string, never>, Record<string, never>, CreateUserDTO>, res: Response) {
        try {
            const result = await userService.addUser(req.body);
            return res.status(201).json({
                message: result.emailSent
                    ? 'Convite enviado por e-mail com sucesso.'
                    : 'Usuário criado, mas o e-mail de convite não pôde ser enviado.',
                emailSent: result.emailSent,
                magicLinkToken: result.magicLinkToken,
            });
        } catch (err) {
            const error = err as DbError;
            console.error('[UserController] addUser:', error);
            if (error.code === 'DUPLICATE_ENTRY') {
                return res.status(409).json({ error: 'Conflito de Dados', message: error.message || 'E-mail já está em uso.' });
            }
            if (error.code === 'RELATION_ERROR') {
                return res.status(400).json({ error: 'Dados Inválidos', message: error.message || 'A app informada não existe.' });
            }
            if (error.code === 'VALIDATION') {
                return res.status(400).json({ error: 'Dados Inválidos', message: error.message });
            }
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async getAllUsers(req: Request, res: Response) {
        try {
            const users = await userService.getAllUsersGlobal();
            return res.status(200).json(users);
        } catch (err) {
            console.error('[UserController] getAllUsers:', err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async getUsersByApp(req: Request<{ id: string }>, res: Response) {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({ error: 'ID inválido.' });
            }
            const users = await userService.getUsersByApp(id);
            return res.status(200).json(users);
        } catch (err) {
            console.error(`[UserController] getUsersByApp (ID: ${req.params.id}):`, err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async removeUser(req: Request<{ id: string }>, res: Response) {
        const { id } = req.params;
        try {
            await userService.removeUser(id);
            return res.status(200).json({ message: 'Usuário removido.' });
        } catch (err: unknown) {
            const error = err as Error;
            if (error.message === 'Usuário não encontrado.') {
                return res.status(404).json({ error: 'Não encontrado' });
            }
            console.error(`[UserController] removeUser (ID: ${id}):`, err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async updateUser(req: Request<{ id: string }, {}, UpdateUserDTO>, res: Response) {
        const { id } = req.params;
        const { nome, email, password, telefone, role } = req.body;
        const payload: UpdateUserDTO = { nome, email, password, telefone };
        if (role !== undefined) {
            payload.role = role;
        }
        try {
            const updatedUser = await userService.updateUser(id, payload);
            return res.status(200).json(updatedUser);
        } catch (err: unknown) {
            const error = err as DbError;
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
            if (error.code === 'DUPLICATE_ENTRY') {
                return res.status(409).json({ error: 'Conflito de Dados', message: error.message || 'E-mail já está em uso.' });
            }
            console.error('[UserController] updateUser:', err);
            return res.status(500).json({ message: 'Erro interno ao atualizar usuário.' });
        }
    }

    static async toggleUserStatus(req: Request<{ id: string }, {}, { status: string }>, res: Response) {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !['ativo', 'inativo', 'bloqueado'].includes(status)) {
            return res.status(400).json({ error: "Status deve ser 'ativo', 'inativo' ou 'bloqueado'." });
        }

        try {
            const user = await userService.toggleUserStatus(id, status as 'ativo' | 'inativo' | 'bloqueado');
            return res.status(200).json({ message: `Status atualizado para ${status}.`, user });
        } catch (err: unknown) {
            const error = err as { code?: string };
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }
            console.error(`[UserController] toggleUserStatus:`, err);
            return res.status(500).json({ error: "Erro Interno" });
        }
    }

    static async resetPassword(req: Request<{ id: string }, {}, { emailHtml?: string }>, res: Response) {
        const { id } = req.params;
        const { emailHtml } = req.body || {};
        try {
            const result = await userService.resetUserPassword(id, emailHtml);
            return res.status(200).json({
                message: result.emailSent
                    ? 'Link de acesso enviado por e-mail com sucesso.'
                    : 'Link de acesso gerado, mas o e-mail não pôde ser enviado.',
                emailSent: result.emailSent,
                magicLinkToken: result.magicLinkToken,
            });
        } catch (err: unknown) {
            const error = err as { code?: string, message?: string };
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
            console.error(`[UserController] resetPassword (ID: ${id}):`, err);
            return res.status(500).json({ error: 'Erro Interno', message: 'Falha ao redefinir a senha do usuário.' });
        }
    }

    /**
     * POST /admin/users/:id/reset-2fa — descarta o autenticador da conta.
     *
     * Para quem perdeu o celular e os códigos de recuperação. A exigência de
     * 2FA continua de pé: no próximo login a pessoa cai no enrolamento e
     * escaneia um QR novo. As sessões em curso caem junto — o aparelho perdido
     * não pode continuar dentro da conta.
     */
    static async resetTwoFactor(req: Request<{ id: string }>, res: Response) {
        const { id } = req.params;
        try {
            await userService.resetTwoFactor(id);
            return res.status(200).json({
                message: '2FA reiniciado. O usuário vai configurar um autenticador novo no próximo login.',
                ativo: false,
                obrigatorio: true,
                sessoesAnterioresInvalidadas: true,
            });
        } catch (err: unknown) {
            const error = err as { code?: string, message?: string };
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
            console.error(`[UserController] resetTwoFactor (ID: ${id}):`, err);
            return res.status(500).json({ error: 'Erro Interno', message: 'Falha ao reiniciar o 2FA do usuário.' });
        }
    }
}
