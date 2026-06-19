import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  schema: '../schema/src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST as string,
    user: process.env.DB_USER as string || 'admin_root',
    password: process.env.DB_PASS as string || process.env.DB_PASSWORD as string,
    database: process.env.DB_NAME as string || 'login_hub',
    port: Number(process.env.DB_PORT) || 5432,
  },
});
