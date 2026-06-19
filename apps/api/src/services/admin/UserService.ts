import bcrypt from 'bcryptjs';
import pool from '../../db/db';
import { UsuarioQueries } from '../../db/queries/usuario.queries';
import { CreateUserDTO, UpdateUserDTO, User as UserResponse } from '@loginhub/shared';

export class UserService {

    /**
     * Cria um novo usuário vinculado a uma empresa
     */
    public async addUser(data: CreateUserDTO): Promise<void> {
        // Validações básicas
        if (!data.empresa_id) throw Object.assign(new Error('Empresa é obrigatória'), { code: 'VALIDATION' });
        if (!data.email) throw Object.assign(new Error('E-mail é obrigatório'), { code: 'VALIDATION' });
        if (!data.password) throw Object.assign(new Error('Senha é obrigatória'), { code: 'VALIDATION' });

        // Validação de Role (Correção do Bug de NULL)
        const roleName = data.role || 'user';
        const roleRes = await pool.query('SELECT id FROM niveis_acesso WHERE nome = $1', [roleName]);
        
        if (roleRes.rows.length === 0) {
            throw Object.assign(new Error(`Nível de acesso '${roleName}' inválido.`), { code: 'VALIDATION' });
        }
        
        const roleId = roleRes.rows[0].id;

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(data.password, salt);

        // Executa a query
        await pool.query(UsuarioQueries.CREATE, [
            data.empresa_id,
            roleId, // Passamos o ID validado diretamente
            data.nome || null,
            data.email,
            passwordHash,
            data.telefone || null
        ]);
    }

    /**
     * Lista todos os usuários (Visão Global / Super Admin)
     */
    public async getAllUsersGlobal(): Promise<UserResponse[]> {
        const { rows } = await pool.query<UserResponse>(UsuarioQueries.LIST_GLOBAL);
        return rows;
    }

    /**
     * Lista usuários de uma empresa específica
     */
    public async getUsersByCompany(empresaId: string): Promise<UserResponse[]> {
        const { rows } = await pool.query<UserResponse>(UsuarioQueries.LIST_BY_COMPANY, [empresaId]);
        return rows;
    }

    /**
     * Atualiza dados do usuário (Nome, Email, Telefone, Senha)
     */
    public async updateUser(id: string, data: UpdateUserDTO) {
        const client = await pool.connect();

        try {
            // 1. Verificar se o e-mail já está em uso por OUTRO usuário
            // A query CHECK_EMAIL_EXISTS espera: [email, id_do_usuario_atual]
            const emailCheck = await client.query(UsuarioQueries.CHECK_EMAIL_EXISTS, [
                data.email,
                id
            ]);

            if (emailCheck.rows.length > 0) {
                const error = new Error('E-mail já está em uso por outro usuário.');
                (error as any).code = 'DUPLICATE_ENTRY';
                throw error;
            }

            // 2. Tratar a senha (Hash ou Null)
            // Se a senha vier vazia ou undefined, enviamos null para o banco
            // A query usa COALESCE($4, senha_hash) para manter a antiga nesse caso.
            let passwordHash: string | null = null;
            
            if (data.password && data.password.trim().length > 0) {
                const salt = await bcrypt.genSalt(10);
                passwordHash = await bcrypt.hash(data.password, salt);
            }

            // 3. Executar Update
            // Ordem dos params na Query: nome($1), email($2), telefone($3), senha($4), id($5)
            const { rows, rowCount } = await client.query(UsuarioQueries.UPDATE, [
                data.nome,
                data.email,
                data.telefone || null, // Garante null se for undefined
                passwordHash, 
                id
            ]);

            if (rowCount === 0) {
                const error = new Error('Usuário não encontrado.');
                (error as any).code = 'NOT_FOUND';
                throw error;
            }

            return rows[0];

        } finally {
            client.release();
        }
    }

    /**
     * Remove o usuário com segurança usando Transação.
     */
    public async removeUser(id: string): Promise<void> {
        const client = await pool.connect();

        try {
            await client.query('BEGIN'); // Inicia transação

            // Tenta deletar o usuário
            const { rowCount } = await client.query(UsuarioQueries.DELETE, [id]);

            if (rowCount === 0) {
                // Se não deletou nada, força erro para cair no catch e fazer rollback (se houvesse outras ops)
                // Mas aqui lançamos erro específico para a controller saber que não achou.
                const error = new Error('Usuário não encontrado.');
                (error as any).message = 'Usuário não encontrado.';
                throw error;
            }

            await client.query('COMMIT'); 
        } catch (error: any) {
            await client.query('ROLLBACK'); 
            
            // Tratamento específico para erro de chave estrangeira (FK violation)
            if (error.code === '23503') { 
                throw new Error('Não é possível remover este usuário pois ele possui registros vinculados.');
            }

            throw error;
        } finally {
            client.release();
        }
    }
}