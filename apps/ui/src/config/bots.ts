/**
 * Quem, num app, tem acesso ao bot de Telegram dele (`aplicativos.bot_url`).
 *
 * O hub não guarda isso em coluna: cada bot decide do lado dele quem pode se
 * vincular. Esta lista só repete a regra de cada um para o painel conseguir
 * MOSTRAR — o ícone do Telegram na linha do usuário acende para quem tem
 * acesso e fica apagado para quem não tem.
 *
 * App com bot e sem linha aqui: o bot é de todo usuário ativo (MoneyAPP,
 * TodoAPP, NotesAPP — cada conta vincula o próprio Telegram).
 *
 * Ids = `aplicativos.id`, os mesmos de `config/integrations.ts`.
 */

export interface RegraDoBot {
  /** Papéis do hub que o bot aceita. */
  roles: string[];
  /** Como dizer a regra em poucas palavras, na dica do ícone. */
  resumo: string;
  /** O que fazer para liberar alguém. */
  comoLiberar: string;
}

const REGRAS: Record<string, RegraDoBot> = {
  // Astral Wave Label — @astralwavelabel_bot (10/11/2026): avisos de negócio da
  // label, só para admin. A API da label recusa o vínculo de quem não é admin
  // e remove sozinha, em até 10 min, quem deixar de ser.
  '8': {
    roles: ['admin', 'master'],
    resumo: 'só admin',
    comoLiberar: 'Defina o acesso como Admin em "Editar dados"; a pessoa vincula pelo painel do app (Telegram → Vincular Telegram).',
  },
};

export function getBotRule(appId: string | number | undefined): RegraDoBot | null {
  return (appId !== undefined && REGRAS[String(appId)]) || null;
}

/** `@usuario` do bot a partir do link `t.me/usuario`; o link inteiro se não for do Telegram. */
export function nomeDoBot(botUrl: string | null | undefined): string {
  const m = (botUrl ?? '').match(/t\.me\/([A-Za-z0-9_]+)/);
  return m ? `@${m[1]}` : (botUrl ?? '');
}
