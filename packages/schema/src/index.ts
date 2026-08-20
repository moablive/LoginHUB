import { pgTable, serial, varchar, integer, timestamp, boolean, text, unique } from 'drizzle-orm/pg-core';

// ==========================================
// USER MODELS
// ==========================================
export type UserRole = 'master' | 'admin' | 'user' | 'suporte';

export interface User {
    id: string;
    nome: string;
    email: string;
    role: UserRole | string;
    app_id?: string | null; 
    app_nome?: string;
    status?: 'ativo' | 'inativo' | 'bloqueado' | string;
    telefone?: string | null;   
    ultimo_login?: Date | string | null;
    last_login?: string | null;
    created_at?: Date;
    senha_hash?: string;
    nivel_acesso_id?: string;
}

export interface CreateUserDTO {
    app_id: string; 
    nome: string;
    email: string;
    password?: string; 
    role?: UserRole | string;    
    telefone?: string | null; 
    emailHtml?: string;
    /**
     * Exige 2FA neste convite: o convidado define a senha e, na mesma tela,
     * escaneia o QR. Sem concluir, a conta não abre sessão.
     *
     * O app precisa estar em `TWOFA_APPS_HABILITADOS` — senão o convite é
     * recusado, em vez de criar uma conta que ninguém consegue usar.
     */
    exigir2FA?: boolean;
}

export interface UpdateUserDTO {
    nome: string;
    email: string;
    telefone?: string | undefined;
    password?: string | undefined;
    role?: UserRole | string; 
    status?: 'ativo' | 'inativo' | 'bloqueado' | string;
}

// ==========================================
// AUTH MODELS
// ==========================================
export interface LoginInputDTO {
    email: string;
    password: string;
    /**
     * ID do aplicativo (tenant) ao qual o usuário pertence. Opcional.
     * - Se informado: o login busca apenas usuários daquele app específico.
     * - Se omitido E o e-mail existir em mais de um app: o backend responde
     *   com erro `AMBIGUOUS_EMAIL` + lista `availableApps` para o cliente
     *   escolher qual app está tentando logar.
     */
    app_id?: string | undefined;
}

export interface AvailableAppSummary {
    id: string;
    nome: string;
    logo?: string | null;
}

export interface AmbiguousLoginResponse {
    error: 'AMBIGUOUS_EMAIL';
    message: string;
    availableApps: AvailableAppSummary[];
}

export interface LoginResponse {
    token: string;
    expiresIn?: number;
    usuario: User;
    app?: {
        id: string;
        nome: string;
        status: string;
    };
}

export interface LoginResponseDTO {
    token: string;
    expiresIn: number;
    usuario: {
        id: string;
        nome: string;
        email: string;
        role: string;
    };
    app: {
        id: string;
        nome: string;
        status: string;
    };
}

export interface JWTPayload {
    sub: string;
    email: string;
    app_id: string; 
    role: string;       
    iat?: number;
    exp?: number;
}

/**
 * Resposta do `/auth/setup-password`.
 *
 * Devolve uma sessão de verdade para a página emendar direto no enrolamento de
 * 2FA sem pedir login de novo. Não é concessão de segurança: quem acabou de usar
 * o magic link já controla a conta naquele instante.
 */
export interface SetupPasswordResponse {
    message: string;
    token: string;
    expiresIn: number;
    /** `true` quando o convite exigiu 2FA e o enrolamento ainda falta. */
    require2FASetup: boolean;
}

// ==========================================
// 2FA MODELS
// ==========================================

/**
 * Resposta do login quando a conta tem 2FA ativo.
 *
 * O JWT definitivo NÃO é emitido aqui. O cliente recebe um `challengeToken` de
 * vida curta que só serve para a segunda etapa (`/auth/2fa/verify`).
 *
 * ⚠️ Contrato: apps clientes que não conhecem 2FA vão ler `token` como
 * `undefined`. Por isso a ativação é recusada para usuário de app não
 * preparado — ver `TwoFactorService.assertTenantPronto`.
 */
export interface TwoFactorChallengeResponse {
    requires2FA: true;
    challengeToken: string;
    /** Segundos de validade do `challengeToken`. */
    expiresIn: number;
    /** Métodos aceitos nesta etapa. */
    methods: Array<'totp' | 'backup'>;
}

/**
 * Login de conta com 2FA obrigatório e enrolamento pendente.
 *
 * Acontece quando alguém abandona o convite no meio: a senha já existe, a
 * exigência também, mas não há segundo fator. Em vez de barrar sem saída, o
 * backend devolve uma sessão curta que só serve para concluir o enrolamento.
 */
export interface TwoFactorSetupRequiredResponse {
    require2FASetup: true;
    setupToken: string;
    expiresIn: number;
}

export interface TwoFactorSetupResponse {
    /** Secret em Base32 (RFC 4648, sem padding) para digitação manual. */
    secret: string;
    /** URI `otpauth://` — o cliente renderiza o QR Code a partir dela. */
    otpauthUri: string;
    /** Rótulo mostrado no app autenticador (inclui o app, para multi-tenant). */
    label: string;
    issuer: string;
}

export interface TwoFactorActivationResponse {
    ativo: true;
    /** Códigos de recuperação em texto puro — exibidos UMA única vez. */
    backupCodes: string[];
    /** `true` se as demais sessões do usuário foram invalidadas. */
    sessoesAnterioresInvalidadas: boolean;
}

export interface TwoFactorStatus {
    ativo: boolean;
    /** O convite exigiu 2FA: sem enrolamento a conta não abre sessão. */
    obrigatorio?: boolean;
    confirmadoEm?: string | null;
    /** Quantos códigos de recuperação ainda não foram usados. */
    backupCodesRestantes: number;
}

// ==========================================
// APP MODELS
// ==========================================
export interface App {
    id: string;
    nome: string;
    documento: string;
    email: string;
    telefone?: string;
    logo?: string | null;
    bot_url?: string | null;
    platform_url?: string | null;
    dominio?: string;
    status: 'ativo' | 'inativo' | 'bloqueado' | 'ativa' | 'inativa' | 'bloqueada';
    data_cadastro?: string | Date;
    created_at?: Date;
    updated_at?: Date;
    total_usuarios?: number;
}

export interface CreateAppDTO {
    nome: string;
    documento: string;
    email: string;
    telefone?: string;
    logo?: string;
    bot_url?: string;
    platform_url?: string;
    password?: string;
    admin_nome?: string;
    admin_email?: string;
    admin_telefone?: string;
    emailHtml?: string;
}

export interface UpdateAppDTO {
    nome: string;
    email: string;
    documento: string;
    telefone?: string | undefined;
    logo?: string | null | undefined;
    bot_url?: string | null | undefined;
    platform_url?: string | null | undefined;
}

export interface CreateAppResponse {
    appId: string;
    nome?: string;
    documento?: string;
    email?: string;
    adminEmail?: string;
    message: string;
}

export interface AppSummaryDTO {
    id: string;
    nome: string;
    documento: string;
    email: string;
    status: string;
    total_usuarios?: number;
}

// ==========================================
// UI MODELS
// ==========================================
export interface StatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isBlocking: boolean;
  entityName?: string; 
}

// ==========================================
// ERROR MODELS
// ==========================================
export interface DbError extends Error {
    code?: string;
}

// ==========================================
// API CLIENT MODELS
// ==========================================
export interface ApiErrorResponse {
  error?: string;
  message?: string;
  statusCode?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface AuthResult {
  /** Para onde navegar quando a sessão já está aberta. */
  redirect: string;
  /**
   * `true` quando o login parou na primeira etapa e o segundo fator é exigido.
   * Nesse caso NÃO há token salvo: use `challengeToken` em `twoFactorApi.verify`.
   */
  requires2FA?: boolean;
  challengeToken?: string;
  /** Segundos de validade do `challengeToken`. */
  challengeExpiresIn?: number;
  methods?: Array<'totp' | 'backup'>;
  /** Enrolamento de 2FA pendente e obrigatório: conclua antes de seguir. */
  require2FASetup?: boolean;
}

export interface SuperAdminSession {
  isMaster: boolean;
  timestamp: number;
}

// ==========================================
// DATABASE SCHEMA (Drizzle)
// ==========================================
export const niveisAcesso = pgTable('niveis_acesso', {
    id: serial('id').primaryKey(),
    nome: varchar('nome', { length: 50 }).notNull().unique(),
});

export const aplicativos = pgTable('aplicativos', {
    id: serial('id').primaryKey(),
    nome: varchar('nome', { length: 255 }).notNull(),
    documento: varchar('documento', { length: 20 }),
    email: varchar('email', { length: 255 }),
    telefone: varchar('telefone', { length: 20 }),
    logo: text('logo'),
    botUrl: varchar('bot_url', { length: 500 }),
    platformUrl: varchar('platform_url', { length: 500 }),
    status: varchar('status', { length: 20 }).default('ativo'),
    dataCadastro: timestamp('data_cadastro').defaultNow(),
    dataAtualizacao: timestamp('data_atualizacao'),
});

export const usuarios = pgTable('usuarios', {
    id: serial('id').primaryKey(),
    appId: integer('app_id').references(() => aplicativos.id, { onDelete: 'cascade' }),
    nivelAcessoId: integer('nivel_acesso_id').references(() => niveisAcesso.id),
    nome: varchar('nome', { length: 255 }).notNull(),
    // E-mail é único por aplicativo, não global. O mesmo e-mail pode existir em apps diferentes.
    email: varchar('email', { length: 255 }).notNull(),
    senhaHash: varchar('senha_hash', { length: 255 }).notNull(),
    telefone: varchar('telefone', { length: 20 }),
    status: varchar('status', { length: 20 }).default('ativo'),
    ultimoAcesso: timestamp('ultimo_acesso'),
    dataCadastro: timestamp('data_cadastro').defaultNow(),
    dataAtualizacao: timestamp('data_atualizacao'),
}, (table) => ({
    emailAppIdUnique: unique('usuarios_email_app_id_unique').on(table.email, table.appId),
}));

/**
 * Configuração de 2FA — uma linha por linha de `usuarios`.
 *
 * É por usuário e NÃO por e-mail: o mesmo e-mail pode existir em apps
 * diferentes (unique composto em `usuarios`), e misturar os tenants num secret
 * só quebraria o isolamento. Quem tem conta em vários apps enrola uma vez por
 * app — por isso o `otpauth://` carrega o nome do app no label, senão o
 * autenticador mostra N entradas idênticas.
 *
 * A linha NÃO é apagada ao desativar (só `ativo = false`): `sessoesValidasDesde`
 * precisa sobreviver para que os tokens cortados na ativação continuem inválidos.
 */
export const usuarios2fa = pgTable('usuarios_2fa', {
    usuarioId: integer('usuario_id').primaryKey().references(() => usuarios.id, { onDelete: 'cascade' }),
    // AES-256-GCM, formato "v1:<iv>:<tag>:<ciphertext>" em base64. Nunca em claro.
    // NULL enquanto o enrolamento não começou: um convite que exige 2FA já cria
    // a linha para registrar a exigência, antes de existir qualquer secret.
    secretCifrado: text('secret_cifrado'),
    ativo: boolean('ativo').default(false).notNull(),
    // Convite exigiu 2FA — a conta não abre sessão até o enrolamento concluir.
    obrigatorio: boolean('obrigatorio').default(false).notNull(),
    // Maior step TOTP já aceito. Impede replay do mesmo código dentro da janela.
    ultimoStep: integer('ultimo_step'),
    // Piso de validade das sessões: JWT com `iat` anterior a isto é recusado.
    // É o que faz "ativar 2FA" derrubar de fato as sessões já emitidas.
    sessoesValidasDesde: timestamp('sessoes_validas_desde'),
    confirmadoEm: timestamp('confirmado_em'),
    criadoEm: timestamp('criado_em').defaultNow(),
});

/**
 * Códigos de recuperação. Guardados como HMAC-SHA256 (chave = TWOFA_ENC_KEY),
 * nunca em claro — o usuário vê o código uma única vez, na geração.
 *
 * HMAC e não bcrypt de propósito: são 10 códigos por usuário e a verificação
 * varre todos os não usados. Com bcrypt cost 10 isso seria ~1s de CPU por
 * tentativa. Os códigos têm ~50 bits de entropia, então não são atacáveis por
 * dicionário e o HMAC com pepper é suficiente.
 */
export const usuarios2faBackupCodes = pgTable('usuarios_2fa_backup_codes', {
    id: serial('id').primaryKey(),
    usuarioId: integer('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
    codigoHmac: varchar('codigo_hmac', { length: 64 }).notNull(),
    usadoEm: timestamp('usado_em'),
    criadoEm: timestamp('criado_em').defaultNow(),
}, (table) => ({
    usuarioCodigoUnique: unique('usuarios_2fa_backup_codes_unique').on(table.usuarioId, table.codigoHmac),
}));
