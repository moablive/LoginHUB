/**
 * Escape idêntico ao do React (`escapeTextForBrowser`), que era quem montava
 * estes e-mails com `renderToStaticMarkup` até a UI virar Vue (11/2026).
 *
 * Vale para texto e para valor de atributo — inclusive o `style`, por isso as
 * aspas de `"Inter"` saem como `&quot;`. Mantido igual de propósito: o backend
 * troca `__MAGIC_LINK__` no HTML, e o HTML que chega na caixa da pessoa não
 * pode mudar só porque o painel trocou de framework.
 */
export function esc(valor: unknown): string {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
