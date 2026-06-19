import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@loginhub/schema';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'admin_root',
    password: process.env.DB_PASS || process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'login_hub',
    connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
    console.error('🔥 Erro Crítico/Queda na conexão com o Banco (Drizzle Pool):', err);
});

export const testConnection = async () => {
    try {
        const client = await pool.connect();
        console.log(`✅ Banco de Dados Conectado com Sucesso via Drizzle!`);
        client.release();
        return true;
    } catch (error: any) {
        console.error('❌ Falha Crítica ao conectar no Banco via Drizzle:', error.message);
        throw error;
    }
};

export const db = drizzle(pool, { schema });
