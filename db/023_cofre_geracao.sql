-- 023 — Geração da chave do cofre (26/11/2026), contra a corrida entre escrita de item e girar-chave (db/022).
--
-- `geracao` sobe 1 a cada girar-chave. Toda escrita de item de cofre com membros confere a geração que o navegador viu (e o
-- membro, também o selo): escrita feita com a chave de antes do giro é recusada (409 CHAVE_GIRADA) em vez de gravar um item
-- que ninguém abre. O serviço checa e grava numa transação com SELECT … FOR SHARE na linha do cofre; o giro usa FOR UPDATE.
-- Só acrescenta. Idempotente. Enquanto não rodar, a API segue sem a checagem de geração (o serviço detecta a coluna).

ALTER TABLE cofre_cofres ADD COLUMN IF NOT EXISTS geracao INTEGER NOT NULL DEFAULT 0;
