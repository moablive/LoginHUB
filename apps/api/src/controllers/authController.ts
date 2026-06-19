import { Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { LoginInputDTO } from '@loginhub/shared';

const authService = new AuthService();

export class AuthController {

    /**
     * POST /auth/login
     * Recebe credenciais, valida e retorna o Token JWT + Dados do Usuário
     */
    static async login(
        req: Request<Record<string, never>, Record<string, never>, LoginInputDTO>, 
        res: Response
    ) {
        try {
            const { email, password } = req.body;

            // 1. Validação Básica
            if (!email || !password) {
                return res.status(400).json({ 
                    error: 'Dados incompletos',
                    message: 'E-mail e senha são obrigatórios.' 
                });
            }

            // 2. Chamada ao Serviço (Toda a lógica pesada está aqui dentro)
            const result = await authService.login({ email, password });
            
            // 3. Sucesso
            return res.status(200).json(result);

        } catch (error: unknown) {
            const err = error as Error;
            console.error('[AuthController] Erro:', err.message);

            // 4. Mapeamento de Erros do Service para HTTP Status
            switch (err.message) {
                case 'CREDENCIAIS_INVALIDAS':
                    return res.status(401).json({ 
                        error: 'Acesso Negado',
                        message: 'E-mail ou senha incorretos.' 
                    });
                
                case 'EMPRESA_BLOQUEADA':
                    return res.status(403).json({ 
                        error: 'Acesso Suspenso',
                        message: 'Sua empresa está inativa. Contate o suporte.' 
                    });

                case 'USUARIO_BLOQUEADO':
                    return res.status(403).json({ 
                        error: 'Conta Inativa',
                        message: 'Seu usuário foi desativado.' 
                    });

                default:
                    return res.status(500).json({ 
                        error: 'Erro Interno',
                        message: 'Erro ao processar login.' 
                    });
            }
        }
    }

    /**
     * POST /auth/logout
     */
    static async logout(req: Request, res: Response) {
        // Logout geralmente é Stateless (apenas limpa no front), 
        // mas deixamos a estrutura pronta caso queira implementar blacklist no Redis.
        return res.status(200).json({ 
            message: 'Logout realizado.',
            action: 'CLEAR_LOCAL_STORAGE' 
        });
    }
}