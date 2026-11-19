import { Request, Response } from 'express';
import { cofreService } from '@loginhub/services';
import { donoDoCofre, ipDoCliente } from '@loginhub/middlewares';

/**
 * Cofre de senhas (db/013 e db/014, 19/11/2026). Rotas em /cofre atrás do
 * `cofreAuth`, que decide o dono: 'master', 'u:<id>' (usuário de app com cofre
 * liberado) ou o dono do aparelho aprovado do CLI. O corpo é texto cifrado no
 * navegador/CLI; aqui só se guarda e devolve.
 */
const donoDe = (req: Request): string | null => donoDoCofre(req)?.dono ?? null;

function responder(res: Response, err: unknown, acao: string) {
    const e = err as Error & { code?: string };
    if (e.code === 'VALIDATION') return res.status(400).json({ error: 'Dados Inválidos', message: e.message });
    if (e.code === 'NOT_FOUND') return res.status(404).json({ message: e.message });
    if (e.code === 'DUPLICATE_ENTRY') return res.status(409).json({ message: e.message });
    console.error(`[CofreController] ${acao}:`, e.message);
    return res.status(500).json({ error: 'Erro Interno' });
}

export class CofreController {
    /** GET /cofre — conta (embrulhos + parâmetros do Argon2id), cofres e itens, tudo cifrado. */
    static async estado(req: Request, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(await cofreService.estado(dono, donoDoCofre(req)?.aparelhoId));
        } catch (err) {
            return responder(res, err, 'estado');
        }
    }

    /** POST /cofre/conta `{ kdf, chave_por_senha, chave_por_kit }` — cria o cofre (uma vez). */
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

    /** PUT /cofre/conta `{ kdf, chave_por_senha }` — palavra-passe nova. */
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

    /** PUT /cofre/cofres/:id `{ dados }` — cria ou atualiza. */
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

    /** DELETE /cofre/cofres/:id — apaga o cofre e todos os itens dele. */
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

    /** PUT /cofre/itens/:id `{ cofre_id, dados }` — cria ou atualiza. */
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

    /** DELETE /cofre/itens/:id */
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

    // ------------------------------------------------------------ aparelhos do CLI (db/014)

    /** POST /cofre/aparelhos `{ id, nome, chave_por_aparelho }` → `{ token }` (uma vez). Só com login de verdade. */
    static async registrarAparelho(req: Request, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_APROVA', message: 'Um aparelho não aprova outro: entre com a sua conta.' });
        try {
            const r = await cofreService.registrarAparelho(dono, req.body?.id, req.body?.nome, req.body?.chave_por_aparelho, ipDoCliente(req));
            res.setHeader('Cache-Control', 'no-store');
            return res.status(201).json(r);
        } catch (err) {
            return responder(res, err, 'registrarAparelho');
        }
    }

    /** GET /cofre/aparelhos */
    static async listarAparelhos(req: Request, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        try {
            return res.status(200).json(await cofreService.listarAparelhos(dono));
        } catch (err) {
            return responder(res, err, 'listarAparelhos');
        }
    }

    /** DELETE /cofre/aparelhos/:id — revoga (o próprio aparelho pode se revogar: é o `hub-pass logout`). */
    static async revogarAparelho(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        const aparelho = donoDoCofre(req)?.aparelhoId;
        if (aparelho && aparelho !== String(req.params.id).toLowerCase()) {
            return res.status(403).json({ error: 'APARELHO_NAO_REVOGA_OUTRO', message: 'Revogue outras máquinas pelo navegador.' });
        }
        try {
            await cofreService.revogarAparelho(dono, req.params.id);
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'revogarAparelho');
        }
    }
}
