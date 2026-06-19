import cors, { CorsOptions } from 'cors';

// Lista de domínios permitidos explicitamente
const ALLOWED_ORIGINS = [
    'https://astralwavelabel.com',
    'https://www.astralwavelabel.com'
];

const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        // 1. Permitir requisições sem 'origin' (Postman, cURL, Server-to-Server)
        if (!origin) {
            return callback(null, true);
        }

        // 2. Permitir Localhost (Desenvolvimento)
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
            return callback(null, true);
        }

        // 3. Permitir Domínios da Whitelist (Produção)
        if (ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }

        // 4. Bloquear resto
        return callback(new Error('Bloqueado por CORS: Origem não permitida.'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'x-master-key'
    ], 
    
    credentials: true,
    optionsSuccessStatus: 200
};

export const corsMiddleware = cors(corsOptions);