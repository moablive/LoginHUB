import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/db';
import { AuthQueries } from '../db/queries/auth.queries';
import {
    LoginInputDTO,
    LoginResponseDTO,
    UserLoginQueryResult,
    JWTPayload,
    UserRole
} from '@loginhub/shared';

export class AuthService {

    public async login(data: LoginInputDTO): Promise<LoginResponseDTO> {
        const result = await pool.query<UserLoginQueryResult>(
            AuthQueries.FIND_BY_EMAIL_WITH_RELATIONS,
            [data.email]
        );

        const user = result.rows[0];

        if (!user) {
            throw new Error('CREDENCIAIS_INVALIDAS');
        }

        if (user.empresa_status !== 'ativo') {
            throw new Error('EMPRESA_BLOQUEADA');
        }

        const senhaValida = await bcrypt.compare(data.password, user.senha_hash);

        if (!senhaValida) {
            throw new Error('CREDENCIAIS_INVALIDAS');
        }

        pool.query(AuthQueries.UPDATE_LAST_LOGIN, [user.id]).catch(err => {
            console.error('[AuthService] Update last_login failed:', err);
        });

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET missing in .env");
            throw new Error('ERRO_INTERNO');
        }

        const payload: JWTPayload = {
            sub: user.id,
            email: user.email,
            empresa_id: user.empresa_id,
            role: user.role_nome
        };

        const token = jwt.sign(payload, jwtSecret, { expiresIn: '24h' });

        return {
            token,
            expiresIn: 86400,
            usuario: {
                id: user.id,
                nome: user.nome,
                email: user.email,
                role: user.role_nome as UserRole
            },
            empresa: {
                id: user.empresa_id,
                nome: user.empresa_nome,
                status: user.empresa_status
            }
        };
    }

    public async logout(token: string | undefined): Promise<void> {
        if (!token) return;
    }
}