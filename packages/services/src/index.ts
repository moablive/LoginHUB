import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@loginhub/database';
import { aplicativos, usuarios, niveisAcesso } from '@loginhub/schema';
import { eq, and, ne } from 'drizzle-orm';
import {
    LoginInputDTO,
    LoginResponseDTO,
    JWTPayload,
    UserRole,
    CreateAppDTO,
    UpdateAppDTO,
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
            senha_padrao: usuarios.senhaPadrao,
            app_id: usuarios.appId,
            app_nome: aplicativos.nome,
            app_status: aplicativos.status,
            role_nome: niveisAcesso.nome
        })
        .from(usuarios)
        .innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
        .innerJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
        .where(eq(usuarios.email, data.email))
        .limit(1);

        const user = result[0];

        if (!user) throw new Error('CREDENCIAIS_INVALIDAS');
        if (user.app_status !== 'ativo') throw new Error('APP_BLOQUEADO');

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
            app_id: user.app_id ? user.app_id.toString() : "0",
            role: user.role_nome || 'user'
        };

        const token = jwt.sign(payload, jwtSecret, { expiresIn: '24h' });

        return {
            token,
            expiresIn: 86400,
            requirePasswordChange: user.senha_padrao,
            usuario: {
                id: user.id.toString(),
                nome: user.nome,
                email: user.email,
                role: user.role_nome as UserRole
            },
            app: {
                id: user.app_id ? user.app_id.toString() : "0",
                nome: user.app_nome,
                status: user.app_status || 'ativo'
            }
        };
    }

    public async logout(token: string | undefined): Promise<void> {
        if (!token) return;
    }

    public async changePassword(userId: string, novaSenha: string): Promise<void> {
        const userRes = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, Number(userId))).limit(1);
        if (userRes.length === 0) throw new Error('Usuário não encontrado.');
        
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(novaSenha, salt);
        
        await db.update(usuarios)
            .set({ senhaHash, senhaPadrao: false })
            .where(eq(usuarios.id, Number(userId)));
    }
}

// ==========================================
// 2. APP SERVICE
// ==========================================
export class AppService {
    public async registerApp(data: CreateAppDTO) {
        try {
            return await db.transaction(async (tx) => {
                const appRes = await tx.insert(aplicativos).values({
                    nome: data.nome,
                    documento: data.documento,
                    email: data.email,
                    telefone: data.telefone || null,
                }).returning({ id: aplicativos.id });

                const appId = appRes[0].id;

                const salt = await bcrypt.genSalt(10);
                const passwordHash = await bcrypt.hash(data.password, salt);

                const roleRes = await tx.select({ id: niveisAcesso.id }).from(niveisAcesso).where(eq(niveisAcesso.nome, 'admin')).limit(1);
                let roleId = roleRes.length > 0 ? roleRes[0].id : null;
                
                if (!roleId) {
                     const fallbackRole = await tx.insert(niveisAcesso).values({ nome: 'admin' }).returning({ id: niveisAcesso.id });
                     roleId = fallbackRole[0].id;
                }

                await tx.insert(usuarios).values({
                    appId: appId,
                    nivelAcessoId: roleId,
                    nome: data.admin_nome,
                    email: data.admin_email,
                    senhaHash: passwordHash,
                    telefone: data.admin_telefone || null
                });

                return {
                    appId,
                    nome: data.nome,
                    documento: data.documento,
                    email: data.email,
                    adminEmail: data.admin_email,
                    message: 'Aplicativo e usuário administrador criados com sucesso'
                };
            });
        } catch (error: any) {
            if (error.code === '23505') throw Object.assign(new Error('Documento (CNPJ) ou E-mail já estão em uso.'), { code: 'DUPLICATE_ENTRY' });
            throw error;
        }
    }

    public async getAllApps() {
        const rows = await db.select().from(aplicativos);
        const allUsers = await db.select({ appId: usuarios.appId }).from(usuarios);

        return rows.map(row => {
            const total_usuarios = allUsers.filter(u => u.appId === row.id).length;
            return {
                ...row,
                data_cadastro: row.dataCadastro,
                data_atualizacao: row.dataAtualizacao,
                total_usuarios
            };
        });
    }

    public async getAppById(id: string) {
        const rows = await db.select().from(aplicativos).where(eq(aplicativos.id, Number(id))).limit(1);
        if (rows.length === 0) {
            const error = new Error('Aplicativo não encontrada');
            (error as any).code = 'NOT_FOUND';
            throw error;
        }
        
        const allUsers = await db.select({ appId: usuarios.appId }).from(usuarios).where(eq(usuarios.appId, Number(id)));
        
        return {
            ...rows[0],
            data_cadastro: rows[0].dataCadastro,
            data_atualizacao: rows[0].dataAtualizacao,
            total_usuarios: allUsers.length
        };
    }

    public async updateApp(id: string, data: UpdateAppDTO) {
        try {
            const updateData: any = {};
            if (data.nome !== undefined) updateData.nome = data.nome;
            if (data.email !== undefined) updateData.email = data.email;
            if (data.documento !== undefined) updateData.documento = data.documento;
            if (data.telefone !== undefined) updateData.telefone = data.telefone || null;

            if (Object.keys(updateData).length === 0) return null;

            const rows = await db.update(aplicativos)
                .set(updateData)
                .where(eq(aplicativos.id, Number(id)))
                .returning();

            if (rows.length === 0) {
                const error = new Error('Aplicativo não encontrada');
                (error as any).code = 'NOT_FOUND';
                throw error;
            }
            return rows[0];

        } catch (error: any) {
            if (error.code === '23505') {
                const newError = new Error('Documento (CNPJ) ou E-mail já estão em uso por outra app.');
                (newError as any).code = 'DUPLICATE_ENTRY';
                throw newError;
            }
            throw error;
        }
    }

    public async updateAppStatus(id: string, status: 'ativo' | 'inativo') {
        const rows = await db.update(aplicativos)
            .set({ status })
            .where(eq(aplicativos.id, Number(id)))
            .returning();

        if (rows.length === 0) throw Object.assign(new Error('Aplicativo não encontrada'), { code: 'NOT_FOUND' });
        return rows[0];
    }

    public async deleteApp(id: string) {
        const rows = await db.delete(aplicativos).where(eq(aplicativos.id, Number(id))).returning();
        if (rows.length === 0) throw Object.assign(new Error('Aplicativo não encontrada'), { code: 'NOT_FOUND' });
    }
}

// ==========================================
// 3. USER SERVICE
// ==========================================
export class UserService {
    public async addUser(data: CreateUserDTO): Promise<void> {
        if (!data.app_id) throw Object.assign(new Error('Aplicativo é obrigatória'), { code: 'VALIDATION' });
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
                appId: Number(data.app_id),
                nivelAcessoId: roleId,
                nome: data.nome || '',
                email: data.email,
                senhaHash: passwordHash,
                telefone: data.telefone || null
            });
        } catch (error: any) {
            if (error.code === '23505') throw Object.assign(new Error('E-mail já está em uso.'), { code: 'DUPLICATE_ENTRY' });
            if (error.code === '23503') throw Object.assign(new Error('A app informada não existe.'), { code: 'RELATION_ERROR' });
            throw error;
        }
    }

    public async getAllUsersGlobal(): Promise<UserResponse[]> {
        const rows = await db.select({
            id: usuarios.id,
            app_id: usuarios.appId,
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

    public async getUsersByApp(appId: string): Promise<UserResponse[]> {
        const rows = await db.select({
            id: usuarios.id,
            app_id: usuarios.appId,
            nome: usuarios.nome,
            email: usuarios.email,
            telefone: usuarios.telefone,
            role: niveisAcesso.nome,
            status: niveisAcesso.nome 
        })
        .from(usuarios)
        .leftJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
        .where(eq(usuarios.appId, Number(appId)));

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

    public async resetUserPassword(id: string) {
        const userRes = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, Number(id))).limit(1);
        if (userRes.length === 0) {
            const error = new Error('Usuário não encontrado.');
            (error as any).code = 'NOT_FOUND';
            throw error;
        }
        
        const randomPassword = Math.random().toString(36).slice(-8);
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(randomPassword, salt);
        
        await db.update(usuarios)
            .set({ senhaHash, senhaPadrao: true })
            .where(eq(usuarios.id, Number(id)));
            
        return { tempPassword: randomPassword };
    }
}
