import { useEffect, useState } from 'react';
import {
  XMarkIcon,
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import { categoriaApi } from '@loginhub/api-client';
import type { Categoria, DirecaoMovimento } from '@loginhub/schema';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';

interface CategoriasModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Disparado a cada mudança (criar, renomear, mover, apagar) para o painel recarregar. */
  onChanged: () => void;
}

/**
 * Gestão dos grupos de apps do painel: criar, renomear, subir/descer e apagar.
 *
 * Apagar uma categoria NÃO apaga app: eles voltam para "Sem categoria". O
 * `total_apps` que vem da API é o que avisa quantos vão voltar.
 */
export const CategoriasModal = ({ isOpen, onClose, onChanged }: CategoriasModalProps) => {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [novoNome, setNovoNome] = useState('');
  const [editando, setEditando] = useState<{ id: number; nome: string } | null>(null);
  const [paraApagar, setParaApagar] = useState<Categoria | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    try {
      setCategorias(await categoriaApi.getAll());
    } catch (e) {
      console.error(e);
      setErro('Não foi possível carregar as categorias.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setErro(null);
      setEditando(null);
      setNovoNome('');
      carregar();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const mensagemDe = (e: unknown, padrao: string) =>
    axios.isAxiosError(e) && e.response?.data?.message ? String(e.response.data.message) : padrao;

  const executar = async (acao: () => Promise<unknown>, padrao: string) => {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
      await carregar();
      onChanged();
    } catch (e) {
      console.error(e);
      setErro(mensagemDe(e, padrao));
    } finally {
      setOcupado(false);
    }
  };

  const criar = (e: React.FormEvent) => {
    e.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    executar(async () => {
      await categoriaApi.create({ nome });
      setNovoNome('');
    }, 'Não foi possível criar a categoria.');
  };

  const salvarNome = () => {
    if (!editando) return;
    const nome = editando.nome.trim();
    if (!nome) return;
    executar(async () => {
      await categoriaApi.update(editando.id, { nome });
      setEditando(null);
    }, 'Não foi possível renomear a categoria.');
  };

  const mover = (id: number, direcao: DirecaoMovimento) =>
    executar(() => categoriaApi.mover(id, direcao), 'Não foi possível mover a categoria.');

  const confirmarApagar = () => {
    if (!paraApagar) return;
    const alvo = paraApagar;
    executar(async () => {
      await categoriaApi.delete(alvo.id);
      setParaApagar(null);
    }, 'Não foi possível apagar a categoria.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-black/70 backdrop-blur-sm animate-fade-in sm:items-center">
      <div className="my-auto w-full max-w-lg shrink-0 overflow-hidden rounded-2xl bg-card text-card-foreground shadow-xl">
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-muted/50">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <TagIcon className="h-5 w-5 text-primary" />
            Categorias de Aplicativos
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition" aria-label="Fechar">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {erro && (
            <div className="bg-danger/10 border-l-4 border-red-500 p-3 rounded-md">
              <p className="text-sm text-danger">{erro}</p>
            </div>
          )}

          <form onSubmit={criar} className="flex gap-2">
            <input
              type="text"
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              placeholder="Nova categoria (ex.: Financeiro)"
              maxLength={100}
              className="flex-1 px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-base sm:text-sm"
            />
            <button
              type="submit"
              disabled={ocupado || !novoNome.trim()}
              className="flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition font-medium disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              Criar
            </button>
          </form>

          <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {categorias.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhuma categoria ainda. Crie a primeira acima — os apps ficam em "Sem categoria" até serem agrupados.
              </li>
            )}
            {categorias.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2.5 bg-card">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => mover(c.id, 'cima')}
                    disabled={ocupado || i === 0}
                    title="Subir"
                    className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-25 disabled:hover:bg-transparent"
                  >
                    <ChevronUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(c.id, 'baixo')}
                    disabled={ocupado || i === categorias.length - 1}
                    title="Descer"
                    className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-25 disabled:hover:bg-transparent"
                  >
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                </div>

                {editando?.id === c.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editando.nome}
                    maxLength={100}
                    onChange={e => setEditando({ id: c.id, nome: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); salvarNome(); }
                      if (e.key === 'Escape') setEditando(null);
                    }}
                    className="flex-1 px-3 py-1.5 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.total_apps === 1 ? '1 aplicativo' : `${c.total_apps ?? 0} aplicativos`}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-1">
                  {editando?.id === c.id ? (
                    <>
                      <button type="button" onClick={salvarNome} disabled={ocupado} title="Salvar"
                        className="p-2 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-50">
                        <CheckIcon className="h-5 w-5" />
                      </button>
                      <button type="button" onClick={() => setEditando(null)} title="Cancelar"
                        className="p-2 rounded-lg text-muted-foreground hover:bg-muted">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setEditando({ id: c.id, nome: c.nome })} disabled={ocupado} title="Renomear"
                        className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-50">
                        <PencilSquareIcon className="h-5 w-5" />
                      </button>
                      <button type="button" onClick={() => setParaApagar(c)} disabled={ocupado} title="Apagar categoria"
                        className="p-2 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 disabled:opacity-50">
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">
            A ordem daqui é a ordem dos grupos no painel. Apagar uma categoria não apaga aplicativo: eles voltam para "Sem categoria".
          </p>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-foreground bg-card border border-input rounded-lg hover:bg-muted/50 transition font-medium"
          >
            Fechar
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!paraApagar}
        onClose={() => setParaApagar(null)}
        onConfirm={confirmarApagar}
        title="Apagar categoria"
        highlight={paraApagar?.nome}
        variant="danger"
        confirmText="Apagar"
        isLoading={ocupado}
        message={
          paraApagar && (paraApagar.total_apps ?? 0) > 0
            ? `${paraApagar.total_apps === 1 ? '1 aplicativo vai voltar' : `${paraApagar.total_apps} aplicativos vão voltar`} para "Sem categoria". Nenhum aplicativo será apagado.`
            : 'A categoria está vazia. Nenhum aplicativo será afetado.'
        }
      />
    </div>
  );
};
