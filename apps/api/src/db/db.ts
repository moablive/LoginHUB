import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Configuração flexível baseada puramente em variáveis de ambiente
// Isso funciona tanto no Docker (interno) quanto no Mac (externo), basta configurar o .env corretamente.
const dbConfig: PoolConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'admin_root',
    password: process.env.DB_PASS || process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'login_hub',
    connectionTimeoutMillis: 10000, 
};

console.log(`🔌 Tentando conectar ao banco: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
    console.error('🔥 Erro Crítico/Queda na conexão com o Banco:', err);
});

export const testConnection = async () => {
    try {
        const client = await pool.connect();
        console.log(`✅ Banco de Dados Conectado com Sucesso!`);
        client.release();
        return true;
    } catch (error: any) {
        console.error('❌ Falha Crítica ao conectar no Banco:', error.message);
        throw error; 
    }
};

export default pool;
