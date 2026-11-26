import { pgTable, varchar, text, timestamp, uuid, jsonb, integer, primaryKey } from 'drizzle-orm/pg-core';


// ==========================================
// COFRE DE SENHAS (db/013_cofre.sql, 19/11/2026)
// ==========================================
// O servidor só guarda e devolve texto cifrado. Quem cifra e decifra é o
// navegador (apps/ui/src/features/cofre/cripto.ts). Os campos `dados` e
// `chave_por_*` têm o formato "v1.<nonce base64>.<cifra base64>".

export const cofreContas = pgTable('cofre_contas', {
    dono: varchar('dono', { length: 64 }).primaryKey(),
    kdf: jsonb('kdf').notNull(),
    chavePorSenha: text('chave_por_senha').notNull(),
    chavePorKit: text('chave_por_kit').notNull(),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em').notNull().defaultNow(),
});

export const cofreCofres = pgTable('cofre_cofres', {
    id: uuid('id').primaryKey(),
    dono: varchar('dono', { length: 64 }).notNull().references(() => cofreContas.dono, { onDelete: 'cascade' }),
    dados: text('dados').notNull(),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em').notNull().defaultNow(),
});

export const cofreItens = pgTable('cofre_itens', {
    id: uuid('id').primaryKey(),
    cofreId: uuid('cofre_id').notNull().references(() => cofreCofres.id, { onDelete: 'cascade' }),
    dados: text('dados').notNull(),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em').notNull().defaultNow(),
});

/**
 * A coluna `geracao` de `cofre_cofres` (db/023) numa definição À PARTE de propósito: `cofreCofres` entra em todo INSERT
 * (o drizzle lista as colunas com default) e quebraria o cofre inteiro até a migração rodar. Só o serviço de
 * compartilhamento lê e grava a geração, e só depois de conferir que a coluna existe.
 */
export const cofreGeracao = pgTable('cofre_cofres', {
    id: uuid('id').primaryKey(),
    dono: varchar('dono', { length: 64 }).notNull(),
    geracao: integer('geracao').notNull().default(0),
});

/**
 * Par X25519 de uma conta (db/022): a pública em claro, a privada cifrada com a chave da conta. É para a pública
 * que o dono de um cofre sela a chave do cofre ao compartilhar.
 */
export const cofreChavesPessoa = pgTable('cofre_chaves_pessoa', {
    dono: varchar('dono', { length: 64 }).primaryKey().references(() => cofreContas.dono, { onDelete: 'cascade' }),
    chavePublica: varchar('chave_publica', { length: 64 }).notNull(),
    chavePrivada: text('chave_privada').notNull(),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
});

/** Quem mais abre um cofre (db/022). `chaveSelada` = chave do cofre cifrada para a chave pública do membro. */
export const cofreMembros = pgTable(
    'cofre_membros',
    {
        cofreId: uuid('cofre_id').notNull().references(() => cofreCofres.id, { onDelete: 'cascade' }),
        membro: varchar('membro', { length: 64 }).notNull().references(() => cofreContas.dono, { onDelete: 'cascade' }),
        chaveSelada: text('chave_selada').notNull(),
        papel: varchar('papel', { length: 10 }).$type<'leitura' | 'escrita'>().notNull(),
        chavePublica: varchar('chave_publica', { length: 64 }).notNull(),
        prova: varchar('prova', { length: 64 }),
        convidadoPor: varchar('convidado_por', { length: 64 }).notNull(),
        criadoEm: timestamp('criado_em').notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.cofreId, t.membro] })],
);

/**
 * Máquina aprovada para o CLI `hub-pass` (db/014). `chavePorAparelho` é a chave
 * da conta embrulhada pela chave que só a máquina tem; revogar zera o embrulho.
 */
export const cofreAparelhos = pgTable('cofre_aparelhos', {
    id: uuid('id').primaryKey(),
    dono: varchar('dono', { length: 64 }).notNull().references(() => cofreContas.dono, { onDelete: 'cascade' }),
    nome: varchar('nome', { length: 120 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    chavePorAparelho: text('chave_por_aparelho'),
    // db/017: máquina aprovada pelo navegador. `selo` = o que ela abre, cifrado para a `chavePublica`
    // dela; `cofres` = ids dos cofres liberados (null = a conta inteira).
    chavePublica: varchar('chave_publica', { length: 64 }),
    selo: text('selo'),
    cofres: jsonb('cofres').$type<string[] | null>(),
    // HMAC (chave da conta) do id + chave pública: a tela confere antes de cifrar de novo para a máquina.
    prova: varchar('prova', { length: 64 }),
    ip: varchar('ip', { length: 64 }),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    ultimoUso: timestamp('ultimo_uso'),
    revogadoEm: timestamp('revogado_em'),
});

/**
 * Pedido de aprovação de uma máquina do CLI (db/017): nasce no `hub-pass login`,
 * sem dono, e vale 10 minutos. Quem digita o `codigo` com o cofre aberto aprova.
 */
export const cofreAparelhoPedidos = pgTable('cofre_aparelho_pedidos', {
    id: uuid('id').primaryKey(),
    nome: varchar('nome', { length: 120 }).notNull(),
    chavePublica: varchar('chave_publica', { length: 64 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    codigo: varchar('codigo', { length: 12 }).notNull().unique(),
    ip: varchar('ip', { length: 64 }),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    expiraEm: timestamp('expira_em').notNull(),
});

/**
 * Digital que abre o cofre (db/015): passkey com PRF. `chavePorDigital` é a chave
 * da conta embrulhada pela chave derivada do PRF, que só o aparelho produz.
 */
export const cofreDigitais = pgTable('cofre_digitais', {
    id: uuid('id').primaryKey(),
    dono: varchar('dono', { length: 64 }).notNull().references(() => cofreContas.dono, { onDelete: 'cascade' }),
    nome: varchar('nome', { length: 120 }).notNull(),
    credencialId: varchar('credencial_id', { length: 1400 }).notNull(),
    prfSal: varchar('prf_sal', { length: 64 }).notNull(),
    chavePorDigital: text('chave_por_digital'),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    ultimoUso: timestamp('ultimo_uso'),
    revogadoEm: timestamp('revogado_em'),
});

/**
 * Entrada pelo cofre (db/016): chave pública Ed25519 de uma conta de app. A
 * privada mora cifrada num item do cofre do `dono`; o hub só confere assinaturas.
 */
export const cofreEntradas = pgTable('cofre_entradas', {
    id: uuid('id').primaryKey(),
    dono: varchar('dono', { length: 64 }).notNull().references(() => cofreContas.dono, { onDelete: 'cascade' }),
    // FK para usuarios(id) fica só no SQL (db/016): importar `usuarios` daqui faria um ciclo com o index.
    usuarioId: integer('usuario_id').notNull(),
    chavePublica: varchar('chave_publica', { length: 64 }).notNull(),
    nome: varchar('nome', { length: 120 }).notNull(),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    ultimoUso: timestamp('ultimo_uso'),
    revogadaEm: timestamp('revogada_em'),
});

/** O que o cofre mostra antes de guardar ou de assinar uma entrada (POST /cofre/entradas/pedido). */
export interface CofreEntradaPedido {
    acao: 'cadastro' | 'entrar';
    app: { id: number; nome: string; origem: string };
    /** Só no cadastro: a conta do app que a chave vai abrir. */
    conta?: { id: number; nome: string | null; email: string };
}

/** POST /cofre/entradas */
export interface CofreEntradaNova {
    id: string;
    passe: string;
    nome: string;
    chave_publica: string;
    /** Assinatura Ed25519 (base64url) da mensagem de cadastro: prova que a privada existe. */
    assinatura: string;
}

/** Entrada na lista do app (sem a chave). */
export interface CofreEntrada {
    id: string;
    nome: string;
    criado_em: string | Date;
    ultimo_uso: string | Date | null;
}

/** Digital ativa, como vem no GET /cofre: o navegador precisa disto para abrir. */
export interface CofreDigitalEmbrulho {
    id: string;
    credencial_id: string;
    prf_sal: string;
    chave_por_digital: string;
}

/** Digital na lista da tela (sem embrulho). */
export interface CofreDigital {
    id: string;
    nome: string;
    criado_em: string | Date;
    ultimo_uso: string | Date | null;
}

/** POST /cofre/digitais */
export interface CofreDigitalNova {
    id: string;
    nome: string;
    credencial_id: string;
    prf_sal: string;
    chave_por_digital: string;
}

export interface CofreAparelho {
    id: string;
    nome: string;
    ip: string | null;
    criado_em: string | Date;
    ultimo_uso: string | Date | null;
    revogado: boolean;
    /** Ids dos cofres liberados para a máquina; `null` = a conta inteira. */
    cofres: string[] | null;
    /** Chave pública X25519 (base64) da máquina aprovada pelo navegador; `null` na aprovação antiga. */
    chave_publica: string | null;
    /** HMAC da chave pública, feito na aprovação com a chave da conta (a tela confere antes de mudar o alcance). */
    prova: string | null;
}

/** Pedido de aprovação de uma máquina, como o navegador o recebe pelo código (db/017). */
export interface CofreAparelhoPedido {
    id: string;
    nome: string;
    chave_publica: string;
    ip: string | null;
    criado_em: string | Date;
}

/** POST /cofre/aparelhos/pedidos (público): o que o `hub-pass login` manda. */
export interface CofreAparelhoPedidoNovo {
    id: string;
    nome: string;
    chave_publica: string;
    /** sha256 (hex) do token que a máquina sorteou e guarda. */
    token_hash: string;
}

/** Aprovar um pedido ou mudar o alcance de uma máquina: o selo novo e os cofres que ele abre. */
export interface CofreAparelhoAcesso {
    selo: string;
    /** `null` = a conta inteira (o selo leva a chave da conta). */
    cofres: string[] | null;
    /** Só na aprovação: HMAC-SHA256 (base64) do dono, id e chave pública da máquina, com a chave da conta. */
    prova?: string;
}

/** Parâmetros do Argon2id da palavra-passe. Públicos: sem a palavra-passe não servem. */
export interface CofreKdf {
    alg: 'argon2id';
    /** Passadas. */
    t: number;
    /** Memória em KiB. */
    m: number;
    /** Paralelismo. */
    p: number;
    /** Sal em base64. */
    salt: string;
}

export interface CofreConta {
    kdf: CofreKdf;
    chave_por_senha: string;
    chave_por_kit: string;
}

export interface CofreRegistro {
    id: string;
    dados: string;
    /** db/023: sobe a cada girar-chave. Ausente enquanto a migração não rodou. */
    geracao?: number;
    atualizado_em: string | Date;
}

export interface CofreItemRegistro extends CofreRegistro {
    cofre_id: string;
}

export type CofrePapel = 'leitura' | 'escrita';

/** O par X25519 da conta, como o servidor guarda (db/022). */
export interface CofrePessoa {
    chave_publica: string;
    chave_privada: string;
}

/** Quem mais abre um cofre DESTE dono (só o dono recebe a lista). */
export interface CofreMembro {
    cofre_id: string;
    membro: string;
    /** E-mail para mostrar (null se não foi possível resolver). */
    nome: string | null;
    papel: CofrePapel;
    chave_publica: string;
    prova: string | null;
    criado_em: string | Date;
}

/** Cofre de outra conta que abre para esta (db/022): a chave dele vem selada para a chave pública desta conta. */
export interface CofreCompartilhado extends CofreRegistro {
    /** Dono do cofre ('master' ou 'p:…'): entra nos dados associados do selo. */
    dono: string;
    dono_nome: string | null;
    /** Chave pública X25519 do dono, como o servidor a tem: o membro a confere com o selo e fixa o código dela (TOFU). */
    dono_chave_publica: string | null;
    papel: CofrePapel;
    chave_selada: string;
    itens: CofreItemRegistro[];
}

/** Resposta de GET /cofre/pessoas?email= : a chave pública a que o dono vai selar. */
export interface CofrePessoaPublica {
    dono: string;
    chave_publica: string;
}

/** POST /cofre/cofres/:id/membros */
export interface CofreMembroNovo {
    membro: string;
    chave_publica: string;
    chave_selada: string;
    papel: CofrePapel;
    prova: string;
}

/** PUT /cofre/cofres/:id/membros/:membro — muda o papel e, se vier `chave_selada`, refaz o selo. */
export interface CofreMembroAjuste {
    papel: CofrePapel;
    chave_selada?: string;
    chave_publica?: string;
    prova?: string;
}

/** POST /cofre/cofres/:id/girar-chave */
export interface CofreGiro {
    /** Registro do cofre cifrado de novo (nome + chave nova) com a chave da conta do dono. */
    dados: string;
    /** TODOS os itens do cofre, recifrados com a chave nova; `atualizado_em` é o que o navegador viu. */
    itens: { id: string; dados: string; atualizado_em: string | Date }[];
    /** Membro a tirar (opcional). Os `membros` abaixo são os que FICAM. */
    remover?: string | null;
    membros: { membro: string; chave_publica: string; chave_selada: string; prova: string }[];
}

/** Tudo o que o dono tem, cifrado. Pequeno o bastante para vir de uma vez. */
export interface CofreEstado {
    /** 'master' ou 'u:<id>': entra nos dados associados da cifra. */
    dono: string;
    conta: CofreConta | null;
    /**
     * Só quando quem pede é um aparelho aprovado. Aprovação antiga: `chave_por_aparelho` (a chave da
     * conta embrulhada pela chave simétrica dele). Aprovação pelo navegador (db/017): `selo`, cifrado
     * para a chave pública dele, e `cofres` (null = a conta inteira).
     */
    aparelho?: { id: string; chave_por_aparelho?: string; selo?: string; cofres?: string[] | null };
    /** Digitais ativas (db/015): abrem o cofre com Touch ID/Face ID neste ou noutro aparelho. */
    digitais?: CofreDigitalEmbrulho[];
    cofres: CofreRegistro[];
    itens: CofreItemRegistro[];
    /** db/022: o par X25519 da conta (null = ainda não gerado) — ausente para máquina do CLI. */
    pessoa?: CofrePessoa | null;
    /** db/022: quem mais abre os cofres DESTA conta. */
    membros?: CofreMembro[];
    /** db/022: cofres de outras contas compartilhados com esta. */
    compartilhados?: CofreCompartilhado[];
}
