import crypto from 'crypto';
import { db } from '@loginhub/database';
import { cofreAnexos, cofreCofres, cofreMembros } from '@loginhub/schema';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';

/**
 * Anexos cifrados do cofre (db/026, 27/11/2026). Mesmo princípio do CofreService: um ARMÁRIO. O navegador cifra o arquivo
 * com uma chave só dele (a chave mora no JSON cifrado do item) e aqui só se guardam e devolvem bytes. O que este serviço
 * confere é a forma (tamanho, versão do envelope, sha256), o acesso ao cofre e as cotas.
 *
 * Acesso: ler = dono ou qualquer membro; gravar/apagar = dono ou membro `escrita`. A máquina do CLI só alcança cofre do
 * próprio dono e, se tiver alcance por cofre, só os liberados. O selo e a geração da chave do cofre NÃO entram aqui de
 * propósito: o blob não é cifrado com a chave do cofre, então um giro de chave no meio não o estraga.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_SHA256 = /^[0-9a-f]{64}$/;
/** Arquivo de 10 MiB + versão (1) + nonce (24) + etiqueta (16). */
export const MAX_ANEXO_BYTES = 10 * 1024 * 1024 + 64;
const MIN_ANEXO_BYTES = 41;
const MAX_ANEXOS_POR_ITEM = 10;
const COTA_POR_DONO = 500 * 1024 * 1024;
const LIXO_APOS_MS = 24 * 60 * 60 * 1000;
const VERSAO_BLOB = 1;

const erro = (mensagem: string, code: string) => Object.assign(new Error(mensagem), { code });

function uuid(valor: unknown, campo: string): string {
    if (typeof valor !== 'string' || !UUID.test(valor)) throw erro(`${campo} inválido.`, 'VALIDATION');
    return valor.toLowerCase();
}

type Papel = 'dono' | 'leitura' | 'escrita';
interface Alvo {
    papel: Papel;
    dono: string;
}
export interface OpcoesDeAnexo {
    /** Máquina do CLI: só alcança cofre do próprio dono. */
    aparelho?: boolean;
    /** Máquina com alcance por cofre (db/017): os cofres liberados. */
    permitidos?: string[] | null;
}

export class CofreAnexoService {
    private async alvo(quem: string, cofreId: string, op: OpcoesDeAnexo): Promise<Alvo> {
        if (op.permitidos && !op.permitidos.includes(cofreId)) throw erro('Cofre não encontrado.', 'NOT_FOUND');
        const c = await db.select({ dono: cofreCofres.dono }).from(cofreCofres).where(eq(cofreCofres.id, cofreId)).limit(1);
        if (!c[0]) throw erro('Cofre não encontrado.', 'NOT_FOUND');
        if (c[0].dono === quem) return { papel: 'dono', dono: quem };
        if (!op.aparelho) {
            const m = await db
                .select({ papel: cofreMembros.papel })
                .from(cofreMembros)
                .where(and(eq(cofreMembros.cofreId, cofreId), eq(cofreMembros.membro, quem)))
                .limit(1);
            if (m[0]) return { papel: m[0].papel, dono: c[0].dono };
        }
        throw erro('Cofre não encontrado.', 'NOT_FOUND');
    }

    /** Guarda um blob cifrado. Repetir o mesmo envio (mesmo id, mesmo sha256) é aceito: o navegador pode ter perdido a resposta. */
    public async enviar(quem: string, idBruto: unknown, cofreIdBruto: unknown, itemIdBruto: unknown, shaBruto: unknown, corpo: unknown, op: OpcoesDeAnexo = {}): Promise<void> {
        const id = uuid(idBruto, 'id');
        const cofreId = uuid(cofreIdBruto, 'cofre_id');
        const itemId = uuid(itemIdBruto, 'item_id');
        if (!Buffer.isBuffer(corpo) || corpo.length < MIN_ANEXO_BYTES || corpo.length > MAX_ANEXO_BYTES) {
            throw erro('Arquivo cifrado com tamanho inválido (máximo 10 MiB por arquivo).', 'VALIDATION');
        }
        if (corpo[0] !== VERSAO_BLOB) throw erro('Formato de anexo desconhecido.', 'VALIDATION');
        const sha = crypto.createHash('sha256').update(corpo).digest('hex');
        if (typeof shaBruto === 'string' && (!HASH_SHA256.test(shaBruto) || shaBruto.toLowerCase() !== sha)) {
            throw erro('O arquivo chegou diferente do que foi enviado. Tente de novo.', 'VALIDATION');
        }
        const alvo = await this.alvo(quem, cofreId, op);
        if (alvo.papel === 'leitura') throw erro('Você só pode ler este cofre.', 'SEM_PERMISSAO');

        const existente = await db.select({ cofreId: cofreAnexos.cofreId, sha256: cofreAnexos.sha256 }).from(cofreAnexos).where(eq(cofreAnexos.id, id)).limit(1);
        if (existente[0]) {
            if (existente[0].cofreId === cofreId && existente[0].sha256 === sha) return;
            throw erro('Este anexo já existe.', 'DUPLICATE_ENTRY');
        }
        // Faxina: blob que nenhum item gravado citou em 24 h (upload abandonado) sai daqui, do cofre que está recebendo.
        await db.delete(cofreAnexos).where(and(eq(cofreAnexos.cofreId, cofreId), isNull(cofreAnexos.ligadoEm), lt(cofreAnexos.criadoEm, new Date(Date.now() - LIXO_APOS_MS))));
        const doItem = await db.select({ n: sql<number>`count(*)` }).from(cofreAnexos).where(eq(cofreAnexos.itemId, itemId));
        if (Number(doItem[0]?.n ?? 0) >= MAX_ANEXOS_POR_ITEM) throw erro(`Um item aceita até ${MAX_ANEXOS_POR_ITEM} arquivos.`, 'VALIDATION');
        const usado = await db
            .select({ total: sql<number>`coalesce(sum(${cofreAnexos.tamanho}), 0)` })
            .from(cofreAnexos)
            .innerJoin(cofreCofres, eq(cofreCofres.id, cofreAnexos.cofreId))
            .where(eq(cofreCofres.dono, alvo.dono));
        if (Number(usado[0]?.total ?? 0) + corpo.length > COTA_POR_DONO) throw erro('Espaço de arquivos do cofre cheio (500 MiB). Apague anexos antigos.', 'VALIDATION');
        await db.insert(cofreAnexos).values({ id, cofreId, itemId, tamanho: corpo.length, sha256: sha, blob: corpo });
    }

    /** Devolve o blob cifrado. Qualquer membro do cofre lê; quem não tem acesso recebe o mesmo "não encontrado" de id inexistente. */
    public async baixar(quem: string, idBruto: unknown, op: OpcoesDeAnexo = {}): Promise<{ blob: Buffer; sha256: string }> {
        const id = uuid(idBruto, 'id');
        const r = await db.select({ cofreId: cofreAnexos.cofreId, blob: cofreAnexos.blob, sha256: cofreAnexos.sha256 }).from(cofreAnexos).where(eq(cofreAnexos.id, id)).limit(1);
        if (!r[0]) throw erro('Anexo não encontrado.', 'NOT_FOUND');
        await this.alvo(quem, r[0].cofreId, op).catch(() => {
            throw erro('Anexo não encontrado.', 'NOT_FOUND');
        });
        return { blob: r[0].blob, sha256: r[0].sha256 };
    }

    /** Apaga um blob (o navegador desfaz um upload cujo item não chegou a ser gravado). Exige escrita. */
    public async apagar(quem: string, idBruto: unknown, op: OpcoesDeAnexo = {}): Promise<void> {
        const id = uuid(idBruto, 'id');
        const r = await db.select({ cofreId: cofreAnexos.cofreId }).from(cofreAnexos).where(eq(cofreAnexos.id, id)).limit(1);
        if (!r[0]) throw erro('Anexo não encontrado.', 'NOT_FOUND');
        const alvo = await this.alvo(quem, r[0].cofreId, op).catch(() => {
            throw erro('Anexo não encontrado.', 'NOT_FOUND');
        });
        if (alvo.papel === 'leitura') throw erro('Você só pode ler este cofre.', 'SEM_PERMISSAO');
        await db.delete(cofreAnexos).where(eq(cofreAnexos.id, id));
    }
}

export const cofreAnexoService = new CofreAnexoService();
