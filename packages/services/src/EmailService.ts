import nodemailer from 'nodemailer';

export class EmailService {
    private transporter: nodemailer.Transporter | null = null;

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

    public async sendEmail(to: string, subject: string, htmlContent: string): Promise<boolean> {
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

        if (!this.transporter) {
            console.log(`[EmailService] (Simulated) Sending email to: ${to}`);
            console.log(`[EmailService] Subject: ${subject}`);
            console.log(`[EmailService] HTML Content: \n${finalHtml}`);
            return false;
        }

        try {
            await this.transporter.sendMail({
                from: process.env.SMTP_USER,
                to,
                subject,
                html: finalHtml,
                attachments,
            });
            console.log(`[EmailService] Email sent successfully to ${to}`);
            return true;
        } catch (error) {
            console.error(`[EmailService] Error sending email to ${to}:`, error);
            return false;
        }
    }
}

export const emailService = new EmailService();
