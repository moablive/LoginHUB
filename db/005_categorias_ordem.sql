-- =============================================================================
-- 005_categorias_ordem.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/005_categorias_ordem.sql
--
-- Pedido de 25/09/2026: poder ORDENAR os apps do painel (um para cima, um para
-- baixo) e AGRUPAR os apps em CATEGORIAS.
--
-- Até aqui o painel listava `aplicativos` na ordem que o Postgres devolvia —
-- na prática pelo id, e sem nenhum agrupamento.
--
--   categorias            uma linha por grupo, com `ordem` própria (as
--                         categorias também sobem e descem).
--   aplicativos.categoria_id   NULL = "Sem categoria", que o painel mostra por
--                         último. Apagar a categoria NÃO apaga app nenhum: o
--                         ON DELETE SET NULL devolve os apps para "Sem
--                         categoria".
--   aplicativos.ordem     posição DENTRO da categoria. Subir/descer é trocar
--                         de lugar com o vizinho da mesma categoria; o serviço
--                         renumera o grupo inteiro (1..n) a cada movimento,
--                         então empate ou buraco nunca dura.
--
-- Backfill: cada app recebe a posição que já tinha na tela (ordem por id),
-- para a lista não mudar de cara ao aplicar a migração.
-- =============================================================================

CREATE TABLE IF NOT EXISTS categorias (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL UNIQUE,
    ordem       INTEGER NOT NULL DEFAULT 0,
    criado_em   TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE categorias IS
    'Grupos de aplicativos do painel do LoginHUB. `ordem` e a posicao do grupo na tela.';

ALTER TABLE aplicativos
    ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ordem        INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN aplicativos.categoria_id IS
    'Grupo do painel. NULL = "Sem categoria" (listado por ultimo).';
COMMENT ON COLUMN aplicativos.ordem IS
    'Posicao dentro da categoria (1..n). Renumerada pelo servico a cada movimento.';

CREATE INDEX IF NOT EXISTS aplicativos_categoria_ordem_idx
    ON aplicativos (categoria_id, ordem, id);

-- Posicao inicial = a ordem que o painel ja mostrava (por id).
UPDATE aplicativos a
   SET ordem = n.pos
  FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS pos FROM aplicativos) n
 WHERE a.id = n.id
   AND a.ordem = 0;

-- "Financeiro" e "financeiro" são a mesma categoria: o UNIQUE de `nome` não
-- basta, o índice abaixo fecha a diferença de caixa (o serviço já apara espaços).
CREATE UNIQUE INDEX IF NOT EXISTS categorias_nome_lower_idx ON categorias (lower(nome));
