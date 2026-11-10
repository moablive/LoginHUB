import { Request, Response } from 'express';
import { assinaturaService } from '@loginhub/services';
import { CadastroAfiliadoDTO, DbError, IniciarAssinaturaDTO, SalvarAfiliadoDTO, SalvarPlanoDTO } from '@loginhub/schema';

// ==========================================
// VENDA DE APP POR ASSINATURA (db/009_assinaturas_afiliados.sql)
// ==========================================

const responder = (res: Response, err: unknown, acao: string) => {
    const error = err as DbError;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ message: error.message });
    if (error.code === 'VALIDATION') return res.status(400).json({ message: error.message });
    if (error.code === 'DUPLICATE_ENTRY') return res.status(409).json({ error: 'Conflito de Dados', message: error.message });
    if (error.code === 'MP_ERRO' || error.code === 'MP_INDISPONIVEL') return res.status(502).json({ message: error.message });
    console.error(`[AssinaturaController] ${acao}:`, error);
    return res.status(500).json({ message: 'Erro Interno' });
};

/** Rotas públicas: a página de venda do app e o aviso do Mercado Pago. */
export class VendaPublicaController {
    static async plano(req: Request<{ appId: string }>, res: Response) {
        try {
            const ref = typeof req.query.ref === 'string' ? req.query.ref : null;
            return res.status(200).json(await assinaturaService.planoPublico(req.params.appId, ref));
        } catch (err) {
            return responder(res, err, 'plano');
        }
    }

    static async assinar(req: Request<{ appId: string }, {}, IniciarAssinaturaDTO>, res: Response) {
        try {
            return res.status(201).json(await assinaturaService.iniciar(req.params.appId, req.body ?? ({} as IniciarAssinaturaDTO)));
        } catch (err) {
            return responder(res, err, 'assinar');
        }
    }

    /** Botão "link de afiliado" da página de venda: cadastra e devolve o link. */
    static async cadastrarAfiliado(req: Request<{ appId: string }, {}, CadastroAfiliadoDTO>, res: Response) {
        try {
            const r = await assinaturaService.cadastrarAfiliado(req.params.appId, req.body ?? ({} as CadastroAfiliadoDTO));
            return res.status(r.ja_existia ? 200 : 201).json(r);
        } catch (err) {
            return responder(res, err, 'cadastrarAfiliado');
        }
    }

    static async confirmar(req: Request<{ ref: string }>, res: Response) {
        try {
            return res.status(200).json(await assinaturaService.confirmar(req.params.ref));
        } catch (err) {
            return responder(res, err, 'confirmar');
        }
    }

    /**
     * Aviso do Mercado Pago. Responde 200 sempre: o corpo não é confiado (o
     * estado vem de consultar a API de lá pelo id), e devolver erro só faria o
     * Mercado Pago repetir um aviso que a conferência periódica já cobre.
     */
    static async webhookMp(req: Request, res: Response) {
        const corpo = (req.body ?? {}) as { type?: string; topic?: string; data?: { id?: string | number } };
        const tipo = String(corpo.type ?? req.query.type ?? corpo.topic ?? req.query.topic ?? '');
        const id = String(corpo.data?.id ?? req.query['data.id'] ?? req.query.id ?? '');
        try {
            await assinaturaService.webhook(tipo, id);
        } catch (err) {
            console.error('[AssinaturaController] webhookMp:', (err as Error).message);
        }
        return res.status(200).json({ ok: true });
    }
}

/** Rotas do painel (master): preço, afiliados, assinantes e comissões. */
export class VendaAdminController {
    static async painel(req: Request<{ id: string }>, res: Response) {
        try {
            const appId = req.params.id;
            const [plano, resumo, afiliados, assinaturas] = await Promise.all([
                assinaturaService.plano(appId),
                assinaturaService.resumo(appId),
                assinaturaService.listarAfiliados(appId),
                assinaturaService.listarAssinaturas(appId),
            ]);
            return res.status(200).json({ plano, resumo, afiliados, assinaturas });
        } catch (err) {
            return responder(res, err, 'painel');
        }
    }

    static async salvarPlano(req: Request<{ id: string }, {}, SalvarPlanoDTO>, res: Response) {
        try {
            return res.status(200).json(await assinaturaService.salvarPlano(req.params.id, req.body ?? ({} as SalvarPlanoDTO)));
        } catch (err) {
            return responder(res, err, 'salvarPlano');
        }
    }

    static async criarAfiliado(req: Request<{ id: string }, {}, SalvarAfiliadoDTO>, res: Response) {
        try {
            await assinaturaService.criarAfiliado(req.params.id, req.body ?? ({} as SalvarAfiliadoDTO));
            return res.status(201).json({ message: 'Afiliado criado.' });
        } catch (err) {
            return responder(res, err, 'criarAfiliado');
        }
    }

    static async atualizarAfiliado(req: Request<{ id: string }, {}, SalvarAfiliadoDTO>, res: Response) {
        try {
            await assinaturaService.atualizarAfiliado(req.params.id, req.body ?? ({} as SalvarAfiliadoDTO));
            return res.status(200).json({ message: 'Afiliado atualizado.' });
        } catch (err) {
            return responder(res, err, 'atualizarAfiliado');
        }
    }

    static async apagarAfiliado(req: Request<{ id: string }>, res: Response) {
        try {
            await assinaturaService.apagarAfiliado(req.params.id);
            return res.status(200).json({ message: 'Afiliado removido.' });
        } catch (err) {
            return responder(res, err, 'apagarAfiliado');
        }
    }

    static async pagarComissoes(req: Request<{ id: string }>, res: Response) {
        try {
            return res.status(200).json(await assinaturaService.pagarComissoes(req.params.id));
        } catch (err) {
            return responder(res, err, 'pagarComissoes');
        }
    }

    static async cancelar(req: Request<{ id: string }>, res: Response) {
        try {
            await assinaturaService.cancelar(req.params.id);
            return res.status(200).json({ message: 'Assinatura cancelada.' });
        } catch (err) {
            return responder(res, err, 'cancelar');
        }
    }

    static async reenviarAcesso(req: Request<{ id: string }>, res: Response) {
        try {
            return res.status(200).json(await assinaturaService.reenviarAcesso(req.params.id));
        } catch (err) {
            return responder(res, err, 'reenviarAcesso');
        }
    }

    static async conferir(_req: Request, res: Response) {
        try {
            await assinaturaService.conferirTodas();
            return res.status(200).json({ ok: true });
        } catch (err) {
            return responder(res, err, 'conferir');
        }
    }
}
