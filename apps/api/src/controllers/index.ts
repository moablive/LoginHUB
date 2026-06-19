import { Request, Response } from 'express';
import { AuthService, CompanyService, UserService } from '@loginhub/services';
import { LoginInputDTO, CreateCompanyDTO, UpdateCompanyDTO, CreateUserDTO, UpdateUserDTO, DbError } from '@loginhub/schema';

const authService = new AuthService();
const companyService = new CompanyService();
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
                case 'EMPRESA_BLOQUEADA':
                    return res.status(403).json({ error: 'Acesso Suspenso', message: 'Sua empresa está inativa. Contate o suporte.' });
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
}

// ==========================================
// COMPANY CONTROLLER
// ==========================================
export class CompanyController {
    static async createCompany(req: Request<{}, {}, CreateCompanyDTO>, res: Response) {
        try {
            const result = await companyService.registerCompany(req.body);
            return res.status(201).json(result);
        } catch (err: unknown) {
            const error = err as DbError;
            console.error('[CompanyController] createCompany:', error);

            if (error.code === 'DUPLICATE_ENTRY') {
                return res.status(409).json({ error: 'Conflito de Dados', message: error.message || 'Documento ou E-mail já registrados.' });
            }
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async getAllCompanies(req: Request, res: Response) {
        try {
            const companies = await companyService.getAllCompanies();
            return res.status(200).json(companies);
        } catch (err: unknown) {
            console.error('[CompanyController] getAllCompanies:', err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async getById(req: Request<{ id: string }>, res: Response) {
        const { id } = req.params;
        try {
            const company = await companyService.getCompanyById(id);
            return res.status(200).json(company);
        } catch (err: unknown) {
            const error = err as { code?: string, message?: string };
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ error: 'Empresa não encontrada' });
            }
            console.error('[CompanyController] getById:', err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async toggleCompanyStatus(req: Request<{ id: string }, {}, { status: string }>, res: Response) {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !['ativo', 'inativo'].includes(status)) {
            return res.status(400).json({ error: "Status deve ser 'ativo' ou 'inativo'." });
        }

        try {
            const empresa = await companyService.updateCompanyStatus(id, status as 'ativo' | 'inativo');
            return res.status(200).json({ message: `Status atualizado para ${status}.`, empresa });
        } catch (err: unknown) {
            const error = err as { code?: string };
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ error: 'Empresa não encontrada' });
            }
            console.error(`[CompanyController] toggleCompanyStatus:`, err);
            return res.status(500).json({ error: "Erro Interno" });
        }
    }

    static async deleteCompany(req: Request<{ id: string }>, res: Response) {
        const { id } = req.params;
        try {
            await companyService.deleteCompany(id);
            return res.status(200).json({ message: 'Empresa removida com sucesso.' });
        } catch (err: unknown) {
            const error = err as { code?: string };
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ error: 'Empresa não encontrada' });
            }
            console.error('[CompanyController] deleteCompany:', err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async updateCompany(req: Request<{ id: string }, {}, UpdateCompanyDTO>, res: Response) {
        const { id } = req.params;
        const { nome, email, documento, telefone } = req.body;

        try {
            const updatedCompany = await companyService.updateCompany(id, { nome, email, documento, telefone: telefone || undefined });
            return res.status(200).json(updatedCompany);
        } catch (err: unknown) {
            const error = err as DbError;
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ message: 'Empresa não encontrada.' });
            }
            if (error.code === 'DUPLICATE_ENTRY') {
                return res.status(409).json({ error: 'Conflito de Dados', message: error.message || 'Documento ou E-mail já em uso.' });
            }
            console.error('[CompanyController] updateCompany:', error);
            return res.status(500).json({ message: 'Erro interno ao atualizar empresa.' });
        }
    }
}

// ==========================================
// USER CONTROLLER
// ==========================================
export class UserController {
    static async addUser(req: Request<Record<string, never>, Record<string, never>, CreateUserDTO>, res: Response) {
        try {
            await userService.addUser(req.body);
            return res.status(201).json({ message: 'Usuário criado com sucesso.' });
        } catch (err) {
            const error = err as DbError;
            console.error('[UserController] addUser:', error);
            if (error.code === 'DUPLICATE_ENTRY') {
                return res.status(409).json({ error: 'Conflito de Dados', message: error.message || 'E-mail já está em uso.' });
            }
            if (error.code === 'RELATION_ERROR') {
                return res.status(400).json({ error: 'Dados Inválidos', message: error.message || 'A empresa informada não existe.' });
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

    static async getUsersByCompany(req: Request<{ id: string }>, res: Response) {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({ error: 'ID inválido.' });
            }
            const users = await userService.getUsersByCompany(id);
            return res.status(200).json(users);
        } catch (err) {
            console.error(`[UserController] getUsersByCompany (ID: ${req.params.id}):`, err);
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
        const { nome, email, password, telefone } = req.body;
        try {
            const updatedUser = await userService.updateUser(id, { nome, email, password, telefone });
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
}
