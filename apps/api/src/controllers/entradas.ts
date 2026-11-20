import { Request, Response } from 'express';
import { AuthService, passkeyService } from '@loginhub/services';
import { donoDoCofre } from '@loginhub/middlewares';

// ==========================================
// ENTRADA PELO COFRE (db/016, 19/11/2026)
// ==========================================
// A chave de entrada de uma conta de app mora cifrada no cofre do LoginHUB e
// assina um desafio de uso único. Dois lados:
//   /auth/cofre-entrada/*  o app (público para entrar; sessão completa para cadastrar e gerir)
//   /cofre/entradas*       o cofre (dono do cofre: master ou usuário de app liberado)

const authService = new AuthService();

const usuarioDaSessao = (req: Request): string => String((req as any).user?.sub ?? '');

const responder = (res: Response, err: unknown, acao: string) => {
    const msg = (err as Error).message;
    switch (msg) {
        case 'PASSKEY_INDISPONIVEL':
            return res.status(404).json({ error: msg, message: 'A entrada pelo cofre não está disponível para este aplicativo.' });
        case 'CHALLENGE_INVALIDO':
            return res.status(401).json({ error: msg, message: 'O pedido do cofre expirou (vale 5 minutos). Tente de novo pelo aplicativo.' });
        case 'ENTRADA_INVALIDA':
            return res.status(401).json({ error: msg, message: 'O cofre não confirmou a entrada. Entre com e-mail e senha.' });
        case 'PASSKEY_JA_CADASTRADA':
            return res.status(409).json({ error: msg, message: 'Esta entrada já está guardada.' });
        case 'PASSKEY_LIMITE':
            return res.status(409).json({ error: msg, message: 'Limite de entradas pelo cofre atingido. Tire uma para guardar outra.' });
        case 'PASSKEY_NAO_ENCONTRADA':
            return res.status(404).json({ error: msg, message: 'Entrada não encontrada.' });
        case 'USUARIO_INVALIDO':
            return res.status(401).json({ error: msg, message: 'Sessão inválida.' });
        case 'USUARIO_BLOQUEADO':
        case 'APP_BLOQUEADO':
            return res.status(403).json({ error: msg, message: 'Acesso bloqueado. Fale com o suporte.' });
        default:
            console.error(`[EntradaController] ${acao}:`, err);
            return res.status(500).json({ error: 'Erro Interno' });
    }
};

export class EntradaController {
    // ------------------------------------------------------------ lado do app

    /** POST /auth/cofre-entrada/login/opcoes `{ app_id }` → `{ passe, url }` */
    static async opcoesDeLogin(req: Request, res: Response) {
        try {
            return res.status(200).json(await passkeyService.entradaOpcoesDeLogin(req.body?.app_id));
        } catch (err) {
            return responder(res, err, 'opcoesDeLogin');
        }
    }

    /** POST /auth/cofre-entrada/login/verificar `{ app_id, passe, entrada_id, assinatura }` → a mesma sessão do login normal. */
    static async verificarLogin(req: Request, res: Response) {
        try {
            const { app_id, passe, entrada_id, assinatura } = req.body ?? {};
            const usuarioId = await passkeyService.verificarEntrada(app_id, passe, entrada_id, assinatura);
            return res.status(200).json(await authService.emitirSessaoParaUsuario(usuarioId));
        } catch (err) {
            return responder(res, err, 'verificarLogin');
        }
    }

    /** POST /auth/cofre-entrada/registro/opcoes — só com sessão completa (senha + 2FA). */
    static async opcoesDeRegistro(req: Request, res: Response) {
        try {
            return res.status(200).json(await passkeyService.entradaOpcoesDeRegistro(usuarioDaSessao(req)));
        } catch (err) {
            return responder(res, err, 'opcoesDeRegistro');
        }
    }

    /** GET /auth/cofre-entrada */
    static async listar(req: Request, res: Response) {
        try {
            return res.status(200).json(await passkeyService.listarEntradas(usuarioDaSessao(req)));
        } catch (err) {
            return responder(res, err, 'listar');
        }
    }

    /** DELETE /auth/cofre-entrada/:id */
    static async revogar(req: Request<{ id: string }>, res: Response) {
        try {
            await passkeyService.revogarEntrada(req.params.id, { usuarioId: usuarioDaSessao(req) });
            return res.status(200).json({ message: 'Entrada pelo cofre tirada.' });
        } catch (err) {
            return responder(res, err, 'revogar');
        }
    }

    // ---------------------------------------------------------- lado do cofre

    /** POST /cofre/entradas/pedido `{ passe }` — o que o cofre mostra antes de guardar ou assinar. */
    static async pedido(req: Request, res: Response) {
        if (!donoDoCofre(req)?.dono) return res.status(403).json({ error: 'SEM_DONO' });
        try {
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(await passkeyService.descreverEntrada(req.body?.passe));
        } catch (err) {
            return responder(res, err, 'pedido');
        }
    }

    /** POST /cofre/entradas `{ id, passe, nome, chave_publica, assinatura }` — só pelo navegador. */
    static async registrar(req: Request, res: Response) {
        const d = donoDoCofre(req);
        if (!d?.dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (d.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_CADASTRA', message: 'Guarde a entrada pelo navegador.' });
        try {
            return res.status(201).json(await passkeyService.registrarEntrada(d.dono, (req.body ?? {}) as Record<string, unknown>));
        } catch (err) {
            return responder(res, err, 'registrar');
        }
    }

    /** DELETE /cofre/entradas/:id — o item da chave foi apagado do cofre. */
    static async revogarPeloCofre(req: Request<{ id: string }>, res: Response) {
        const d = donoDoCofre(req);
        if (!d?.dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (d.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_REVOGA_OUTRO', message: 'Tire a entrada pelo navegador.' });
        try {
            await passkeyService.revogarEntrada(req.params.id, { dono: d.dono });
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'revogarPeloCofre');
        }
    }
}
