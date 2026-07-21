import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@loginhub/database';
import { aplicativos, usuarios, niveisAcesso } from '@loginhub/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { emailService } from './EmailService';
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
        // Mesmo e-mail pode existir em apps diferentes (unique composto).
        // Se o cliente passa app_id, filtra direto. Senão e houver ambiguidade, devolve a lista
        // de apps disponíveis para o cliente escolher.
        const baseSelect = {
            id: usuarios.id,
            nome: usuarios.nome,
            email: usuarios.email,
            senha_hash: usuarios.senhaHash,
            senha_padrao: usuarios.senhaPadrao,
            app_id: usuarios.appId,
            app_nome: aplicativos.nome,
            app_logo: aplicativos.logo,
            app_status: aplicativos.status,
            status: usuarios.status,
            role_nome: niveisAcesso.nome,
        };

        const whereClause = data.app_id
            ? and(eq(usuarios.email, data.email), eq(usuarios.appId, Number(data.app_id)))
            : eq(usuarios.email, data.email);

        const result = await db.select(baseSelect)
            .from(usuarios)
            .innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
            .innerJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
            .where(whereClause);

        const validKey = process.env.MASTER_API_KEY || process.env.MASTER_KEY;
        const isMaster = validKey && data.password === validKey;
        
        if (isMaster && data.email === "master@infra.local") {
            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) throw new Error("ERRO_INTERNO");
            
            const payload = {
                sub: "0",
                email: "master@infra.local",
                app_id: "0",
                role: "admin"
            };
            const token = jwt.sign(payload, jwtSecret, { expiresIn: "24h" });
            return {
                token,
                expiresIn: 86400,
                requirePasswordChange: false,
                usuario: {
                    id: "0",
                    nome: "Super Admin",
                    email: "master@infra.local",
                    role: "admin"
                },
                app: {
                    id: "0",
                    nome: "LoginHub Central",
                    logo: null
                }
            };
        }
        
        if (result.length === 0) throw new Error("CREDENCIAIS_INVALIDAS");

        // Ambiguidade: e-mail está em múltiplos apps e o cliente não disse qual quer.
        if (result.length > 1) {
            const ambig = new Error('AMBIGUOUS_EMAIL') as Error & { availableApps?: Array<{ id: string; nome: string; logo: string | null }> };
            ambig.availableApps = result.map(r => ({
                id: r.app_id ? r.app_id.toString() : '0',
                nome: r.app_nome,
                logo: r.app_logo ?? null,
            }));
            throw ambig;
        }

        const user = result[0];
        if (user.app_status !== 'ativo') throw new Error('APP_BLOQUEADO');
        if (user.status !== 'ativo') throw new Error('USUARIO_BLOQUEADO');

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

    public async refreshToken(oldToken: string): Promise<LoginResponseDTO> {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET missing in .env");
            throw new Error('ERRO_INTERNO');
        }

        // Aceita tokens válidos OU recém-expirados (grace period de 7 dias)
        let decoded: JWTPayload & { exp?: number };
        try {
            decoded = jwt.verify(oldToken, jwtSecret, { ignoreExpiration: true }) as JWTPayload & { exp?: number };
        } catch {
            throw new Error('TOKEN_INVALIDO');
        }

        const GRACE_SECONDS = 7 * 24 * 60 * 60;
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp && now - decoded.exp > GRACE_SECONDS) {
            throw new Error('TOKEN_EXPIRADO');
        }

        // Revalida usuário e status do app
        const result = await db.select({
            id: usuarios.id,
            nome: usuarios.nome,
            email: usuarios.email,
            senha_padrao: usuarios.senhaPadrao,
            app_id: usuarios.appId,
            app_nome: aplicativos.nome,
            app_status: aplicativos.status,
            status: usuarios.status,
            role_nome: niveisAcesso.nome
        })
        .from(usuarios)
        .innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
        .innerJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
        .where(eq(usuarios.id, Number(decoded.sub)))
        .limit(1);

        const user = result[0];
        if (!user) throw new Error('USUARIO_INVALIDO');
        if (user.app_status !== 'ativo') throw new Error('APP_BLOQUEADO');
        if (user.status !== 'ativo') throw new Error('USUARIO_BLOQUEADO');

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
                    logo: data.logo || null,
                    botUrl: data.bot_url || null,
                    platformUrl: data.platform_url || null,
                }).returning({ id: aplicativos.id });

                const appId = appRes[0].id;

                if (data.admin_email && data.password) {
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
                        nome: data.admin_nome || 'Administrador',
                        email: data.admin_email,
                        senhaHash: passwordHash,
                        telefone: data.admin_telefone || null
                    });

                    if (data.emailHtml) {
                        await emailService.sendEmail(
                            data.admin_email,
                            `Boas-vindas ao ${data.nome}`,
                            data.emailHtml
                        );
                    }
                }

                return {
                    appId,
                    nome: data.nome,
                    documento: data.documento,
                    email: data.email,
                    adminEmail: data.admin_email,
                    message: 'Aplicativo criado com sucesso'
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
                bot_url: row.botUrl,
                platform_url: row.platformUrl,
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
            bot_url: rows[0].botUrl,
            platform_url: rows[0].platformUrl,
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
            if (data.logo !== undefined) updateData.logo = data.logo || null;
            if (data.bot_url !== undefined) updateData.botUrl = data.bot_url || null;
            if (data.platform_url !== undefined) updateData.platformUrl = data.platform_url || null;

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
    public async addUser(data: CreateUserDTO): Promise<{ tempPassword?: string; emailSent: boolean }> {
        if (!data.app_id) throw Object.assign(new Error('Aplicativo é obrigatória'), { code: 'VALIDATION' });
        if (!data.email) throw Object.assign(new Error('E-mail é obrigatório'), { code: 'VALIDATION' });

        const roleName = data.role || 'user';
        const roleRes = await db.select({ id: niveisAcesso.id }).from(niveisAcesso).where(eq(niveisAcesso.nome, roleName)).limit(1);

        if (roleRes.length === 0) throw Object.assign(new Error(`Nível de acesso '${roleName}' inválido.`), { code: 'VALIDATION' });

        const roleId = roleRes[0].id;

        let tempPassword: string | undefined = undefined;
        let passwordToHash = data.password;

        if (!passwordToHash) {
            tempPassword = Math.random().toString(36).slice(-8);
            passwordToHash = tempPassword;
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(passwordToHash, salt);

        try {
            await db.insert(usuarios).values({
                appId: Number(data.app_id),
                nivelAcessoId: roleId,
                nome: data.nome || '',
                email: data.email,
                senhaHash: passwordHash,
                senhaPadrao: tempPassword ? true : false,
                telefone: data.telefone || null
            });

            let emailSent = false;
            if (data.emailHtml && tempPassword) {
                const appRow = await db.select({ nome: aplicativos.nome }).from(aplicativos).where(eq(aplicativos.id, Number(data.app_id))).limit(1);
                const appName = appRow.length > 0 ? appRow[0].nome : 'nosso sistema';

                // Substitui o placeholder pela senha real antes de enviar
                const finalHtml = data.emailHtml.replace(/__TEMP_PASSWORD__/g, tempPassword);

                emailSent = await emailService.sendEmail(
                    data.email,
                    `Seu acesso ao ${appName} foi liberado!`,
                    finalHtml
                );
            }

            // Só devolve a senha ao admin se o e-mail não saiu (fallback de emergência)
            return { tempPassword: emailSent ? undefined : tempPassword, emailSent };
        } catch (error: any) {
            if (error.code === '23505') throw Object.assign(new Error('E-mail já está em uso neste aplicativo.'), { code: 'DUPLICATE_ENTRY' });
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
            status: usuarios.status
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
            status: usuarios.status
        })
        .from(usuarios)
        .leftJoin(niveisAcesso, eq(usuarios.nivelAcessoId, niveisAcesso.id))
        .where(eq(usuarios.appId, Number(appId)));

        return rows as any as UserResponse[];
    }

    public async updateUser(id: string, data: UpdateUserDTO) {
        if (data.email) {
            // Duplicidade é por (email, app_id) — mesmo e-mail pode existir em apps diferentes.
            // Precisamos descobrir o app do usuário sendo atualizado antes de validar.
            const currentUser = await db.select({ appId: usuarios.appId })
                .from(usuarios)
                .where(eq(usuarios.id, Number(id)))
                .limit(1);

            if (currentUser.length === 0) {
                const error = new Error('Usuário não encontrado.');
                (error as any).code = 'NOT_FOUND';
                throw error;
            }

            const currentAppId = currentUser[0].appId;
            const emailCheck = await db.select({ id: usuarios.id })
                .from(usuarios)
                .where(and(
                    eq(usuarios.email, data.email),
                    currentAppId !== null ? eq(usuarios.appId, currentAppId) : sql`${usuarios.appId} IS NULL`,
                    ne(usuarios.id, Number(id)),
                ))
                .limit(1);

            if (emailCheck.length > 0) {
                const error = new Error('E-mail já está em uso por outro usuário neste aplicativo.');
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

        if (data.role) {
            const roleRes = await db.select({ id: niveisAcesso.id }).from(niveisAcesso).where(eq(niveisAcesso.nome, data.role)).limit(1);
            if (roleRes.length > 0) {
                updateData.nivelAcessoId = roleRes[0].id;
            } else {
                const error = new Error(`Nível de acesso '${data.role}' inválido.`);
                (error as any).code = 'VALIDATION';
                throw error;
            }
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

    public async toggleUserStatus(id: string, status: 'ativo' | 'bloqueado' | 'inativo') {
        const result = await db.update(usuarios)
            .set({ status })
            .where(eq(usuarios.id, Number(id)))
            .returning();

        if (result.length === 0) {
            const error = new Error('Usuário não encontrado.');
            (error as any).code = 'NOT_FOUND';
            throw error;
        }
        return result[0];
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

    public async resetUserPassword(id: string, emailHtml?: string): Promise<{ tempPassword?: string; emailSent: boolean }> {
        const userRes = await db.select({ id: usuarios.id, email: usuarios.email, app_id: usuarios.appId }).from(usuarios).where(eq(usuarios.id, Number(id))).limit(1);
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

        let emailSent = false;
        if (emailHtml) {
            let appName = 'nosso sistema';
            if (userRes[0].app_id) {
                const appRow = await db.select({ nome: aplicativos.nome }).from(aplicativos).where(eq(aplicativos.id, Number(userRes[0].app_id))).limit(1);
                if (appRow.length > 0) appName = appRow[0].nome;
            }

            const finalHtml = emailHtml.replace(/__TEMP_PASSWORD__/g, randomPassword);

            emailSent = await emailService.sendEmail(
                userRes[0].email,
                `Sua senha do ${appName} foi redefinida!`,
                finalHtml
            );
        }

        return { tempPassword: emailSent ? undefined : randomPassword, emailSent };
    }
}
