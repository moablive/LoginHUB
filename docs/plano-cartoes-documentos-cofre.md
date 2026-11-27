# Plano — Cartões e documentos no cofre do LoginHUB

Pedido do dono em 27/11/2026: botões **Adicionar cartão** e **Adicionar documento** no cofre, para guardar cartões
bancários, CNH, RG, CPF e outros documentos "de forma 100% segura". Base: pesquisa do buscaia
(`awldocs.studies#270`, "loginhub_cofre_cartoes_e_documentos") cruzada com o código atual do cofre.

"100% seguro" não existe: o plano garante que **o servidor, o banco e o backup nunca veem o conteúdo**, e que o
conteúdo aberto no navegador vive o mínimo possível. Dispositivo comprometido, extensão maliciosa e phishing continuam
fora do alcance de qualquer cofre — a tela não promete mais do que isso.

## 1. O que já existe (e vamos reaproveitar)

| Peça | Estado hoje |
|---|---|
| Cifra | Navegador, `@noble` (Argon2id 64 MiB → chave mestra → chave da conta → chave do cofre → item). XChaCha20-Poly1305, envelope `v1.<nonce>.<cifra>`, dado associado amarra dono + cofre + item (`apps/ui/src/features/cofre/cripto.ts`) |
| Item | Um JSON `ItemCofre` (título, usuário, senha, url, totp, notas, ícone, `campos[]` extras) cifrado inteiro em `cofre_itens.dados` (db/013). Servidor só vê texto |
| Compartilhar | Cofre selado por X25519 para outras contas, giro de chave ao remover membro, `geracao` contra corrida (db/022, 023) |
| Biometria | Passkey com PRF abre a conta (`digital.ts`, db/015); aparelhos aprovados (db/014, 017, 019) |
| CLI | `hub-pass` lê/escreve itens; tipos espelhados em `cli/hub-pass/src/tipos-cofre.ts` |
| Limite | `express.json({ limit: '5mb' })` — **não serve para foto/PDF**: anexo precisa de rota binária própria |

Conclusão: **não precisa de cripto nova**. Cartão e documento são novos *formatos* de item; o anexo é a única peça nova
no servidor.

## 2. Decisões de projeto

1. **Tipo do item dentro do JSON cifrado** (`tipo: 'login' | 'cartao' | 'documento'`; ausente = `login`). Nenhuma coluna
   nova em `cofre_itens`: o servidor não fica sabendo nem *quais* itens são cartões. Itens antigos seguem abrindo.
2. **Anexos cifrados no navegador, uma chave por anexo** (File Key aleatória de 256 bits). A File Key mora **dentro do
   JSON do item** (já cifrado pela chave do cofre). Assim: compartilhar o cofre dá acesso aos anexos sem nada extra, e o
   giro de chave do cofre recifra só o JSON do item — **os blobs não precisam ser regravados**.
3. **Blob no Postgres (`bytea`)**, tabela `cofre_anexos`, limite 10 MiB por arquivo. Um MinIO novo seria mais um serviço
   a manter (Regra 1) por pouco ganho para uso pessoal. Reavaliar se passar de ~2 GB.
4. **CVV e PIN: desligados por padrão** ("Não salvar CVV/PIN"). Quem liga, liga sabendo. Número completo é guardado
   (é o uso do cofre); lista mostra só bandeira + final.
5. **Revelar/copiar campo sensível pede reautenticação (step-up)** com a digital (passkey) ou a palavra-passe, com
   validade curta (60 s). Auto-ocultar em 20 s; área de transferência limpa em 30 s (CVV nunca vai para a área de
   transferência).
6. **Sem busca no servidor e sem índice** sobre número de cartão ou documento. A busca da tela é local e ignora esses
   campos (só apelido, bandeira, final, tipo do documento).
7. **Auditoria sem conteúdo**: registrar *que* um campo sensível foi revelado/copiado e quando, só localmente (aparelho)
   e como evento genérico no servidor (`revelou_campo`, sem valor, sem nome do campo se possível).
8. **Fora do escopo**: bloquear captura de tela (a web não consegue; no app Capacitor, `FLAG_SECURE` fica como
   melhoria futura), OCR do documento (se um dia existir, roda só no aparelho), extração automática de dados.

## 3. Modelo de dados (dentro do JSON cifrado)

```ts
type TipoItem = 'login' | 'cartao' | 'documento';

interface ItemBase { tipo?: TipoItem; titulo: string; notas: string; icone?: string; campos?: CampoExtraItem[] }

interface ItemCartao extends ItemBase {
  tipo: 'cartao';
  titular: string;
  numero: string;          // só dígitos; mascarado na tela
  bandeira: string;        // detectada pelo BIN no cliente, editável
  final: string;           // últimos 4, em claro dentro do JSON, para a lista
  validade: string;        // MM/AA
  cvv?: string;            // só se "salvar CVV" ligado
  pin?: string;
  banco?: string;
}

interface ItemDocumento extends ItemBase {
  tipo: 'documento';
  documento: 'cnh' | 'rg' | 'cpf' | 'passaporte' | 'titulo' | 'outro';
  numero: string;          // mascarado na tela
  nome: string;
  emissao?: string; validade?: string; categoria?: string; orgao?: string; nascimento?: string;
  anexos: Array<{ id: string; nome: string; mime: string; tamanho: number; chave: string /* File Key base64 */; sha256: string }>;
}
```

Validação ao salvar (cliente e, nos campos que o servidor vê — só tamanho —, servidor): Luhn no número do cartão, CPF
com dígitos verificadores, validade não vencida (aviso, não bloqueio), MIME ∈ {jpeg, png, webp, pdf}.

### Tabela nova — `db/026_cofre_anexos.sql` (só acrescenta, idempotente)

```sql
CREATE TABLE IF NOT EXISTS cofre_anexos (
    id            UUID PRIMARY KEY,                 -- sorteado no navegador; entra no dado associado
    cofre_id      UUID NOT NULL REFERENCES cofre_cofres(id) ON DELETE CASCADE,
    item_id       UUID NOT NULL REFERENCES cofre_itens(id) ON DELETE CASCADE,
    tamanho       INTEGER NOT NULL CHECK (tamanho BETWEEN 1 AND 10485760 + 64),
    sha256        CHAR(64) NOT NULL,                -- do texto cifrado, para integridade no download
    blob          BYTEA NOT NULL,                   -- "v1" + nonce(24) + cifra; nome e MIME NÃO ficam aqui
    criado_em     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cofre_anexos_item_idx ON cofre_anexos (item_id);
```

Nome e MIME do arquivo ficam **só no JSON cifrado do item**. Dado associado do anexo:
`anexo:<dono>:<cofre>:<item>:<anexo>` — o servidor não troca um blob de lugar.

## 4. Fases

### F0 — Tipos e schema (meio dia)
- `packages/schema/src/cofre.ts`: `TipoItem`, `ItemCartao`, `ItemDocumento`, `AnexoRef`; espelhar em
  `cli/hub-pass/src/tipos-cofre.ts` (o cabeçalho do arquivo já manda).
- `db/026_cofre_anexos.sql` + tabela Drizzle. **Ensaio em container `--rm` antes de aplicar** (nota
  `loginhub-cofre-hub-pass`). Nenhuma migração em tabela existente.

### F1 — Item com tipo, sem quebrar o que existe (1 dia)
- `useCofre.ts`: `ItemCofre` vira união discriminada; `salvarItem`/abertura tratam `tipo` ausente como `login`.
  Contador de `ilegiveis` não pode subir por causa de tipo novo.
- `CofrePage.vue`: botão `+ Item` vira menu **Login · Cartão · Documento** (o botão de hoje, linha ~946, continua o
  padrão para não mudar o hábito). Ícones novos em `CofreItemIcone.vue`.
- Lista: cartão mostra `bandeira •••• final`; documento mostra `tipo + final do número`. Nunca o número inteiro.

### F2 — Cartão (1 dia)
- Formulário `CartaoForm.vue`: número com máscara em grupos, bandeira por BIN (Visa, Master, Elo, Hipercard, Amex),
  Luhn, validade `MM/AA`, titular. **CVV/PIN recolhidos**, toggle "Não salvar CVV/PIN" ligado, com o aviso:
  *"Ficam cifrados no seu aparelho e só saem cifrados. Quem tiver sua palavra-passe, ou acesso a este cofre
  compartilhado, poderá vê-los."*
- Detalhe: campos sensíveis como `•••• ••••`, botões **Mostrar** e **Copiar** (F5). Atributos
  `autocomplete="off"`, `autocapitalize="off"`, `spellcheck="false"` e `inputmode="numeric"`; **sem** `name`/`id`
  reconhecíveis (`cc-number`) para o gerenciador do navegador não oferecer salvar o cartão em outro cofre.

### F3 — Anexos cifrados (1,5 dia)
- Cliente `anexos.ts`: lê o arquivo → reduz foto (canvas, lado máx. 2000 px, JPEG 0,85, **descarta EXIF/GPS**) → File
  Key aleatória → `cifrar` → `sha256` do cifrado → `PUT /cofre/anexos/:id` binário (`application/octet-stream`).
- API `controllers/cofre.ts` + `routes`: `PUT/GET/DELETE /cofre/anexos/:id`.
  - Corpo binário com `express.raw({ limit: '10mb' })` **só nessa rota**; o `json({limit:'5mb'})` global fica como está.
  - Reaproveitar a checagem de papel do cofre (membro `leitura` não grava), `geracao` e propriedade do item.
  - Rate limit próprio (upload 20/min, download 60/min por conta). Valida tamanho e sha256 do corpo.
  - `Cache-Control: no-store`, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`; **nunca** URL
    pública e nunca token na URL. Log não registra corpo.
- Ordem de gravação que não deixa lixo: 1) sobe o blob, 2) grava o item com a `AnexoRef`; se o passo 2 falha, o cliente
  apaga o blob. Faxina no servidor: blob sem item citado há > 24 h é apagado (job em `awlnoturno`? decidir na F7).
- Apagar item apaga os blobs (`ON DELETE CASCADE`). Remover anexo da edição apaga o blob.
- Visualizador: decifra em `Uint8Array`, abre em `Blob` URL **só para a aba aberta** e revoga ao fechar; PDF em
  `<iframe sandbox>` ou `pdf.js`; nenhum cache em `localStorage`/IndexedDB; `<img>` com `draggable=false`.

### F4 — Documento (1 dia)
- Formulário `DocumentoForm.vue` por tipo (CNH: número, categoria, validade, 1ª habilitação; RG: número, órgão, UF,
  nascimento, filiação; CPF: só número; passaporte; outro). Foto frente/verso com miniatura ofuscada (blur até **Mostrar**).
- Aviso de vencimento (CNH/passaporte) calculado **localmente**, sem notificação no servidor (o servidor não sabe a
  data). Opcional depois: lembrete no próprio navegador.

### F5 — Step-up, revelar e copiar (1 dia)
- `features/cofre/revelar.ts`: `exigirPresenca()` — se há digital (passkey PRF) usa WebAuthn
  `userVerification: 'required'`; senão pede a palavra-passe (Argon2id local, sem rede). Vale 60 s por aba e é
  descartada ao trancar o cofre ou perder o foco por > 60 s.
- Campo sensível: **Mostrar** (auto-oculta em 20 s) e **Copiar** (limpa a área de transferência em 30 s com
  `navigator.clipboard.writeText('')` se o conteúdo ainda for o que copiamos; CVV/PIN sem **Copiar**).
- Ao trancar (tempo de inatividade já existente, `CHAVE_TEMPO_TRANCA`): zera valores revelados e revoga Blob URLs.
- `visibilitychange`: ao ir para segundo plano, oculta tudo.

### F6 — `hub-pass` CLI e compartilhamento (meio dia)
- `item view` de cartão/documento: **campos sensíveis só com `--field` explícito** (`numero`, `cvv`…); a saída padrão
  mostra só o que a lista mostra. `item create --tipo cartao|documento`. Anexo: `hub-pass item anexo <item> --out <arq 600>`.
  Mantém o que a Regra 22 já exige (nunca na tela/log/git).
- Compartilhar cofre com membro: a UI avisa *"Este cofre tem cartões/documentos; quem entrar vê tudo"* e sugere cofre
  separado "Documentos" (privado). Padrão: cartão e documento nascem num cofre pessoal, não no compartilhado.
- Giro de chave (db/023): o JSON do item é recifrado como hoje; **blobs intactos** (a File Key está no JSON).

### F7 — Testes, SEC, deploy e documentação (1 dia)
- Testes (vitest): abrir/fechar item `login` antigo; roundtrip cartão e documento; anexo com dado associado trocado
  falha; blob adulterado falha (`CHAVE_ERRADA`); Luhn/CPF; girar-chave com item com anexo; membro `leitura` não grava
  anexo; limite de 10 MiB e de taxa; item sem `tipo` abre.
- Teste de vazamento: com o banco inteiro (`pg_dump`) nenhuma string de teste ("4111111111111111", "123.456.789-09")
  aparece em claro; nenhum log de API contém corpo.
- CSP: confirmar que `blob:` está permitido só em `img-src`/`frame-src`; sem `unsafe-inline` novo.
- `awlsec-guardrail` nos arquivos da tarefa (Regra 4) e revisão `security-reviewer`.
- Deploy: API e packages sobem por hot reload, a UI exige build (nota `loginhub-cofre-hub-pass`); **conferir
  `git status`, `~/sh/historico.log` e `docker ps` antes** — dois `compose up` simultâneos já derrubaram o painel do hub
  (nota `deploy-concorrente-mesmo-compose`). Nunca `npm install` dentro do container da API. Migração 026 por `~/sh`
  (Regra 5/17) com backup do banco antes.
- Documentação: este plano no Google Doc (Regra 2), `CLAUDE.md` do projeto e a LP (`VaultVisual.vue` só se o dono
  quiser divulgar).

Esforço total estimado: **~6,5 dias de trabalho**, entregável por fase (F0–F2 já dão "Adicionar cartão" funcionando; F3–F4
acrescentam "Adicionar documento" com arquivos).

## 5. Riscos e armadilhas

| Risco | Mitigação |
|---|---|
| Servidor comprometido ou banco vazado | Só texto cifrado; nome, MIME, tipo e chaves dentro do JSON cifrado; teste de `pg_dump` na F7 |
| Navegador oferece salvar o cartão em outro lugar / extensão lê o campo | Atributos sem nome reconhecível, `autocomplete=off`; aviso de extensões; auto-ocultar |
| Foto com GPS/EXIF | Recompressão no canvas descarta metadados |
| PDF malicioso anexado | Só abre no visualizador sandboxed, `nosniff`, `attachment` no download direto; nada é executado no servidor |
| Cofre compartilhado expõe cartões | Aviso na hora de compartilhar + padrão em cofre pessoal |
| Perda da palavra-passe e do kit | Cartões e documentos entram no recovery kit existente (kit abre a chave da conta); reforçar o aviso do kit |
| Anexo órfão | Ordem blob→item com desfazer + faxina de blobs sem referência |
| PCI DSS / LGPD | Uso pessoal, o dono é o titular dos dados e não processa pagamento de terceiros: PCI DSS de comerciante não se aplica. Mesmo assim: CVV off por padrão, nunca em log/área de transferência. Se o cofre guardar dado de **clientes/terceiros** (ex.: documento de artista da label), a LGPD passa a valer para o dono como controlador — consultar o ⚖️ Jurídico antes |
| Mudança de formato | Envelope `v1` mantido; `tipo` é campo novo opcional; versão do item no JSON (`v: 1`) para migrar depois |

## 6. Perguntas para o dono antes de começar

1. **Cofre**: cartões e documentos entram num cofre novo "Documentos" (recomendado, nunca compartilhado) ou no cofre
   que a pessoa escolher?
2. **Cartão**: guardar o número completo (recomendado, é o uso) ou só apelido + final + validade?
3. **Uso por terceiros**: vão guardar documento de outras pessoas (artistas, clientes)? Se sim, vale a consulta ao
   Jurídico (LGPD) e vira regra de cofre compartilhado.
4. **Limite de anexo**: 10 MiB por arquivo está bom?
5. **Prioridade**: entrega em duas levas (cartão primeiro, F0–F2; documentos depois, F3–F4) ou tudo junto?

## HISTÓRICO

- 27/11/2026 — Plano criado a partir da pesquisa do buscaia (`awldocs.studies#270`) e da leitura do cofre atual
  (db/013–025, `cripto.ts`, `useCofre.ts`, `CofrePage.vue`, `controllers/cofre.ts`, `hub-pass`).
