/**
 * Os tipos do cofre que o CLI usa, sem o resto do @loginhub/schema (que traz o
 * drizzle junto). O tsconfig do CLI aponta `@loginhub/schema` para cá. Mudou o
 * formato em packages/schema/src/cofre.ts → mude aqui também.
 */
export interface CofreKdf {
  alg: 'argon2id';
  t: number;
  m: number;
  p: number;
  salt: string;
}

export interface CofreEstado {
  dono: string;
  conta: { kdf: CofreKdf; chave_por_senha: string; chave_por_kit: string } | null;
  aparelho?: { id: string; chave_por_aparelho: string };
  cofres: Array<{ id: string; dados: string; atualizado_em: string | Date }>;
  itens: Array<{ id: string; cofre_id: string; dados: string; atualizado_em: string | Date }>;
}
