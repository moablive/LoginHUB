// src/middlewares/adminMiddleware.ts

import { Request, Response, NextFunction } from 'express';

export const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const validKey = process.env.MASTER_API_KEY;

    // Fail-safe: Bloqueia se a configuração do servidor estiver incorreta
    if (!validKey) {
        console.error('❌ FATAL: MASTER_API_KEY ausente no .env');
        return res.status(500).json({ error: 'Erro de configuração do servidor.' });
    }

    const headerValue = req.headers['x-api-key'];
    
    // Normaliza caso o header venha como array de strings
    const apiKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!apiKey || apiKey !== validKey) {
        console.warn(`[AdminAuth] Acesso negado. IP: ${req.ip}`);
        return res.status(403).json({ 
            error: 'Acesso Proibido',
            message: 'Credencial mestre inválida ou ausente.' 
        });
    }

    return next();
};