import { NextFunction, Request, Response } from 'express';
import { cofreService, cofreAnexoService, MAX_ANEXO_BYTES, twoFactorService } from '@loginhub/services';
import { donoDaPessoa, donoDoCofre, ipDoCliente } from '@loginhub/middlewares';
import { MASTER_LOGIN_EMAIL } from '@loginhub/schema';

/**
 * Cofre de senhas (db/013 e db/014, 19/11/2026). Rotas em /cofre atrás do
 * `cofreAuth`, que decide o dono: 'master', 'u:<id>' (usuário de app com cofre
 * liberado) ou o dono do aparelho aprovado do CLI. O corpo é texto cifrado no
 * navegador/CLI; aqui só se guarda e devolve.
 */
const donoDe = (req: Request): string | null => donoDoCofre(req)?.dono ?? null;
/** Máquina com alcance por cofre (db/017): os cofres dela; `null` para as outras credenciais. */
const permitidosDe = (req: Request): string[] | null => donoDoCofre(req)?.cofresPermitidos ?? null;

function responder(res: Response, err: unknown, acao: string) {
    const e = err as Error & { code?: string };
    if (e.code === 'VALIDATION') return res.status(400).json({ error: 'Dados Inválidos', message: e.message });
    if (e.code === 'NOT_FOUND') return res.status(404).json({ message: e.message });
    if (e.code === 'FORBIDDEN') return res.status(403).json({ error: 'APARELHO_SEM_ALCANCE', message: e.message });
    if (e.code === 'DUPLICATE_ENTRY') return res.status(409).json({ message: e.message });
    // db/022 (cofre compartilhado): papel insuficiente; chave do cofre/da pessoa girou; conjunto de itens ou membros mudou.
    if (e.code === 'SEM_PERMISSAO') return res.status(403).json({ error: 'SEM_PERMISSAO', message: e.message });
    if (e.code === 'CHAVE_GIRADA') return res.status(409).json({ error: 'CHAVE_GIRADA', message: e.message });
    if (e.code === 'CONFLITO') return res.status(409).json({ error: 'CONFLITO', message: e.message });
    // Erro do driver do Postgres traz os parâmetros na mensagem (inclusive um blob de 10 MiB): só o código vai para o log.
    console.error(`[CofreController] ${acao}:`, (e as { code?: string }).code && /^\d{5}$/.test(String((e as { code?: string }).code)) ? `erro do banco ${e.code}` : e.message);
    return res.status(500).json({ error: 'Erro Interno' });
}

export class CofreController {
    /**
     * GET /cofre/conta-do-app (24/11/2026, db/021) — a conta do app da própria pessoa
     * (logo, CPF, código 2FA) para o "Meu cofre" mostrar sem palavra-passe, em app com
     * `aparelho_confiavel`. Só para a sessão do usuário (nunca master nem máquina do CLI):
     * `{ conta: null }` quando não se aplica.
     */
    static async contaDoApp(req: Request, res: Response) {
        const quem = donoDoCofre(req);
        res.setHeader('Cache-Control', 'no-store');
        if (!quem?.usuarioId || quem.aparelhoId) return res.status(200).json({ conta: null });
        try {
            return res.status(200).json({ conta: await twoFactorService.contaDoApp(String(quem.usuarioId)) });
        } catch (err) {
            return responder(res, err, 'contaDoApp');
        }
    }

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
        // Máquina do CLI não troca a palavra-passe: regravar o embrulho trancaria o dono do lado de fora.
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_TROCA_SENHA', message: 'Troque a palavra-passe pelo navegador.' });
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
            await cofreService.salvarCofre(dono, req.params.id, req.body?.dados, permitidosDe(req));
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
            await cofreService.apagarCofre(dono, req.params.id, permitidosDe(req));
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
            await cofreService.salvarItem(dono, req.params.id, req.body?.cofre_id, req.body?.dados, permitidosDe(req), { aparelho: !!donoDoCofre(req)?.aparelhoId, selo: req.body?.selo, geracao: req.body?.geracao, origemSelo: req.body?.origem_selo, origemGeracao: req.body?.origem_geracao, anexos: req.body?.anexos });
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'salvarItem');
        }
    }

    // ------------------------------------------------------------ anexos cifrados (db/026)

    /**
     * Roda ANTES do `express.raw`: confere o acesso ao cofre e o Content-Length sem ler o corpo (db/026). Quem não pode gravar
     * recebe 404/403 de imediato, e o servidor não engole 10 MiB por tentativa.
     */
    static async preEnviarAnexo(req: Request, res: Response, next: NextFunction) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        const tamanho = Number(req.headers['content-length']);
        if (Number.isFinite(tamanho) && tamanho > MAX_ANEXO_BYTES) return res.status(413).json({ error: 'ARQUIVO_GRANDE', message: 'Arquivo acima de 10 MiB.' });
        try {
            await cofreAnexoService.podeEnviar(dono, req.query.cofre_id, { aparelho: !!donoDoCofre(req)?.aparelhoId, permitidos: permitidosDe(req) });
            return next();
        } catch (err) {
            return responder(res, err, 'preEnviarAnexo');
        }
    }

    /**
     * PUT /cofre/anexos/:id?cofre_id=&item_id=&sha256= — corpo `application/octet-stream`: o arquivo JÁ cifrado no navegador.
     * O servidor confere tamanho, versão e sha256 e guarda sem abrir.
     */
    static async enviarAnexo(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            await cofreAnexoService.enviar(dono, req.params.id, req.query.cofre_id, req.query.item_id, req.query.sha256, req.body, { aparelho: !!donoDoCofre(req)?.aparelhoId, permitidos: permitidosDe(req) });
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'enviarAnexo');
        }
    }

    /** GET /cofre/anexos/:id — os bytes cifrados. Nunca em cache, nunca interpretado pelo navegador. */
    static async baixarAnexo(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            const { blob, sha256 } = await cofreAnexoService.baixar(dono, req.params.id, { aparelho: !!donoDoCofre(req)?.aparelhoId, permitidos: permitidosDe(req) });
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Disposition', 'attachment; filename="anexo.bin"');
            res.setHeader('X-Anexo-Sha256', sha256);
            return res.status(200).type('application/octet-stream').send(blob);
        } catch (err) {
            return responder(res, err, 'baixarAnexo');
        }
    }

    /** DELETE /cofre/anexos/:id — o navegador desfaz um envio cujo item não chegou a ser gravado. */
    static async apagarAnexo(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            await cofreAnexoService.apagar(dono, req.params.id, { aparelho: !!donoDoCofre(req)?.aparelhoId, permitidos: permitidosDe(req) });
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'apagarAnexo');
        }
    }

    /** DELETE /cofre/itens/:id */
    static async apagarItem(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SO_MASTER' });
        try {
            await cofreService.apagarItem(dono, req.params.id, permitidosDe(req), { aparelho: !!donoDoCofre(req)?.aparelhoId });
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

    // ------------------------------------------------------------ aprovação pelo navegador (db/017)

    /**
     * POST /cofre/aparelhos/pedidos `{ id, nome, chave_publica, token_hash }` → `{ codigo, expira_em }`.
     * PÚBLICA (com rate limit): é o `hub-pass login` de uma máquina que ainda não tem credencial.
     * O pedido sozinho não abre nada; vale 10 minutos e espera alguém aprovar com o cofre aberto.
     */
    static async pedirAparelho(req: Request, res: Response) {
        try {
            const r = await cofreService.pedirAparelho((req.body ?? {}) as Record<string, unknown>, ipDoCliente(req));
            res.setHeader('Cache-Control', 'no-store');
            return res.status(201).json(r);
        } catch (err) {
            return responder(res, err, 'pedirAparelho');
        }
    }

    /** GET /cofre/aparelhos/pedidos/:codigo — o pedido que a pessoa digitou. Só com login de verdade. */
    static async pedidoDeAparelho(req: Request<{ codigo: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_APROVA', message: 'Um aparelho não aprova outro: abra o cofre no navegador.' });
        try {
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(await cofreService.pedidoPorCodigo(req.params.codigo));
        } catch (err) {
            return responder(res, err, 'pedidoDeAparelho');
        }
    }

    /** POST /cofre/aparelhos/pedidos/:id/aprovar `{ selo, cofres }` — o pedido vira máquina aprovada do dono. */
    static async aprovarPedido(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_APROVA', message: 'Um aparelho não aprova outro: abra o cofre no navegador.' });
        try {
            await cofreService.aprovarPedido(dono, req.params.id, req.body ?? {});
            return res.status(201).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'aprovarPedido');
        }
    }

    /** PUT /cofre/aparelhos/:id/acesso `{ selo, cofres }` — muda os cofres de uma máquina. Só pelo navegador. */
    static async alterarAcesso(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_APROVA', message: 'Mude o acesso das máquinas pelo navegador.' });
        try {
            await cofreService.alterarAcesso(dono, req.params.id, req.body ?? {});
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'alterarAcesso');
        }
    }

    // ------------------------------------------------------------ cofre compartilhado (db/022)
    //
    // Quem gerencia é a conta com o cofre aberto no navegador. A máquina do CLI (hub-pass) NÃO gerencia nem abre cofre
    // compartilhado: toda rota abaixo recusa credencial de aparelho.

    /** PUT /cofre/pessoa `{ chave_publica, chave_privada }` — guarda o par X25519 da conta (uma vez; 409 se já existe). */
    static async salvarPessoa(req: Request, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_COMPARTILHA', message: 'Compartilhe pelo navegador.' });
        try {
            await cofreService.registrarPessoa(dono, (req.body ?? {}) as Record<string, unknown>);
            return res.status(201).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'salvarPessoa');
        }
    }

    /**
     * GET /cofre/pessoas?email= — a chave pública de outra conta com cofre, para o dono selar o cofre para ela.
     * 404 igual para "não existe" e "não tem cofre" (ninguém enumera contas); com rate limit nas rotas.
     */
    static async buscarPessoa(req: Request, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_COMPARTILHA', message: 'Compartilhe pelo navegador.' });
        const email = String(req.query.email ?? '').trim().toLowerCase();
        res.setHeader('Cache-Control', 'no-store');
        try {
            // E-mail fora do formato responde igual a "não existe": nada a distinguir.
            if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(404).json({ message: 'Não encontramos esta conta com cofre. Confira o e-mail (ela precisa já ter aberto o cofre) e tente de novo.' });
            }
            const alvo = email === MASTER_LOGIN_EMAIL.toLowerCase() ? 'master' : donoDaPessoa(email);
            return res.status(200).json(await cofreService.pessoaPublica(alvo));
        } catch (err) {
            return responder(res, err, 'buscarPessoa');
        }
    }

    /** POST /cofre/cofres/:id/membros `{ membro, chave_publica, chave_selada, papel, prova }` — só o dono do cofre. */
    static async convidar(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_COMPARTILHA', message: 'Compartilhe pelo navegador.' });
        try {
            await cofreService.convidar(dono, req.params.id, req.body ?? {});
            return res.status(201).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'convidar');
        }
    }

    /** PUT /cofre/cofres/:id/membros/:membro `{ papel, chave_selada?, chave_publica?, prova? }` — só o dono do cofre. */
    static async ajustarMembro(req: Request<{ id: string; membro: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_COMPARTILHA', message: 'Compartilhe pelo navegador.' });
        try {
            await cofreService.ajustarMembro(dono, req.params.id, req.params.membro, req.body ?? {});
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'ajustarMembro');
        }
    }

    /** DELETE /cofre/cofres/:id/membros/:membro — só o dono. Corta o acesso sem girar a chave (a tela gira, por girar-chave). */
    static async removerMembro(req: Request<{ id: string; membro: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_COMPARTILHA', message: 'Compartilhe pelo navegador.' });
        try {
            await cofreService.removerMembro(dono, req.params.id, req.params.membro);
            return res.status(200).json({ ok: true, chave_girada: false });
        } catch (err) {
            return responder(res, err, 'removerMembro');
        }
    }

    /** DELETE /cofre/cofres/:id/membros/eu — o membro sai sozinho (perde só o próprio acesso). */
    static async sairDoCofre(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_COMPARTILHA', message: 'Compartilhe pelo navegador.' });
        try {
            await cofreService.sairDoCofre(dono, req.params.id);
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'sairDoCofre');
        }
    }

    /** POST /cofre/cofres/:id/girar-chave `{ dados, itens, membros, remover? }` — só o dono; uma transação. */
    static async girarChave(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_COMPARTILHA', message: 'Compartilhe pelo navegador.' });
        try {
            await cofreService.girarChave(dono, req.params.id, req.body ?? {});
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'girarChave');
        }
    }

    // ------------------------------------------------------------ digitais (passkey com PRF, db/015)

    /**
     * POST /cofre/digitais `{ id, nome, credencial_id, prf_sal, chave_por_digital }`.
     * Só com login de verdade: a máquina do CLI não cadastra digital.
     */
    static async registrarDigital(req: Request, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_CADASTRA', message: 'Cadastre a digital pelo navegador.' });
        try {
            await cofreService.registrarDigital(dono, (req.body ?? {}) as Record<string, unknown>);
            return res.status(201).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'registrarDigital');
        }
    }

    /** GET /cofre/digitais */
    static async listarDigitais(req: Request, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        try {
            return res.status(200).json(await cofreService.listarDigitais(dono));
        } catch (err) {
            return responder(res, err, 'listarDigitais');
        }
    }

    /** DELETE /cofre/digitais/:id */
    static async revogarDigital(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        if (donoDoCofre(req)?.aparelhoId) return res.status(403).json({ error: 'APARELHO_NAO_REVOGA_OUTRO', message: 'Tire a digital pelo navegador.' });
        try {
            await cofreService.revogarDigital(dono, req.params.id);
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'revogarDigital');
        }
    }

    /** POST /cofre/digitais/:id/uso — último uso, para a tela. */
    static async usouDigital(req: Request<{ id: string }>, res: Response) {
        const dono = donoDe(req);
        if (!dono) return res.status(403).json({ error: 'SEM_DONO' });
        try {
            await cofreService.usouDigital(dono, req.params.id);
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'usouDigital');
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
