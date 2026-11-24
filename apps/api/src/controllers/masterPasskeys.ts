import { Request, Response } from 'express';
import { AuthService, masterPasskeyService } from '@loginhub/services';

// ==========================================
// DIGITAL DO MASTER — passkeys do painel (db/020_master_passkeys.sql)
// ==========================================
// login/* e disponivel são públicas (rate limit da passkey): a credencial é a
// assinatura do aparelho. O resto mora no adminRouter, atrás do `soMaster`.

const authService = new AuthService();

const responder = (res: Response, err: unknown, acao: string) => {
    const msg = (err as Error).message;
    switch (msg) {
        case 'PASSKEY_INDISPONIVEL':
            return res.status(404).json({ error: msg, message: 'A digital do master não está cadastrada.' });
        case 'CHALLENGE_INVALIDO':
            return res.status(401).json({ error: msg, message: 'A janela da biometria expirou. Tente de novo.' });
        case 'PASSKEY_INVALIDA':
            return res.status(401).json({ error: msg, message: 'Não foi possível confirmar a digital. Entre com a Master Key.' });
        case 'PASSKEY_JA_CADASTRADA':
            return res.status(409).json({ error: msg, message: 'Este aparelho já está cadastrado.' });
        case 'PASSKEY_LIMITE':
            return res.status(409).json({ error: msg, message: 'Limite de aparelhos com a digital do master atingido. Tire um para cadastrar outro.' });
        case 'PASSKEY_NAO_ENCONTRADA':
            return res.status(404).json({ error: msg, message: 'Aparelho não encontrado.' });
        default:
            console.error(`[MasterPasskeyController] ${acao}:`, err);
            return res.status(500).json({ error: 'Erro Interno' });
    }
};

export class MasterPasskeyController {
    /** GET /auth/master-passkey/disponivel — a tela de login decide se mostra o botão da digital. */
    static async disponivel(_req: Request, res: Response) {
        try {
            return res.status(200).json({ disponivel: await masterPasskeyService.disponivel() });
        } catch (err) {
            return responder(res, err, 'disponivel');
        }
    }

    /** POST /auth/master-passkey/login/opcoes */
    static async opcoesDeLogin(_req: Request, res: Response) {
        try {
            return res.status(200).json(await masterPasskeyService.opcoesDeLogin());
        } catch (err) {
            return responder(res, err, 'opcoesDeLogin');
        }
    }

    /** POST /auth/master-passkey/login/verificar `{ challengeToken, resposta }` → a sessão master. */
    static async verificarLogin(req: Request, res: Response) {
        try {
            await masterPasskeyService.verificarLogin(req.body?.challengeToken, req.body?.resposta);
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(authService.sessaoMaster());
        } catch (err) {
            return responder(res, err, 'verificarLogin');
        }
    }

    /** POST /admin/master-passkeys/registro/opcoes — só o master. */
    static async opcoesDeRegistro(_req: Request, res: Response) {
        try {
            return res.status(200).json(await masterPasskeyService.opcoesDeRegistro());
        } catch (err) {
            return responder(res, err, 'opcoesDeRegistro');
        }
    }

    /** POST /admin/master-passkeys/registro/verificar `{ challengeToken, resposta, nome }` — só o master. */
    static async verificarRegistro(req: Request, res: Response) {
        try {
            return res.status(201).json(await masterPasskeyService.verificarRegistro(req.body?.challengeToken, req.body?.resposta, req.body?.nome));
        } catch (err) {
            return responder(res, err, 'verificarRegistro');
        }
    }

    /** GET /admin/master-passkeys — só o master. */
    static async listar(_req: Request, res: Response) {
        try {
            return res.status(200).json(await masterPasskeyService.listar());
        } catch (err) {
            return responder(res, err, 'listar');
        }
    }

    /** DELETE /admin/master-passkeys/:id — só o master. */
    static async revogar(req: Request<{ id: string }>, res: Response) {
        try {
            await masterPasskeyService.revogar(req.params.id);
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'revogar');
        }
    }
}
