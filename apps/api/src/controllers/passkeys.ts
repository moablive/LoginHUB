import { Request, Response } from 'express';
import { AuthService, passkeyService } from '@loginhub/services';

// ==========================================
// LOGIN POR BIOMETRIA — passkeys / WebAuthn (db/010_passkeys.sql)
// ==========================================

const authService = new AuthService();

const usuarioDaSessao = (req: Request): string => String((req as any).user?.sub ?? '');

const responder = (res: Response, err: unknown, acao: string) => {
    const msg = (err as Error).message;
    switch (msg) {
        case 'PASSKEY_INDISPONIVEL':
            return res.status(404).json({ error: msg, message: 'O login por biometria não está disponível para esta conta.' });
        case 'CHALLENGE_INVALIDO':
            return res.status(401).json({ error: msg, message: 'A janela da biometria expirou. Tente de novo.' });
        case 'PASSKEY_INVALIDA':
            return res.status(401).json({ error: msg, message: 'Não foi possível confirmar a biometria. Entre com e-mail e senha.' });
        case 'PASSKEY_JA_CADASTRADA':
            return res.status(409).json({ error: msg, message: 'Este aparelho já está cadastrado.' });
        case 'PASSKEY_LIMITE':
            return res.status(409).json({ error: msg, message: 'Limite de aparelhos com biometria atingido. Remova um para cadastrar outro.' });
        case 'PASSKEY_NAO_ENCONTRADA':
            return res.status(404).json({ error: msg, message: 'Aparelho não encontrado.' });
        case 'USUARIO_INVALIDO':
            return res.status(401).json({ error: msg, message: 'Sessão inválida.' });
        case 'USUARIO_BLOQUEADO':
        case 'APP_BLOQUEADO':
        case 'APP_NAO_AUTENTICA_NO_HUB':
            return res.status(403).json({ error: msg, message: 'Acesso bloqueado. Fale com o suporte.' });
        default:
            console.error(`[PasskeyController] ${acao}:`, err);
            return res.status(500).json({ error: 'Erro Interno' });
    }
};

export class PasskeyController {
    /** GET /auth/passkey/disponivel?app_id= — a tela de login decide se mostra o botão. */
    static async disponivel(req: Request, res: Response) {
        return res.status(200).json({ disponivel: await passkeyService.disponivel(req.query.app_id) });
    }

    /** POST /auth/passkey/login/opcoes — público; não diz se alguma conta existe. */
    static async opcoesDeLogin(req: Request, res: Response) {
        try {
            return res.status(200).json(await passkeyService.opcoesDeLogin(req.body?.app_id));
        } catch (err) {
            return responder(res, err, 'opcoesDeLogin');
        }
    }

    /** POST /auth/passkey/login/verificar — devolve a mesma sessão do login normal. */
    static async verificarLogin(req: Request, res: Response) {
        try {
            const { app_id, challengeToken, resposta } = req.body ?? {};
            const usuarioId = await passkeyService.verificarLogin(app_id, challengeToken, resposta);
            return res.status(200).json(await authService.emitirSessaoParaUsuario(usuarioId));
        } catch (err) {
            return responder(res, err, 'verificarLogin');
        }
    }

    /** POST /auth/passkey/registro/opcoes — só com sessão completa (senha + 2FA). */
    static async opcoesDeRegistro(req: Request, res: Response) {
        try {
            return res.status(200).json(await passkeyService.opcoesDeRegistro(usuarioDaSessao(req)));
        } catch (err) {
            return responder(res, err, 'opcoesDeRegistro');
        }
    }

    /** POST /auth/passkey/registro/verificar */
    static async verificarRegistro(req: Request, res: Response) {
        try {
            const { challengeToken, resposta, nome } = req.body ?? {};
            return res.status(201).json(await passkeyService.verificarRegistro(usuarioDaSessao(req), challengeToken, resposta, nome));
        } catch (err) {
            return responder(res, err, 'verificarRegistro');
        }
    }

    /** GET /auth/passkey — os aparelhos com biometria da própria conta. */
    static async listar(req: Request, res: Response) {
        try {
            return res.status(200).json(await passkeyService.listar(usuarioDaSessao(req)));
        } catch (err) {
            return responder(res, err, 'listar');
        }
    }

    /** DELETE /auth/passkey/:id — remove a biometria de um aparelho da própria conta. */
    static async revogar(req: Request<{ id: string }>, res: Response) {
        try {
            await passkeyService.revogar(usuarioDaSessao(req), req.params.id);
            return res.status(200).json({ message: 'Biometria removida deste aparelho.' });
        } catch (err) {
            return responder(res, err, 'revogar');
        }
    }
}
