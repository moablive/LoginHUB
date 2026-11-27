import { Router } from 'express';
import {
  AuthController,
  AppController,
  UserController,
  CategoriaController,
  TwoFactorController,
  BloqueioController,
  AparelhoController,
  OrganizacaoController
} from '../controllers';
import { VendaPublicaController, VendaAdminController } from '../controllers/assinaturas';
import { PasskeyController } from '../controllers/passkeys';
import { MasterPasskeyController } from '../controllers/masterPasskeys';
import { CofreController } from '../controllers/cofre';
import { EntradaController } from '../controllers/entradas';
import {
  adminMiddleware,
  soMaster,
  exigirAppNoEscopo,
  exigirUsuarioNoEscopo,
  exigirOrganizacaoNoEscopo,
  delegationMiddleware,
  authMiddleware,
  rateLimitCodigoEmailStart,
  rateLimitCodigoEmailVerify,
  authMiddlewareEnrolamento,
  rateLimitLogin,
  rateLimitVerificacao2FA,
  rateLimitGestao2FA,
  rateLimitStatus2FA,
  rateLimitCheckout,
  rateLimitVendaLeitura,
  rateLimitPasskey,
  rateLimitCofreConviteDono,
  rateLimitCofreConviteIp,
  cofreAuth
} from '@loginhub/middlewares';

export const mainRouter = Router();

// ==========================================
// 1. Auth Routes
// ==========================================
const authRouter = Router();
authRouter.post('/login', rateLimitLogin as any, AuthController.login);
authRouter.post('/email/start', rateLimitCodigoEmailStart as any, AuthController.emailStart);
authRouter.post('/email/verify', rateLimitCodigoEmailVerify as any, AuthController.emailVerify);
authRouter.post('/logout', AuthController.logout);
authRouter.post('/refresh', AuthController.refresh);
// Introspeccao de revogacao: o app cliente valida assinatura/action/tenant
// localmente, mas nao enxerga o piso de sessao (mora no banco do hub). GET
// porque e leitura pura e cacheavel; autentica com o proprio token, entao
// ninguem varre o piso de terceiros.
authRouter.get('/session-floor', AuthController.pisoDeSessao);
// /change-password saiu de novo: como alias de `setupPassword` ele só produzia
// 400 (o cliente antigo manda `Authorization` + `{ novaSenha }`, e aqui se exige
// `{ token, novaSenha }`). Senha se define pelo magic link, e ponto.
authRouter.post('/setup-password', AuthController.setupPassword as any);
// Fase 2: sessao delegada. O servico (bot) apresenta HUB_DELEGATION_KEY via
// x-service-key e recebe um JWT de usuario curto para repassar ao app, no
// lugar do x-user-id confiado cego. Desligada se a chave nao estiver setada.
authRouter.post('/service/delegate', delegationMiddleware as any, AuthController.delegate as any);

// -- 2FA (TOTP)
//
// Três famílias com proteções diferentes:
//
//   verify / verify-backup  → públicas. A credencial é o `challengeToken` que o
//        login acabou de emitir. Rate limit por CONTA (o `sub` do desafio), não
//        por IP: seis dígitos são 1 milhão de combinações e o atacante pode
//        trocar de origem, mas não de alvo.
//
//   status / setup / verify-setup → enrolamento. Quem chega aqui pode ainda não
//        ter sessão — é justamente o que está indo configurar —, então aceitam
//        também o passe `2fa-setup` de 10 minutos.
//
//   disable / backup-codes → exigem sessão de verdade. Desativar o segundo
//        fator ou trocar os códigos de recuperação são ações de conta aberta;
//        um passe de etapa única não serve, e o `authMiddleware` agora recusa.
const twoFactorRouter = Router();

twoFactorRouter.post('/verify', rateLimitVerificacao2FA as any, TwoFactorController.verify as any);
twoFactorRouter.post('/verify-backup', rateLimitVerificacao2FA as any, TwoFactorController.verifyBackup as any);

const enrolamento = [authMiddlewareEnrolamento as any, rateLimitGestao2FA as any];
// `status` é leitura e sai do balde estreito: a tela de enrolamento consulta a
// cada carregamento, e no celular recarregar é rotina. Ver rateLimitStatus2FA.
twoFactorRouter.get('/status', authMiddlewareEnrolamento as any, rateLimitStatus2FA as any, TwoFactorController.status as any);
twoFactorRouter.post('/setup', ...enrolamento, TwoFactorController.setup as any);
twoFactorRouter.post('/verify-setup', ...enrolamento, TwoFactorController.verifySetup as any);

const gestao = [authMiddleware as any, rateLimitGestao2FA as any];
twoFactorRouter.post('/email-code', ...gestao, TwoFactorController.emailCode as any);
twoFactorRouter.post('/disable', ...gestao, TwoFactorController.disable as any);
// GET foi o especificado; o POST evita o código na query string. Mesmo handler.
twoFactorRouter.get('/backup-codes', ...gestao, TwoFactorController.backupCodes as any);
twoFactorRouter.post('/backup-codes', ...gestao, TwoFactorController.backupCodes as any);

authRouter.use('/2fa', twoFactorRouter);

// -- Biometria (passkeys / WebAuthn; db/010_passkeys.sql)
//
//   login/*     → públicas. A credencial é a assinatura do aparelho sobre um
//        desafio de uso único; com verificação do usuário exigida, ela vale por
//        senha + segundo fator.
//   registro/*  → exigem sessão de verdade: só cadastra biometria quem já
//        entrou com senha + 2FA. Passe de etapa única não serve.
const passkeyRouter = Router();
passkeyRouter.get('/disponivel', rateLimitPasskey as any, PasskeyController.disponivel as any);
passkeyRouter.post('/login/opcoes', rateLimitPasskey as any, PasskeyController.opcoesDeLogin as any);
passkeyRouter.post('/login/verificar', rateLimitPasskey as any, PasskeyController.verificarLogin as any);
passkeyRouter.post('/registro/opcoes', ...gestao, PasskeyController.opcoesDeRegistro as any);
passkeyRouter.post('/registro/verificar', ...gestao, PasskeyController.verificarRegistro as any);
passkeyRouter.get('/', authMiddleware as any, PasskeyController.listar as any);
passkeyRouter.delete('/:id', ...gestao, PasskeyController.revogar as any);

authRouter.use('/passkey', passkeyRouter);

// -- Digital do master (db/020): entrar no painel com a biometria no lugar de digitar a
//    Master Key. Aqui só o que é público (a credencial é a assinatura do aparelho);
//    cadastrar, listar e tirar moram no adminRouter, atrás do `soMaster`.
const masterPasskeyRouter = Router();
masterPasskeyRouter.get('/disponivel', rateLimitPasskey as any, MasterPasskeyController.disponivel as any);
masterPasskeyRouter.post('/login/opcoes', rateLimitPasskey as any, MasterPasskeyController.opcoesDeLogin as any);
masterPasskeyRouter.post('/login/verificar', rateLimitPasskey as any, MasterPasskeyController.verificarLogin as any);
authRouter.use('/master-passkey', masterPasskeyRouter);

// -- Entrada pelo cofre (db/016): a chave da conta mora cifrada no cofre do
//    LoginHUB e assina um desafio de uso único. Mesmas regras da passkey:
//    entrar é público com rate limit; cadastrar e gerir exigem sessão completa.
const entradaRouter = Router();
entradaRouter.post('/login/opcoes', rateLimitPasskey as any, EntradaController.opcoesDeLogin as any);
entradaRouter.post('/login/verificar', rateLimitPasskey as any, EntradaController.verificarLogin as any);
entradaRouter.post('/registro/opcoes', ...gestao, EntradaController.opcoesDeRegistro as any);
entradaRouter.get('/', authMiddleware as any, EntradaController.listar as any);
entradaRouter.delete('/:id', ...gestao, EntradaController.revogar as any);
authRouter.use('/cofre-entrada', entradaRouter);

mainRouter.use('/auth', authRouter);

// ==========================================
// 2. Admin Routes (Protected)
// ==========================================
// Dois roteadores no mesmo /admin (19/11/2026, admins de organização, db/012):
//
//   orgRouter   → o que o admin de ORGANIZAÇÃO também usa. Toda rota daqui tem
//                 a guarda do alvo (app, usuário ou organização dele). O master
//                 passa direto em todas.
//   adminRouter → todo o resto, SÓ do master (`soMaster`). Rota nova entra
//                 aqui por padrão: abrir para organização é decisão explícita,
//                 movendo-a para o orgRouter com a guarda certa.
//
// O Express tenta o orgRouter primeiro; o que não casar ali cai no adminRouter.
const orgRouter = Router();
orgRouter.use(adminMiddleware as any);

const doCorpo = (req: any) => req.body?.app_id;
const daQuery = (req: any) => req.query?.app_id;
const doParam = (req: any) => req.params?.id;

// -- Quem sou eu (a tela monta os botões por isto; quem decide é a API)
orgRouter.get('/eu', OrganizacaoController.eu as any);

// -- Apps (a lista sai filtrada no controller) e categorias (idem)
orgRouter.get('/apps', AppController.getAllApps as any);
orgRouter.get('/apps/:id', exigirAppNoEscopo(doParam) as any, AppController.getById as any);
orgRouter.get('/categorias', CategoriaController.listar as any);

// -- Usuários dos apps da organização
orgRouter.get('/apps/:id/users', exigirAppNoEscopo(doParam) as any, UserController.getUsersByApp as any);
orgRouter.post('/users', exigirAppNoEscopo(doCorpo) as any, UserController.addUser as any);
orgRouter.post('/users/operador', exigirAppNoEscopo(doCorpo) as any, UserController.criarOperador as any);
orgRouter.put('/users/:id', exigirUsuarioNoEscopo('id') as any, UserController.updateUser as any);
orgRouter.patch('/users/:id/status', exigirUsuarioNoEscopo('id') as any, UserController.toggleUserStatus as any);
orgRouter.post('/users/:id/reset-password', exigirUsuarioNoEscopo('id') as any, UserController.resetPassword as any);
// Perdeu o celular E os códigos de recuperação: sem isto a conta ficava morta,
// porque /auth/2fa/disable recusa desativar um 2FA obrigatório.
orgRouter.post('/users/:id/reset-2fa', exigirUsuarioNoEscopo('id') as any, UserController.resetTwoFactor as any);
orgRouter.delete('/users/:id', exigirUsuarioNoEscopo('id') as any, UserController.removeUser as any);

// -- Lista negra do login (28/10/2026) e aparelhos (04/11/2026). Para o admin
// de organização o `app_id` do corpo/query é obrigatório: é ele que o serviço
// usa para amarrar a linha ao app.
orgRouter.get('/apps/:id/bloqueios', exigirAppNoEscopo(doParam) as any, BloqueioController.listar as any);
orgRouter.post('/bloqueios/:id/liberar', exigirAppNoEscopo(doCorpo) as any, BloqueioController.liberar as any);
orgRouter.delete('/bloqueios/:id', exigirAppNoEscopo(daQuery) as any, BloqueioController.excluir as any);
orgRouter.get('/apps/:id/aparelhos', exigirAppNoEscopo(doParam) as any, AparelhoController.listar as any);
orgRouter.post('/aparelhos/:usuarioId/liberar', exigirAppNoEscopo(doCorpo) as any, AparelhoController.liberar as any);

// -- Admins da organização: o botão "Convidar admin"
orgRouter.get('/organizacoes/:categoriaId/admins', exigirOrganizacaoNoEscopo('categoriaId') as any, OrganizacaoController.listarAdmins as any);
orgRouter.post('/organizacoes/:categoriaId/admins', exigirOrganizacaoNoEscopo('categoriaId') as any, OrganizacaoController.convidar as any);
orgRouter.post('/organizacoes/:categoriaId/admins/:usuarioId/reset-senha', exigirOrganizacaoNoEscopo('categoriaId') as any, OrganizacaoController.resetarSenha as any);
orgRouter.delete('/organizacoes/:categoriaId/admins/:usuarioId', exigirOrganizacaoNoEscopo('categoriaId') as any, OrganizacaoController.remover as any);

mainRouter.use('/admin', orgRouter);

// ------------------------------------------------------------------
// Só o master
// ------------------------------------------------------------------
const adminRouter = Router();
adminRouter.use(adminMiddleware as any);
adminRouter.use(soMaster as any);

// -- Digital do master (db/020): só o master cadastra, lista e tira.
adminRouter.post('/master-passkeys/registro/opcoes', MasterPasskeyController.opcoesDeRegistro as any);
adminRouter.post('/master-passkeys/registro/verificar', MasterPasskeyController.verificarRegistro as any);
adminRouter.get('/master-passkeys', MasterPasskeyController.listar as any);
adminRouter.delete('/master-passkeys/:id', MasterPasskeyController.revogar as any);

// -- Apps
adminRouter.post('/apps', AppController.createApp as any);
adminRouter.put('/apps/:id', AppController.updateApp as any);
adminRouter.patch('/apps/:id/status', AppController.toggleAppStatus as any);
// Sobe/desce uma posição dentro da categoria: `{ direcao: 'cima' | 'baixo' }`.
adminRouter.patch('/apps/:id/mover', AppController.moverApp as any);
adminRouter.delete('/apps/:id', AppController.deleteApp as any);

// -- Categorias (grupos de apps do painel; db/005_categorias_ordem.sql)
adminRouter.post('/categorias', CategoriaController.criar as any);
adminRouter.put('/categorias/:id', CategoriaController.renomear as any);
adminRouter.patch('/categorias/:id/mover', CategoriaController.mover as any);
adminRouter.delete('/categorias/:id', CategoriaController.apagar as any);

// -- Todos os usuários de todos os apps
adminRouter.get('/users', UserController.getAllUsers as any);

// -- Venda por assinatura (10/11/2026; db/009_assinaturas_afiliados.sql):
// preço do app, afiliados, assinantes e comissões.
adminRouter.get('/apps/:id/vendas', VendaAdminController.painel as any);
adminRouter.put('/apps/:id/plano', VendaAdminController.salvarPlano as any);
adminRouter.post('/apps/:id/afiliados', VendaAdminController.criarAfiliado as any);
adminRouter.put('/afiliados/:id', VendaAdminController.atualizarAfiliado as any);
adminRouter.delete('/afiliados/:id', VendaAdminController.apagarAfiliado as any);
adminRouter.post('/afiliados/:id/pagar-comissoes', VendaAdminController.pagarComissoes as any);
adminRouter.post('/assinaturas/conferir', VendaAdminController.conferir as any);
adminRouter.post('/assinaturas/:id/cancelar', VendaAdminController.cancelar as any);
adminRouter.post('/assinaturas/:id/reenviar-acesso', VendaAdminController.reenviarAcesso as any);

mainRouter.use('/admin', adminRouter);

// ==========================================
// 2b. Cofre de senhas (db/013 e db/014, 19/11/2026)
// ==========================================
// Fora do /admin: além do master, usam o cofre os usuários de app com cofre
// liberado e as máquinas aprovadas do CLI hub-pass. O `cofreAuth` decide o dono;
// tudo o que entra e sai aqui é texto cifrado no navegador/CLI.
const cofreRouter = Router();
// db/017: o pedido de uma máquina nova é público (ela ainda não tem credencial) e não abre nada sozinho.
cofreRouter.post('/aparelhos/pedidos', rateLimitPasskey as any, CofreController.pedirAparelho as any);
cofreRouter.use(cofreAuth as any);
cofreRouter.get('/', CofreController.estado as any);
cofreRouter.get('/conta-do-app', CofreController.contaDoApp as any);
cofreRouter.post('/conta', CofreController.criarConta as any);
cofreRouter.put('/conta', CofreController.trocarSenha as any);
cofreRouter.put('/cofres/:id', CofreController.salvarCofre as any);
// Cofre compartilhado (db/022). Papel conferido no serviço, em cada rota; a máquina do CLI é recusada em todas.
cofreRouter.put('/pessoa', CofreController.salvarPessoa as any);
cofreRouter.get('/pessoas', rateLimitCofreConviteDono as any, rateLimitCofreConviteIp as any, CofreController.buscarPessoa as any);
cofreRouter.post('/cofres/:id/membros', rateLimitCofreConviteDono as any, rateLimitCofreConviteIp as any, CofreController.convidar as any);
cofreRouter.delete('/cofres/:id/membros/eu', CofreController.sairDoCofre as any);
cofreRouter.put('/cofres/:id/membros/:membro', CofreController.ajustarMembro as any);
cofreRouter.delete('/cofres/:id/membros/:membro', CofreController.removerMembro as any);
cofreRouter.post('/cofres/:id/girar-chave', CofreController.girarChave as any);
cofreRouter.delete('/cofres/:id', CofreController.apagarCofre as any);
cofreRouter.put('/itens/:id', CofreController.salvarItem as any);
cofreRouter.delete('/itens/:id', CofreController.apagarItem as any);
cofreRouter.get('/aparelhos', CofreController.listarAparelhos as any);
cofreRouter.post('/aparelhos', CofreController.registrarAparelho as any);
cofreRouter.delete('/aparelhos/:id', CofreController.revogarAparelho as any);
// Aprovar a máquina pelo navegador, com o cofre aberto (digital ou palavra-passe), e escolher os cofres dela.
cofreRouter.get('/aparelhos/pedidos/:codigo', CofreController.pedidoDeAparelho as any);
cofreRouter.post('/aparelhos/pedidos/:id/aprovar', CofreController.aprovarPedido as any);
cofreRouter.put('/aparelhos/:id/acesso', CofreController.alterarAcesso as any);
// Digital que abre o cofre (db/015): passkey com PRF; o segredo dela nunca vem para cá.
cofreRouter.get('/digitais', CofreController.listarDigitais as any);
cofreRouter.post('/digitais', CofreController.registrarDigital as any);
cofreRouter.delete('/digitais/:id', CofreController.revogarDigital as any);
cofreRouter.post('/digitais/:id/uso', CofreController.usouDigital as any);
// Entradas pelo cofre (db/016): o cofre aberto guarda a chave de uma conta de app e assina a entrada.
cofreRouter.post('/entradas/pedido', EntradaController.pedido as any);
cofreRouter.post('/entradas', EntradaController.registrar as any);
cofreRouter.delete('/entradas/:id', EntradaController.revogarPeloCofre as any);

mainRouter.use('/cofre', cofreRouter);

// ==========================================
// 3. Venda pública (página de venda do app e aviso do Mercado Pago)
// ==========================================
// Sem sessão de propósito: quem compra ainda não tem conta. O que protege é o
// limite por IP e o fato de nada aqui confiar no que o visitante manda — o
// preço vem do banco e o estado da assinatura vem do Mercado Pago.
const vendaRouter = Router();
vendaRouter.get('/apps/:appId/plano', rateLimitVendaLeitura as any, VendaPublicaController.plano as any);
vendaRouter.post('/apps/:appId/assinar', rateLimitCheckout as any, VendaPublicaController.assinar as any);
// Cadastro de afiliado pela página de venda (db/011): mesmo limite curto do checkout.
vendaRouter.post('/apps/:appId/afiliados', rateLimitCheckout as any, VendaPublicaController.cadastrarAfiliado as any);
vendaRouter.get('/assinaturas/:ref', rateLimitVendaLeitura as any, VendaPublicaController.confirmar as any);
vendaRouter.all('/webhook-mp', VendaPublicaController.webhookMp as any);

mainRouter.use('/venda', vendaRouter);
