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
        if (!this.transporter) {
            console.log(`[EmailService] (Simulated) Sending email to: ${to}`);
            console.log(`[EmailService] Subject: ${subject}`);
            console.log(`[EmailService] HTML Content: \n${htmlContent}`);
            return false;
        }

        try {
            await this.transporter.sendMail({
                from: process.env.SMTP_USER,
                to,
                subject,
                html: htmlContent,
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
