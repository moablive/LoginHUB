import nodemailer from 'nodemailer';

/** De quem o e-mail deve sair. Sem isto, vale o remetente padrão do hub. */
export interface Remetente {
    /** Id do aplicativo em `aplicativos.id`, para achar a config dele no .env. */
    appId?: string | number | null;
    /** Nome exibido antes do endereço ("Sul Alimentos" <contato@...>). */
    appNome?: string | null;
}

interface ConfigApp {
    from?: string;
    user?: string;
    pass?: string;
    host?: string;
    port?: string;
}

/**
 * Config de remetente por aplicativo, lida de `SMTP_APP_<id>_*`.
 *
 * Existe porque o convite de um cliente sair de awlsrvlab@astralwavelabel.com
 * confunde quem recebe: a pessoa foi convidada para a Sul Alimentos e o e-mail
 * chega de um domínio que ela nunca viu.
 */
const PLACEHOLDERS = new Set(['__DEFINIR__', 'senha-da-caixa-aqui', 'changeme', '***']);

/** Ignora vazio e valor de exemplo — placeholder ligaria um SMTP que só falha. */
const limpo = (v: string | undefined): string | undefined => {
    const t = v?.trim();
    return t && !PLACEHOLDERS.has(t) ? t : undefined;
};

const configDoApp = (appId: string): ConfigApp => ({
    from: limpo(process.env[`SMTP_APP_${appId}_FROM`]),
    user: limpo(process.env[`SMTP_APP_${appId}_USER`]),
    pass: limpo(process.env[`SMTP_APP_${appId}_PASS`]),
    host: limpo(process.env[`SMTP_APP_${appId}_HOST`]),
    port: limpo(process.env[`SMTP_APP_${appId}_PORT`]),
});

export class EmailService {
    private transporter: nodemailer.Transporter | null = null;
    /** Transportes dedicados por app, criados sob demanda. */
    private transportesPorApp = new Map<string, nodemailer.Transporter>();

    constructor() {
        const { SMTP_HOST, SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
        const host = SMTP_HOST || SMTP_SERVER;

        if (host && SMTP_PORT && SMTP_USER && SMTP_PASS) {
            this.transporter = nodemailer.createTransport({
                host,
                port: Number(SMTP_PORT),
                secure: Number(SMTP_PORT) === 465,
                auth: {
                    user: SMTP_USER,
                    pass: SMTP_PASS,
                },
            });
        } else {
            console.warn('[EmailService] SMTP credentials not provided in .env. Emails will be logged to console instead of being sent.');
        }
    }

    /**
     * Resolve de onde o e-mail sai.
     *
     * Três casos, do mais correto ao mais frágil:
     *
     * 1. O app tem `_USER` e `_PASS` próprios → transporte dedicado, autenticado
     *    na caixa dele. É o único caminho que passa em SPF/DKIM do domínio do
     *    cliente.
     * 2. O app tem só `_FROM` → reusa o transporte padrão trocando o cabeçalho.
     *    Muitos provedores (Hostinger inclusive) recusam remetente que não é da
     *    conta autenticada, e mesmo aceito o SPF do outro domínio não cobre o
     *    nosso servidor: cai em spam. Serve para teste, não para produção.
     * 3. Nada configurado → remetente padrão do hub.
     */
    private resolverEnvio(remetente?: Remetente): { transporter: nodemailer.Transporter | null; from: string } {
        const padrao = process.env.SMTP_USER || '';
        const appId = remetente?.appId != null ? String(remetente.appId) : '';
        if (!appId) return { transporter: this.transporter, from: padrao };

        const cfg = configDoApp(appId);
        const endereco = cfg.from || cfg.user;
        if (!endereco) return { transporter: this.transporter, from: padrao };

        // Nome exibido: "Sul Alimentos" <contato@sulalimentos.com>
        const from = remetente?.appNome
            ? `"${remetente.appNome.replace(/"/g, '')}" <${endereco}>`
            : endereco;

        if (cfg.user && cfg.pass) {
            let dedicado = this.transportesPorApp.get(appId);
            if (!dedicado) {
                const host = cfg.host || process.env.SMTP_HOST || process.env.SMTP_SERVER;
                const port = Number(cfg.port || process.env.SMTP_PORT || 587);
                if (!host) return { transporter: this.transporter, from };

                dedicado = nodemailer.createTransport({
                    host,
                    port,
                    secure: port === 465,
                    auth: { user: cfg.user, pass: cfg.pass },
                });
                this.transportesPorApp.set(appId, dedicado);
                console.log(`[EmailService] Transporte dedicado do app ${appId}: ${cfg.user}`);
            }
            return { transporter: dedicado, from };
        }

        console.warn(
            `[EmailService] App ${appId} define remetente ${endereco} sem SMTP_APP_${appId}_USER/PASS. ` +
            `Enviando pela conta padrão — o provedor pode recusar, e o SPF de ${endereco.split('@')[1]} ` +
            `não cobre o nosso servidor (risco de spam).`,
        );
        return { transporter: this.transporter, from };
    }

    public async sendEmail(to: string, subject: string, htmlContent: string, remetente?: Remetente): Promise<boolean> {
        let finalHtml = htmlContent;
        const attachments: any[] = [];
        
        const base64Regex = /src="(data:image\/([^;]+);base64,([^"]+))"/g;
        let match;
        let imgIndex = 0;

        while ((match = base64Regex.exec(htmlContent)) !== null) {
            const fullMatch = match[1];
            const extension = match[2];
            const base64Data = match[3];
            const cid = `img_${imgIndex}`;
            
            attachments.push({
                filename: `image_${imgIndex}.${extension}`,
                content: Buffer.from(base64Data, 'base64'),
                cid: cid
            });

            finalHtml = finalHtml.replace(fullMatch, `cid:${cid}`);
            imgIndex++;
        }

        const { transporter, from } = this.resolverEnvio(remetente);

        if (!transporter) {
            console.log(`[EmailService] (Simulated) Sending email to: ${to}`);
            console.log(`[EmailService] Subject: ${subject}`);
            console.log(`[EmailService] HTML Content: \n${finalHtml}`);
            return false;
        }

        try {
            await transporter.sendMail({
                from,
                to,
                subject,
                html: finalHtml,
                attachments,
            });
            console.log(`[EmailService] Email sent successfully to ${to} (from: ${from})`);
            return true;
        } catch (error) {
            console.error(`[EmailService] Error sending email to ${to}:`, error);
            return false;
        }
    }
}

export const emailService = new EmailService();
