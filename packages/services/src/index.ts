import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@loginhub/database';
import { empresas, usuarios, niveisAcesso } from '@loginhub/schema';
import { eq, and, ne } from 'drizzle-orm';
import {
    LoginInputDTO,
    LoginResponseDTO,
    JWTPayload,
    UserRole,
    CreateCompanyDTO,
    UpdateCompanyDTO,
    CreateUserDTO,
    UpdateUserDTO,
    User as UserResponse
} from '@loginhub/schema';

// ==========================================
// 1. AUTH SERVICE
// ==========================================
export class AuthService {
    public async login(data: LoginInputDTO): Promise<LoginResponseDTO> {
        const result = await db.select({
            id: usuarios.id,
            nome: usuarios.nome,
            email: usuarios.email,
            senha_hash: usuarios.senhaHash,
            empresa_id: usuarios.empresaId,
            empresa_nome: empresas.nome,
            empresa_status: empresas.status,
            role_nome: niveisAcesso.nome
        })
        .from(usuarios)
        .innerJoin(empresas, eq(usuarios.empresaId, empresas.id))
        .innerJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
        .where(eq(usuarios.email, data.email))
        .limit(1);

        const user = result[0];

        if (!user) throw new Error('CREDENCIAIS_INVALIDAS');
        if (user.empresa_status !== 'ativo') throw new Error('EMPRESA_BLOQUEADA');

        const senhaValida = await bcrypt.compare(data.password, user.senha_hash);
        if (!senhaValida) throw new Error('CREDENCIAIS_INVALIDAS');

        db.update(usuarios)
          .set({ ultimoAcesso: new Date() })
          .where(eq(usuarios.id, user.id))
          .execute()
          .catch(err => console.error('[AuthService] Update last_login failed:', err));

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET missing in .env");
            throw new Error('ERRO_INTERNO');
        }

        const payload: JWTPayload = {
            sub: user.id.toString(),
            email: user.email,
            empresa_id: user.empresa_id ? user.empresa_id.toString() : "0",
            role: user.role_nome || 'user'
        };

        const token = jwt.sign(payload, jwtSecret, { expiresIn: '24h' });

        return {
            token,
            expiresIn: 86400,
            usuario: {
                id: user.id.toString(),
                nome: user.nome,
                email: user.email,
                role: user.role_nome as UserRole
            },
            empresa: {
                id: user.empresa_id ? user.empresa_id.toString() : "0",
                nome: user.empresa_nome,
                status: user.empresa_status || 'ativo'
            }
        };
    }

    public async logout(token: string | undefined): Promise<void> {
        if (!token) return;
    }
}

// ==========================================
// 2. COMPANY SERVICE
// ==========================================
export class CompanyService {
    public async registerCompany(data: CreateCompanyDTO) {
        try {
            return await db.transaction(async (tx) => {
                const companyRes = await tx.insert(empresas).values({
                    nome: data.nome,
                    documento: data.documento,
                    email: data.email,
                    telefone: data.telefone || null,
                }).returning({ id: empresas.id });

                const empresaId = companyRes[0].id;

                const salt = await bcrypt.genSalt(10);
                const passwordHash = await bcrypt.hash(data.password, salt);

                const roleRes = await tx.select({ id: niveisAcesso.id }).from(niveisAcesso).where(eq(niveisAcesso.nome, 'admin')).limit(1);
                let roleId = roleRes.length > 0 ? roleRes[0].id : null;
                
                if (!roleId) {
                     const fallbackRole = await tx.insert(niveisAcesso).values({ nome: 'admin' }).returning({ id: niveisAcesso.id });
                     roleId = fallbackRole[0].id;
                }

                await tx.insert(usuarios).values({
                    empresaId: empresaId,
                    nivelAcessoId: roleId,
                    nome: data.admin_nome,
                    email: data.admin_email,
                    senhaHash: passwordHash,
                    telefone: data.admin_telefone || null
                });

                return {
                    empresaId,
                    nome: data.nome,
                    documento: data.documento,
                    email: data.email,
                    adminEmail: data.admin_email,
                    message: 'Empresa e usuário administrador criados com sucesso'
                };
            });
        } catch (error: any) {
            if (error.code === '23505') throw Object.assign(new Error('Documento (CNPJ) ou E-mail já estão em uso.'), { code: 'DUPLICATE_ENTRY' });
            throw error;
        }
    }

    public async getAllCompanies() {
        return await db.select().from(empresas);
    }

    public async getCompanyById(id: string) {
        const rows = await db.select().from(empresas).where(eq(empresas.id, Number(id))).limit(1);
        if (rows.length === 0) {
            const error = new Error('Empresa não encontrada');
            (error as any).code = 'NOT_FOUND';
            throw error;
        }
        return rows[0];
    }

    public async updateCompany(id: string, data: UpdateCompanyDTO) {
        try {
            const updateData: any = {};
            if (data.nome !== undefined) updateData.nome = data.nome;
            if (data.email !== undefined) updateData.email = data.email;
            if (data.documento !== undefined) updateData.documento = data.documento;
            if (data.telefone !== undefined) updateData.telefone = data.telefone || null;

            if (Object.keys(updateData).length === 0) return null;

            const rows = await db.update(empresas)
                .set(updateData)
                .where(eq(empresas.id, Number(id)))
                .returning();

            if (rows.length === 0) {
                const error = new Error('Empresa não encontrada');
                (error as any).code = 'NOT_FOUND';
                throw error;
            }
            return rows[0];

        } catch (error: any) {
            if (error.code === '23505') {
                const newError = new Error('Documento (CNPJ) ou E-mail já estão em uso por outra empresa.');
                (newError as any).code = 'DUPLICATE_ENTRY';
                throw newError;
            }
            throw error;
        }
    }

    public async updateCompanyStatus(id: string, status: 'ativo' | 'inativo') {
        const rows = await db.update(empresas)
            .set({ status })
            .where(eq(empresas.id, Number(id)))
            .returning();

        if (rows.length === 0) throw Object.assign(new Error('Empresa não encontrada'), { code: 'NOT_FOUND' });
        return rows[0];
    }

    public async deleteCompany(id: string) {
        const rows = await db.delete(empresas).where(eq(empresas.id, Number(id))).returning();
        if (rows.length === 0) throw Object.assign(new Error('Empresa não encontrada'), { code: 'NOT_FOUND' });
    }
}

// ==========================================
// 3. USER SERVICE
// ==========================================
export class UserService {
    public async addUser(data: CreateUserDTO): Promise<void> {
        if (!data.empresa_id) throw Object.assign(new Error('Empresa é obrigatória'), { code: 'VALIDATION' });
        if (!data.email) throw Object.assign(new Error('E-mail é obrigatório'), { code: 'VALIDATION' });
        if (!data.password) throw Object.assign(new Error('Senha é obrigatória'), { code: 'VALIDATION' });

        const roleName = data.role || 'user';
        const roleRes = await db.select({ id: niveisAcesso.id }).from(niveisAcesso).where(eq(niveisAcesso.nome, roleName)).limit(1);
        
        if (roleRes.length === 0) throw Object.assign(new Error(`Nível de acesso '${roleName}' inválido.`), { code: 'VALIDATION' });
        
        const roleId = roleRes[0].id;
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(data.password, salt);

        try {
            await db.insert(usuarios).values({
                empresaId: Number(data.empresa_id),
                nivelAcessoId: roleId,
                nome: data.nome || '',
                email: data.email,
                senhaHash: passwordHash,
                telefone: data.telefone || null
            });
        } catch (error: any) {
            if (error.code === '23505') throw Object.assign(new Error('E-mail já está em uso.'), { code: 'DUPLICATE_ENTRY' });
            if (error.code === '23503') throw Object.assign(new Error('A empresa informada não existe.'), { code: 'RELATION_ERROR' });
            throw error;
        }
    }

    public async getAllUsersGlobal(): Promise<UserResponse[]> {
        const rows = await db.select({
            id: usuarios.id,
            empresa_id: usuarios.empresaId,
            nome: usuarios.nome,
            email: usuarios.email,
            telefone: usuarios.telefone,
            role: niveisAcesso.nome,
            status: niveisAcesso.nome
        })
        .from(usuarios)
        .leftJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id));

        return rows as any as UserResponse[];
    }

    public async getUsersByCompany(empresaId: string): Promise<UserResponse[]> {
        const rows = await db.select({
            id: usuarios.id,
            empresa_id: usuarios.empresaId,
            nome: usuarios.nome,
            email: usuarios.email,
            telefone: usuarios.telefone,
            role: niveisAcesso.nome,
            status: niveisAcesso.nome 
        })
        .from(usuarios)
        .leftJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
        .where(eq(usuarios.empresaId, Number(empresaId)));

        return rows as any as UserResponse[];
    }

    public async updateUser(id: string, data: UpdateUserDTO) {
        if (data.email) {
            const emailCheck = await db.select({ id: usuarios.id })
                .from(usuarios)
                .where(and(eq(usuarios.email, data.email), ne(usuarios.id, Number(id))))
                .limit(1);

            if (emailCheck.length > 0) {
                const error = new Error('E-mail já está em uso por outro usuário.');
                (error as any).code = 'DUPLICATE_ENTRY';
                throw error;
            }
        }

        const updateData: any = {};
        if (data.nome !== undefined) updateData.nome = data.nome;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.telefone !== undefined) updateData.telefone = data.telefone || null;

        if (data.password && data.password.trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            updateData.senhaHash = await bcrypt.hash(data.password, salt);
        }

        if (Object.keys(updateData).length > 0) {
            const result = await db.update(usuarios)
                .set(updateData)
                .where(eq(usuarios.id, Number(id)))
                .returning();

            if (result.length === 0) {
                const error = new Error('Usuário não encontrado.');
                (error as any).code = 'NOT_FOUND';
                throw error;
            }
            return result[0];
        }
        return null;
    }

    public async removeUser(id: string): Promise<void> {
        try {
            const result = await db.delete(usuarios).where(eq(usuarios.id, Number(id))).returning();
            
            if (result.length === 0) {
                const error = new Error('Usuário não encontrado.');
                (error as any).message = 'Usuário não encontrado.';
                throw error;
            }
        } catch (error: any) {
            if (error.code === '23503') { 
                throw new Error('Não é possível remover este usuário pois ele possui registros vinculados.');
            }
            throw error;
        }
    }
}
