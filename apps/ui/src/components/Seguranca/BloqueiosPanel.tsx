import { useCallback, useEffect, useState } from 'react';
import { ShieldExclamationIcon, LockOpenIcon, ArrowPathIcon, GlobeAltIcon, UserIcon } from '@heroicons/react/24/outline';
import { bloqueioApi } from '@loginhub/api-client';
import type { LoginBloqueio } from '@loginhub/schema';

/**
 * Lista negra do login de um app (28/10/2026).
 *
 * A regra mora no hub (`BloqueioService`): 5 senhas ou códigos 2FA errados do
 * mesmo IP bloqueiam o IP; 10 erros na mesma conta em 1 h bloqueiam a conta;
 * nada expira — só o botão Liberar solta. O app dono tem a mesma lista no
 * painel dele (a Sul, por exemplo, em "Lista negra"); aqui é a visão do
 * administrador do hub, para socorrer quando o app não alcança.
 */
const quando = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const BloqueiosPanel = ({ appId }: { appId: string | undefined }) => {
  const [itens, setItens] = useState<LoginBloqueio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [liberando, setLiberando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!appId) return;
    try {
      setItens(await bloqueioApi.getByAppId(appId));
      setErro('');
    } catch {
      setErro('Não foi possível carregar a lista negra.');
    } finally {
      setCarregando(false);
    }
  }, [appId]);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 30000);
    return () => clearInterval(t);
  }, [carregar]);

  const bloqueados = itens.filter((b) => b.bloqueadoEm && !b.liberadoEm);
  const emContagem = itens.filter((b) => !b.bloqueadoEm && !b.liberadoEm);
  const liberados = itens.filter((b) => b.liberadoEm);

  const liberar = async (b: LoginBloqueio) => {
    const quem = b.tipo === 'ip' ? `o IP ${b.alvo}` : `a conta ${b.alvo}`;
    if (!window.confirm(`Liberar ${quem}? A pessoa volta a poder tentar entrar.`)) return;
    setLiberando(b.id);
    try {
      await bloqueioApi.liberar(b.id, 'painel do hub', appId);
      await carregar();
    } catch {
      setErro('Não foi possível liberar.');
    } finally {
      setLiberando(null);
    }
  };

  const Icone = ({ tipo }: { tipo: string }) =>
    tipo === 'ip' ? <GlobeAltIcon className="h-4 w-4 text-muted-foreground shrink-0" /> : <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />;

  return (
    <div className="max-w-7xl mx-auto mb-6">
      <div className="bg-card text-card-foreground rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldExclamationIcon className="h-5 w-5 text-red-600" />
              Lista negra do login
              <span className={`text-xs px-2 py-0.5 rounded-full ${bloqueados.length ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>{bloqueados.length} bloqueado(s)</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              5 senhas ou códigos errados do mesmo IP bloqueiam o IP; 10 erros na mesma conta em 1 h bloqueiam a conta. Só sai por Liberar.
            </p>
          </div>
          <button onClick={() => void carregar()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition">
            <ArrowPathIcon className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>

        {erro && <p className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-100">{erro}</p>}

        {!carregando && !bloqueados.length && !emContagem.length && !liberados.length && (
          <p className="px-4 py-4 text-sm text-muted-foreground">Ninguém bloqueado, ninguém errando.</p>
        )}

        {bloqueados.length > 0 && (
          <ul className="divide-y divide-border">
            {bloqueados.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Icone tipo={b.tipo} />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-foreground truncate">{b.alvo}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.tentativas} tentativas ({b.origem === '2fa' ? 'código 2FA' : 'senha'}) · bloqueado {quando(b.bloqueadoEm)}
                    {b.detalhe && <> · {b.tipo === 'ip' ? 'última conta' : 'último IP'}: <span className="font-mono">{b.detalhe}</span></>}
                  </p>
                </div>
                <button
                  onClick={() => void liberar(b)}
                  disabled={liberando === b.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-success text-primary-foreground rounded-lg hover:bg-success/90 transition text-xs font-medium disabled:opacity-50"
                >
                  <LockOpenIcon className="h-4 w-4" /> Liberar
                </button>
              </li>
            ))}
          </ul>
        )}

        {emContagem.length > 0 && (
          <div className="border-t border-border">
            <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Errando, ainda sem bloqueio</p>
            <ul className="divide-y divide-border">
              {emContagem.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2 text-muted-foreground">
                  <Icone tipo={b.tipo} />
                  <p className="font-mono text-sm flex-1 truncate">{b.alvo}</p>
                  <p className="text-xs">{b.tentativas} de {b.tipo === 'ip' ? 5 : 10} · {quando(b.ultimaTentativa)}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {liberados.length > 0 && (
          <div className="border-t border-border opacity-70">
            <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Liberados (30 dias)</p>
            <ul className="divide-y divide-border">
              {liberados.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2 text-muted-foreground">
                  <Icone tipo={b.tipo} />
                  <p className="font-mono text-sm flex-1 truncate line-through">{b.alvo}</p>
                  <p className="text-xs">liberado {quando(b.liberadoEm)}{b.liberadoPor ? ` por ${b.liberadoPor}` : ''}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
