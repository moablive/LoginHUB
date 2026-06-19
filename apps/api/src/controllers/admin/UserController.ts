import { Request, Response } from 'express';
import { UserService } from '../../services/admin';
import { CreateUserDTO, UpdateUserDTO } from '@loginhub/shared';
import { DbError } from '../../types/error';

const userService = new UserService();

export class UserController {

    static async addUser(
        req: Request<Record<string, never>, Record<string, never>, CreateUserDTO>,
        res: Response
    ) {
        try {
            await userService.addUser(req.body);
            return res.status(201).json({ message: 'Usuário criado com sucesso.' });

        } catch (err) {
            const error = err as DbError;
            console.error('[UserController] addUser:', error);

            if (error.code === '23505') {
                return res.status(409).json({
                    error: 'Conflito de Dados',
                    message: 'E-mail já está em uso.'
                });
            }

            if (error.code === '23503') {
                return res.status(400).json({
                    error: 'Dados Inválidos',
                    message: 'A empresa informada não existe.'
                });
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

            // CORREÇÃO: Removemos a validação de tamanho (id.length < 30)
            // Agora aceita IDs numéricos curtos do PostgreSQL
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
            // Chama o serviço (que já trata hash de senha e validação de email)
            const updatedUser = await userService.updateUser(id, {
                nome,
                email,
                password,
                telefone
            });

            return res.status(200).json(updatedUser);

        } catch (err: unknown) {
            const error = err as DbError;

            // Tratamento de erros específicos vindos do Service
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }

            if (error.code === 'DUPLICATE_ENTRY' || error.code === '23505') {
                return res.status(409).json({
                    error: 'Conflito de Dados',
                    message: error.message || 'E-mail já está em uso.'
                });
            }

            console.error('[UserController] updateUser:', err);
            return res.status(500).json({ message: 'Erro interno ao atualizar usuário.' });
        }
    }
}
