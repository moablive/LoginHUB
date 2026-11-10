/**
 * E-mail de quem se cadastrou como afiliado pela página de venda
 * (db/011_afiliados_cadastro.sql): o link dela e quanto ganha por indicação.
 * Mesmo esqueleto do `assinaturaEmail.ts`.
 */
import { dinheiroBr } from './assinaturaEmail';

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

export interface AfiliadoEmailInput {
    appName: string;
    appLogo?: string | null;
    nome: string;
    /** Link de divulgação (`.../assine?ref=<código>`). */
    link: string;
    comissaoPct: number;
    /** Mensalidade de hoje, para o exemplo de ganho. */
    valor: number;
}

export const buildAfiliadoEmail = (input: AfiliadoEmailInput): string => {
    const app = escapeHtml(input.appName);
    const link = escapeHtml(input.link);
    const pct = input.comissaoPct.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const ganho = dinheiroBr(Math.round(input.valor * input.comissaoPct) / 100);
    const logo = input.appLogo
        ? `<img src="${escapeHtml(input.appLogo)}" alt="${app}" height="80" style="height:80px;width:auto;display:block;margin:0 auto 12px;border:0;" />`
        : '';

    return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f3f4ee;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#c6f135;height:6px;line-height:6px;font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="background:#ffffff;padding:28px 24px 8px;text-align:center;">
                ${logo}
                <h1 style="margin:0;color:#0f172a;font-size:22px;">Seu link de afiliado do ${app}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px;color:#334155;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;">Olá, <strong>${escapeHtml(input.nome)}</strong>!</p>
                <p style="margin:0 0 20px;">
                  Seu cadastro de afiliado está ativo. Divulgue o link abaixo: quem assinar o
                  <strong>${app}</strong> por ele conta como indicação sua.
                </p>
                <p style="margin:0 0 20px;padding:14px 16px;background:#f8fafc;border-radius:8px;text-align:center;word-break:break-all;">
                  <a href="${link}" style="color:#2563eb;font-weight:bold;">${link}</a>
                </p>
                <p style="margin:0 0 16px;padding:12px 16px;background:#eff6ff;border-left:3px solid #2563eb;color:#1e3a5f;font-size:13px;line-height:1.5;">
                  <strong>Quanto você ganha:</strong> ${pct}% de cada mensalidade paga pelos seus indicados, todo mês,
                  enquanto a assinatura estiver ativa. Com a mensalidade de hoje (${dinheiroBr(input.valor)}), são
                  ${ganho} por assinante por mês.
                </p>
                <p style="margin:0;color:#64748b;font-size:13px;">
                  O repasse é feito por Pix. Para combinar a chave e tirar dúvidas, responda este e-mail.
                  Se você não fez este cadastro, responda avisando.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
};
