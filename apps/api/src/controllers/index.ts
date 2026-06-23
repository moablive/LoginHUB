import { Request, Response } from 'express';
import { AuthService, AppService, UserService } from '@loginhub/services';
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
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ 
                    error: 'Dados incompletos',
                    message: 'E-mail e senha são obrigatórios.' 
                });
            }

            const result = await authService.login({ email, password });
            return res.status(200).json(result);

        } catch (error: unknown) {
            const err = error as Error;
            console.error('[AuthController] Erro:', err.message);

            switch (err.message) {
                case 'CREDENCIAIS_INVALIDAS':
                    return res.status(401).json({ error: 'Acesso Negado', message: 'E-mail ou senha incorretos.' });
                case 'APP_BLOQUEADO':
                    return res.status(403).json({ error: 'Acesso Suspenso', message: 'Sua app está inativa. Contate o suporte.' });
                case 'USUARIO_BLOQUEADO':
                    return res.status(403).json({ error: 'Conta Inativa', message: 'Seu usuário foi desativado.' });
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

    static async changePassword(req: Request, res: Response) {
        try {
            const { novaSenha } = req.body;
            const userId = (req as any).user?.sub;
            
            if (!novaSenha) {
                return res.status(400).json({ error: 'Dados incompletos', message: 'A nova senha é obrigatória.' });
            }
            if (!userId) {
                return res.status(401).json({ error: 'Acesso Negado', message: 'Usuário não autenticado.' });
            }

            await authService.changePassword(userId, novaSenha);
            return res.status(200).json({ message: 'Senha atualizada com sucesso.' });
        } catch (err: unknown) {
            const error = err as Error;
            console.error('[AuthController] changePassword:', error.message);
            return res.status(500).json({ error: 'Erro Interno', message: 'Erro ao atualizar a senha.' });
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

    static async updateApp(req: Request<{ id: string }, {}, UpdateAppDTO & { logo?: string | null; bot_url?: string | null }>, res: Response) {
        const { id } = req.params;
        const { nome, email, documento, telefone, logo, bot_url } = req.body;

        try {
            const updatedApp = await appService.updateApp(id, { nome, email, documento, telefone: telefone || undefined, logo, bot_url });
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
                tempPassword: result.tempPassword,
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
                    ? 'Nova senha enviada por e-mail com sucesso.'
                    : 'Senha redefinida, mas o e-mail não pôde ser enviado.',
                emailSent: result.emailSent,
                tempPassword: result.tempPassword,
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
}
