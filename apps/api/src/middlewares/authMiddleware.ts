// src/middlewares/authMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/db';

interface DecodedToken {
    id: string;
    email: string;
    role: string;
    empresa_id: string;
    iat: number;
    exp: number;
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }

    const parts = authHeader.split(' ');
    
    // Verifica se tem 2 partes E se a segunda parte existe (pra calar o TypeScript)
    if (parts.length !== 2 || !parts[1]) {
        return res.status(401).json({ error: 'Formato de token inválido.' });
    }
    
    // 'as string' garante que o token é string (resolve o erro no 1º argumento)
    const token = parts[1] as string;
    
    // Fallback para garantir string (resolve o erro no 2º argumento)
    const secretKey = process.env.JWT_SECRET || '';

    if (!secretKey) {
        console.error("❌ FATAL: JWT_SECRET não configurado no .env");
        return res.status(500).json({ error: 'Erro interno de configuração.' });
    }

    try {
        // Agora ambos são strings garantidas
        const decoded = jwt.verify(token, secretKey) as unknown as DecodedToken;

        const query = 'SELECT status FROM empresas WHERE id = $1';
        const result = await pool.query(query, [decoded.empresa_id]);

        if (result.rowCount === 0) {
            return res.status(401).json({ error: 'Empresa vinculada não encontrada.' });
        }

        if (result.rows[0].status !== 'ativo') {
            return res.status(403).json({ 
                error: 'Acesso Bloqueado',
                message: 'O acesso da sua organização foi suspenso.' 
            });
        }

        (req as any).user = {
            ...decoded,
            empresaId: decoded.empresa_id,
            sub: decoded.id
        };
        
        return next();

    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
};