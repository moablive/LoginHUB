# Plano — Admins de organização, biometria em todos os apps e cofre de senhas

Pedido do dono em 19/11/2026: "evoluir o LoginHUB para ele também salvar minhas senhas, com
cofres como os do Proton Pass CLI, com uma chave comigo e mais criptografia; habilitar a
biometria em todos os apps; e poder convidar admin de uma organização pelo próprio hub — o
novo admin, ao entrar no LoginHUB dele, pode convidar outras pessoas".

Três frentes, nesta ordem: **A** (admins de organização) já está feita; **B** (biometria em
todos os apps) e **C** (cofre) são as próximas.

---

## A. Admins de organização — FEITO (v1.2.0, 19/11/2026)

**Organização = categoria do painel** (LBS, SUL ALIMENTOS, ASTRAL WAVE, SRV, MOVING, NÃO TE ESQUECE…).

| Peça | Como ficou |
|---|---|
| Conta do admin | Conta comum do hub, no app novo **"LoginHUB · Painel"** (`aplicativos.painel_do_hub = TRUE`, sem categoria). Ganha de graça o que o hub já protege: convite por magic link, **2FA obrigatório**, piso de sessão, lista negra do login, reset de senha/2FA pelo master |
| Poder | Tabela `admins_organizacao (usuario_id, categoria_id, convidado_por, criado_em)`: uma linha por organização. Sem linha, a sessão não abre nada em `/admin` |
| Login | Tela de login com duas abas: **Administrador** (e-mail + senha + Google Authenticator; `POST /auth/login` com `painel: true`) e **Master Key** (como sempre) |
| O que o admin vê | Só os apps das organizações dele. Pode: ver/criar/editar/desativar/excluir usuários desses apps, reenviar convite, reiniciar 2FA, ver e liberar lista negra e aparelhos, **convidar e remover admins** da organização |
| O que continua só do master | Criar/editar/excluir/ordenar app, ativar/desativar app, categorias, vendas (planos, afiliados, assinaturas), lista global de usuários, gerir as contas do próprio app do painel |
| Botão novo | **"Convidar admin"** no topo do painel e **"Admins"** no cabeçalho de cada organização: gaveta com a lista (ativo / convite pendente), o formulário nome + e-mail e o "tirar da organização" |
| Convite | Pessoa nova → e-mail do hub (modelo padrão) → define senha → escaneia o QR do Google Authenticator → entra pela aba Administrador. Quem já é admin de outra organização só ganha a linha nova, sem e-mail |

### Segurança (decisões)

- **Negar por padrão.** Dois roteadores no `/admin`: o `orgRouter` (só as rotas abertas ao admin de
  organização, cada uma com a guarda do alvo) e o `adminRouter` com `soMaster` para todo o resto.
  Rota nova nasce só do master; abrir para organização é decisão explícita.
- **Guardas do alvo**: `exigirAppNoEscopo`, `exigirUsuarioNoEscopo`, `exigirOrganizacaoNoEscopo`.
  Alvo inexistente recebe a mesma resposta de alvo alheio (403 `FORA_DA_ORGANIZACAO`).
- **Conferido no banco a cada pedido**: conta ativa, app do painel ativo, 2FA ativo, piso de sessão
  e organizações. Tirar alguém da organização vale no pedido seguinte, sem esperar o JWT vencer.
- **Sem HTML de e-mail nem senha vindos do admin de organização** (`addUser`, `reset-password`): o
  convite sai pelo modelo do hub. Sem isso, o SMTP do hub mandaria qualquer HTML que ele escrevesse.
- O admin não se tira da própria organização (evita trancar-se fora); outro admin ou o master tira.
- O app do painel nunca entra no escopo de uma organização.

### Pendências da frente A

- O provisionamento da Sul Alimentos (convite de vendedor pela API da Sul) usa o token do painel:
  conferir se a API da Sul aceita a sessão de um admin de organização (hoje ela espera o master).
- Avisar por e-mail quem foi acrescentado a uma segunda organização (hoje só aparece na lista).
- Registro de auditoria (quem convidou/removeu quem, quando) numa tabela própria.

---

## B. Biometria (passkey) em todos os apps

A base já existe (`PasskeyService`, `hubPasskeyClient.ts` do auth-kit, ligada só no MoneyAPP).

| Fase | O quê |
|---|---|
| B1 | **Uma passkey para todos os apps `*.astralwavelabel.com`**: `webauthn_rp_id = astralwavelabel.com` nos apps desse domínio (o WebAuthn aceita o domínio-pai como rpId). Cadastra uma vez, entra com a digital em todos |
| B2 | Copiar o `hubPasskeyClient.ts` e o par botão "Entrar com biometria" + oferta pós-login (igual ao MoneyAPP) para Escritórios 3D, NotesAPP, TodoAPP, CloudShell, Moabinho, MovingUP, NãoTeEsquece e o próprio painel do hub |
| B3 | Sul Alimentos (`sulalimentos.com`, outro domínio, rpId próprio) e as contas de CPF: encaixar a passkey nas vagas de aparelho do `AparelhoService` (a "fase F3" que o código já cita) |
| B4 | Extensão **PRF** do WebAuthn na passkey: além de entrar, ela devolve um segredo fixo que destranca o cofre (frente C) |

Observação: quem guarda a passkey é o aparelho (Senhas da Apple, Google, Proton Pass). Web app do
Safari no Mac ("Adicionar ao Dock") não roda extensão, então lá o Proton Pass não aparece.

---

## C. Cofre de senhas cifrado de ponta a ponta

> **v1.4.0 (19/11/2026):** cofre também para os usuários dos apps liberados pelo master (`/meu-cofre`, dono
> `u:<id>`) e o CLI `hub-pass` com máquina aprovada (revogável) — ver o README.
>
> **Primeira entrega no ar (v1.3.0, 19/11/2026):** botão **Cofre** no painel (só o master), palavra-passe +
> kit de recuperação, vários cofres, itens com usuário, senha (gerador), URL, notas e **código 2FA ao vivo**,
> tranca sozinho em 5 min e ao sair da tela. Banco `db/013_cofre.sql` (só texto cifrado), API
> `/admin/cofre/*` (só master), cifra em `apps/ui/src/features/cofre/cripto.ts`, teste em
> `scripts/teste-cofre-cripto.ts`. Falta: biometria (PRF), CLI `hub-pass`, cofre dos admins de
> organização, cofres compartilhados, importar do Proton Pass.

Objetivo: cofres (SERVIDORES, Sul…) com senhas, códigos 2FA e notas, que **nem o servidor do hub
consegue ler**, com um CLI igual ao `pass-cli`.

### Hierarquia de chaves

```
Palavra-passe (só na cabeça do dono)
  └─ Argon2id no aparelho ──► Chave mestra (nunca sai do aparelho)
                                 └─ abre ► Chave da conta (aleatória, 256 bits)
Kit de recuperação (24 palavras, impresso) ─┘          ├─ abre ► Chave do cofre SERVIDORES
Passkey com PRF (digital/rosto) ────────────┘          ├─ abre ► Chave do cofre Sul
                                                       └─ …        └─ cada item: XChaCha20-Poly1305
```

- **Duas portas**: login do hub (senha de hoje + Google Authenticator, ou biometria) prova quem é;
  a palavra-passe abre o cofre. A senha de hoje vai ao servidor e por isso não pode ser a chave.
- O servidor guarda só dado cifrado e a chave da conta embrulhada três vezes (palavra-passe, kit,
  passkey PRF). Perder palavra-passe **e** kit = cofre perdido (é o preço de ninguém mais abrir).
- Cada item com chave própria e dados associados (id do item + id do cofre): o servidor não troca
  itens de lugar sem ser percebido. Envelope versionado (`v1:`) para trocar algoritmo no futuro
  (pós-quântico ML-KEM nos cofres compartilhados).
- Cofre compartilhado: par X25519 por pessoa; a chave do cofre vai cifrada para cada membro.
- Bibliotecas auditadas, em TypeScript (Regra 20): `@noble/hashes` (Argon2id), `@noble/ciphers`
  (XChaCha20-Poly1305), `@noble/curves` (X25519). Nada de cripto escrita à mão.
- Itens guardam usuário, senha, **código 2FA (TOTP)**, URL e notas. **Exceções que ficam fora do
  cofre**: o 2FA do próprio LoginHUB (senão o cofre se tranca por dentro), a palavra-passe e o kit.
  Para acessos críticos (GitHub, Cloudflare, Google, bancos), o 2FA fica só no Google Authenticator.

### CLI `hub-pass`

`hub-pass item view --vault SERVIDORES --item "awlsrv sudo" --field password` e
`hub-pass item totp …`. Cada máquina (awlsrv, bf, Mac, PDV) tem par de chaves próprio, aprovado uma
vez pelo celular com a biometria; revogar uma máquina não exige trocar a palavra-passe.

### Fases

| Fase | O quê |
|---|---|
| C0 | Documento de ameaças e de chaves (detalhar o acima) e aprovação do dono |
| C1 | Pacote `@loginhub/cripto` com testes e vetores fixos (cifra/decifra igual em navegador e Node) |
| C2 | Serviço e banco do cofre **separados** do login (outro container, outro usuário de banco), só dado cifrado |
| C3 | B4 (PRF) para destrancar o cofre com a digital |
| C4 | CLI `hub-pass` + chave por máquina + repasse no bf, Mac e PDV |
| C5 | Tela do cofre no painel, cofres compartilhados por organização |
| C6 | Importar do Proton Pass, rodar os dois juntos e só então mudar a Regra 15 do Ômega |
| C7 | Revisão de segurança (SEC, Parlamento, teste de invasão) |

### Limites conhecidos

1. Cofre aberto pelo navegador: se o awlsrv for invadido e o JavaScript servido trocado, a
   palavra-passe pode ser capturada ao ser digitada. CLI e app instalado não têm esse risco.
2. O cofre mora no awlsrv: a senha que conserta o awlsrv tem de existir também fora dele (kit
   impresso e, no começo, o Proton Pass em paralelo).
3. Preencher sozinho no navegador e no iPhone exige extensão e app nativo — fase posterior.
