import bcrypt from 'bcryptjs';
import pool from '../../db/db';
import { EmpresaQueries } from '../../db/queries/empresa.queries';
import { UsuarioQueries } from '../../db/queries/usuario.queries';
import { CreateCompanyDTO, UpdateCompanyDTO } from '@loginhub/shared';

export class CompanyService {

    public async registerCompany(data: CreateCompanyDTO) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Cria a empresa
            const companyRes = await client.query(EmpresaQueries.CREATE, [
                data.nome,
                data.documento,
                data.email,
                data.telefone || null,
            ]);

            const empresaId = companyRes.rows[0].id;

            // Gera hash da senha
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(data.password, salt);

            // Cria o usuário admin vinculado
            await client.query(UsuarioQueries.CREATE, [
                empresaId,
                'admin', 
                data.admin_nome,
                data.admin_email,
                passwordHash,
                data.admin_telefone || null
            ]);

            await client.query('COMMIT');

            return {
                empresaId,
                nome: data.nome,
                documento: data.documento,
                email: data.email,
                adminEmail: data.admin_email,
                message: 'Empresa e usuário administrador criados com sucesso'
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    public async getAllCompanies() {
        const { rows } = await pool.query(EmpresaQueries.LIST_ALL);
        return rows;
    }

    public async getCompanyById(id: string) {
        const { rows } = await pool.query(EmpresaQueries.FIND_BY_ID, [id]);
        
        if (rows.length === 0) {
            const error = new Error('Empresa não encontrada');
            (error as any).code = 'NOT_FOUND';
            throw error;
        }

        return rows[0];
    }

    public async updateCompany(id: string, data: UpdateCompanyDTO) {
        try {
            const { rows, rowCount } = await pool.query(
                EmpresaQueries.UPDATE, 
                [
                    data.nome, 
                    data.email, 
                    data.documento, 
                    data.telefone || null, 
                    id
                ]
            );

            if (rowCount === 0) {
                const error = new Error('Empresa não encontrada');
                (error as any).code = 'NOT_FOUND';
                throw error;
            }

            return rows[0];

        } catch (error: any) {
            // Tratamento de erro para CNPJ ou Email duplicado (código Postgres 23505)
            if (error.code === '23505') {
                const newError = new Error('Documento (CNPJ) ou E-mail já estão em uso por outra empresa.');
                (newError as any).code = 'DUPLICATE_ENTRY';
                throw newError;
            }
            throw error;
        }
    }

    public async updateCompanyStatus(id: string, status: 'ativo' | 'inativo') {
        const { rows, rowCount } = await pool.query(
            EmpresaQueries.UPDATE_STATUS,
            [status, id]
        );

        if (rowCount === 0) {
            throw Object.assign(new Error('Empresa não encontrada'), { code: 'NOT_FOUND' });
        }

        return rows[0];
    }

    public async deleteCompany(id: string) {
        const { rowCount } = await pool.query(EmpresaQueries.DELETE, [id]);
        
        if (rowCount === 0) {
            throw Object.assign(new Error('Empresa não encontrada'), { code: 'NOT_FOUND' });
        }
    }
}