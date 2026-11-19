import { Request, Response } from 'express';
import { cofreService } from '@loginhub/services';
import { escopoDe } from '@loginhub/middlewares';

/**
 * Cofre de senhas (db/013_cofre.sql, 19/11/2026). Só o master por enquanto
 * (rotas no `adminRouter`, atrás do `soMaster`): o dono é sempre 'master'.
 * O corpo é texto cifrado no navegador; aqui só se guarda e devolve.
 */
const donoDe = (req: Request): string | null => (escopoDe(req)?.master ? 'master' : null);

function responder(res: Response, err: unknown, acao: string) {
    const e = err as Error & { code?: string };
    if (e.code === 'VALIDATION') return res.status(400).json({ error: 'Dados Inválidos', message: e.message });
    if (e.code === 'NOT_FOUND') return res.status(404).json({ message: e.message });
    if (e.code === 'DUPLICATE_ENTRY') return res.status(409).json({ message: e.message });
    console.error(`[CofreController] ${acao}:`, e.message);
    return res.status(500).json({ error: 'Erro Interno' });
}

export class CofreController {
    /** GET /admin/cofre — conta (embrulhos + parâmetros do Argon2id), cofres e itens, tudo cifrado. */
    static async estado(req: Request, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(await cofreService.estado(dono));
        } catch (err) {
            return responder(res, err, 'estado');
        }
    }

    /** POST /admin/cofre/conta `{ kdf, chave_por_senha, chave_por_kit }` — cria o cofre (uma vez). */
    static async criarConta(req: Request, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            await cofreService.criarConta(dono, req.body ?? {});
            return res.status(201).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'criarConta');
        }
    }

    /** PUT /admin/cofre/conta `{ kdf, chave_por_senha }` — palavra-passe nova. */
    static async trocarSenha(req: Request, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            await cofreService.trocarSenha(dono, req.body ?? {});
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'trocarSenha');
        }
    }

    /** PUT /admin/cofre/cofres/:id `{ dados }` — cria ou atualiza. */
    static async salvarCofre(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            await cofreService.salvarCofre(dono, req.params.id, req.body?.dados);
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'salvarCofre');
        }
    }

    /** DELETE /admin/cofre/cofres/:id — apaga o cofre e todos os itens dele. */
    static async apagarCofre(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            await cofreService.apagarCofre(dono, req.params.id);
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'apagarCofre');
        }
    }

    /** PUT /admin/cofre/itens/:id `{ cofre_id, dados }` — cria ou atualiza. */
    static async salvarItem(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            await cofreService.salvarItem(dono, req.params.id, req.body?.cofre_id, req.body?.dados);
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'salvarItem');
        }
    }

    /** DELETE /admin/cofre/itens/:id */
    static async apagarItem(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            await cofreService.apagarItem(dono, req.params.id);
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'apagarItem');
        }
    }
}
