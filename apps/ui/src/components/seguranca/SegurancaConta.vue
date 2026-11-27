<script setup lang="ts">
/**
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ ARQUIVO SINCRONIZADO — não edite a cópia dentro de um app.            │
 * │ Fonte: LoginHUB/packages/auth-kit/src/SegurancaConta.vue              │
 * │ Propague com: LoginHUB/scripts/sync-auth-kit.sh                        │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * "Segurança da conta" (27/11/2026): o cartão que cada app põe nas configurações. A pessoa entra pelo código
 * de e-mail e, quando quiser, ativa a verificação em duas etapas por aplicativo autenticador, como nos apps
 * de mercado:
 *
 *   1. "Ativar com app autenticador" → o hub manda um código ao e-mail (prova de que é a dona da conta);
 *   2. QR Code (ou a chave em texto) para o Google Authenticator e afins; a pessoa digita o primeiro código;
 *   3. 10 códigos de recuperação, mostrados UMA vez (copiar / baixar);
 *   4. Ativo. Dali em diante o login pede o código do app. "Desativar" aceita o código do app, um código de
 *      recuperação ou — se perdeu o celular — um código novo enviado ao e-mail.
 *
 * É independente do app: recebe o cliente do hub (`createHubAuth(...)`) por prop, não importa store nem estilo
 * do app (as cores vêm de variáveis CSS com padrão próprio) e só depende do pacote `qrcode`, que os apps da
 * suíte já usam no enrolamento do convite. Conta de CPF (Sul) tem o app como exigência e não mostra o botão.
 */
import { computed, onMounted, ref } from 'vue';

interface HubLike {
  twoFactor: {
    status(): Promise<{
      ativo: boolean;
      obrigatorio?: boolean;
      backupCodesRestantes: number;
      podeDesativar?: boolean;
      contaDeCpf?: boolean;
    }>;
    pedirCodigoEmail(): Promise<{ challengeId: string; expiresIn: number }>;
    setup(token?: string, prova?: { challengeId: string; codigoEmail: string }): Promise<{ secret: string; otpauthUri: string }>;
    verifySetup(codigo: string): Promise<{ backupCodes: string[] }>;
    disable(prova: { codigo?: string; backupCode?: string } | { challengeId: string; codigoEmail: string }): Promise<unknown>;
    regenerateBackupCodes(codigo: string): Promise<{ backupCodes: string[] }>;
  };
}

const props = defineProps<{ hub: HubLike; titulo?: string }>();
const emit = defineEmits<{ (e: 'mudou'): void }>();

type Etapa = 'carregando' | 'inicio' | 'email' | 'qr' | 'codigos' | 'desativar' | 'novosCodigos';

const etapa = ref<Etapa>('carregando');
const status = ref<{ ativo: boolean; obrigatorio?: boolean; backupCodesRestantes: number; podeDesativar?: boolean; contaDeCpf?: boolean } | null>(null);
const erro = ref('');
const ocupado = ref(false);
const challengeId = ref('');
const codigoEmail = ref('');
const dados = ref<{ secret: string; otpauthUri: string } | null>(null);
const qr = ref('');
const codigoApp = ref('');
const codigos = ref<string[]>([]);
const copiado = ref(false);
const perdiCelular = ref(false);
const enviado = ref(false);

const ativo = computed(() => !!status.value?.ativo);

function traduzir(e: unknown): string {
  const cod = (e as { code?: string })?.code;
  const msg = (e as Error)?.message;
  if (cod === 'CODIGO_INVALIDO') return 'Código inválido ou expirado. Confira e tente de novo.';
  if (cod === 'MUITAS_TENTATIVAS') return msg || 'Muitas tentativas. Aguarde alguns minutos.';
  if (cod === 'CODIGO_EMAIL_AUSENTE') return 'Confirme o código enviado ao seu e-mail.';
  if (cod === 'OBRIGATORIO') return 'A verificação em duas etapas é exigida nesta conta e não pode ser desativada por você.';
  if (cod === 'JA_ATIVO') return 'O aplicativo autenticador já está ativo.';
  if (cod === 'REDE') return 'Sem conexão com o servidor de login.';
  return msg || 'Não foi possível concluir. Tente de novo.';
}

async function carregar() {
  erro.value = '';
  try {
    status.value = await props.hub.twoFactor.status();
    etapa.value = 'inicio';
  } catch (e) {
    erro.value = traduzir(e);
    etapa.value = 'inicio';
  }
}
onMounted(carregar);

async function pedirCodigoEmail() {
  ocupado.value = true;
  erro.value = '';
  try {
    challengeId.value = (await props.hub.twoFactor.pedirCodigoEmail()).challengeId;
    codigoEmail.value = '';
    enviado.value = true;
  } catch (e) {
    erro.value = traduzir(e);
  } finally {
    ocupado.value = false;
  }
}

async function comecarAtivacao() {
  etapa.value = 'email';
  enviado.value = false;
  await pedirCodigoEmail();
}

async function gerarQr(uri: string): Promise<string> {
  try {
    const { default: QRCode } = await import('qrcode');
    return await QRCode.toDataURL(uri, { width: 200, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#121215', light: '#ffffff' } });
  } catch {
    return ''; // sem o pacote ou sem QR: a chave em texto resolve
  }
}

async function confirmarEmail() {
  if (ocupado.value) return;
  ocupado.value = true;
  erro.value = '';
  try {
    dados.value = await props.hub.twoFactor.setup(undefined, { challengeId: challengeId.value, codigoEmail: codigoEmail.value.replace(/\s+/g, '') });
    qr.value = await gerarQr(dados.value.otpauthUri);
    codigoApp.value = '';
    etapa.value = 'qr';
  } catch (e) {
    erro.value = traduzir(e);
  } finally {
    ocupado.value = false;
  }
}

async function confirmarApp() {
  if (ocupado.value) return;
  ocupado.value = true;
  erro.value = '';
  try {
    codigos.value = (await props.hub.twoFactor.verifySetup(codigoApp.value.replace(/\s+/g, ''))).backupCodes;
    etapa.value = 'codigos';
  } catch (e) {
    erro.value = traduzir(e);
  } finally {
    ocupado.value = false;
  }
}

function copiar() {
  void navigator.clipboard.writeText(codigos.value.join('\n'));
  copiado.value = true;
}
function baixar() {
  const blob = new Blob([`Códigos de recuperação (uso único)\n\n${codigos.value.join('\n')}\n`], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'codigos-de-recuperacao.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function concluir() {
  codigos.value = [];
  dados.value = null;
  qr.value = '';
  copiado.value = false;
  await carregar();
  emit('mudou');
}

function abrirDesativar() {
  etapa.value = 'desativar';
  perdiCelular.value = false;
  enviado.value = false;
  codigoApp.value = '';
  codigoEmail.value = '';
  erro.value = '';
}
async function escolherPerdi() {
  perdiCelular.value = true;
  await pedirCodigoEmail();
}
async function desativar() {
  if (ocupado.value) return;
  ocupado.value = true;
  erro.value = '';
  try {
    const limpo = (perdiCelular.value ? codigoEmail.value : codigoApp.value).replace(/\s+/g, '');
    if (perdiCelular.value) await props.hub.twoFactor.disable({ challengeId: challengeId.value, codigoEmail: limpo });
    else if (limpo.length > 6) await props.hub.twoFactor.disable({ backupCode: limpo });
    else await props.hub.twoFactor.disable({ codigo: limpo });
    await carregar();
    emit('mudou');
  } catch (e) {
    erro.value = traduzir(e);
  } finally {
    ocupado.value = false;
  }
}

async function gerarNovos() {
  if (ocupado.value) return;
  ocupado.value = true;
  erro.value = '';
  try {
    codigos.value = (await props.hub.twoFactor.regenerateBackupCodes(codigoApp.value.replace(/\s+/g, ''))).backupCodes;
    etapa.value = 'codigos';
  } catch (e) {
    erro.value = traduzir(e);
  } finally {
    ocupado.value = false;
  }
}
</script>

<template>
  <section class="sc">
    <header class="sc-topo">
      <h3>{{ titulo || 'Verificação em duas etapas' }}</h3>
      <span v-if="etapa !== 'carregando' && status" class="sc-selo" :class="{ on: ativo }">
        {{ ativo ? 'App autenticador ativo' : 'Código por e-mail' }}
      </span>
    </header>

    <p v-if="etapa === 'carregando'" class="sc-nota">Carregando…</p>

    <!-- INÍCIO -->
    <template v-else-if="etapa === 'inicio'">
      <template v-if="status?.contaDeCpf">
        <p class="sc-nota">O aplicativo autenticador é exigido na sua conta e já está ativo.</p>
      </template>
      <template v-else-if="!ativo">
        <p class="sc-nota">
          Hoje, a cada acesso, enviamos um código de 6 dígitos para o seu e-mail. Para mais segurança, você pode usar um
          aplicativo autenticador (Google Authenticator, Authy, 1Password…): o código passa a vir do seu celular.
        </p>
        <button type="button" class="sc-btn" @click="comecarAtivacao">Ativar com app autenticador</button>
      </template>
      <template v-else>
        <p class="sc-nota">
          Seus acessos pedem o código do aplicativo autenticador.
          Códigos de recuperação disponíveis: <strong>{{ status?.backupCodesRestantes ?? 0 }}</strong>.
        </p>
        <div class="sc-acoes">
          <button type="button" class="sc-btn sc-sec" @click="etapa = 'novosCodigos'; codigoApp = ''; erro = ''">Gerar novos códigos de recuperação</button>
          <button v-if="status?.podeDesativar" type="button" class="sc-btn sc-perigo" @click="abrirDesativar">Desativar</button>
        </div>
        <p v-if="!status?.podeDesativar" class="sc-nota">Esta verificação é exigida pela sua conta e não pode ser desativada por aqui.</p>
      </template>
    </template>

    <!-- ATIVAR 1: código do e-mail -->
    <form v-else-if="etapa === 'email'" class="sc-form" @submit.prevent="confirmarEmail">
      <p class="sc-nota">
        Para ativar, confirme que é você: enviamos um código de 6 dígitos para o seu e-mail.
      </p>
      <input v-model="codigoEmail" class="sc-input" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" required />
      <div class="sc-acoes">
        <button type="submit" class="sc-btn" :disabled="ocupado || codigoEmail.replace(/\s/g, '').length !== 6">Continuar</button>
        <button type="button" class="sc-link" :disabled="ocupado" @click="pedirCodigoEmail">Reenviar código</button>
        <button type="button" class="sc-link" @click="etapa = 'inicio'; erro = ''">Cancelar</button>
      </div>
    </form>

    <!-- ATIVAR 2: QR + primeiro código -->
    <form v-else-if="etapa === 'qr'" class="sc-form" @submit.prevent="confirmarApp">
      <ol class="sc-passos">
        <li>Abra o aplicativo autenticador no celular e adicione uma conta.</li>
        <li>Escaneie o QR Code (ou digite a chave abaixo).</li>
        <li>Digite o código de 6 dígitos que o aplicativo mostrar.</li>
      </ol>
      <img v-if="qr" :src="qr" alt="QR Code do aplicativo autenticador" class="sc-qr" width="200" height="200" />
      <p class="sc-nota">Chave manual: <code class="sc-chave">{{ dados?.secret }}</code></p>
      <input v-model="codigoApp" class="sc-input" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" required />
      <div class="sc-acoes">
        <button type="submit" class="sc-btn" :disabled="ocupado || codigoApp.replace(/\s/g, '').length !== 6">Ativar</button>
        <button type="button" class="sc-link" @click="etapa = 'inicio'; erro = ''">Cancelar</button>
      </div>
    </form>

    <!-- CÓDIGOS DE RECUPERAÇÃO -->
    <div v-else-if="etapa === 'codigos'" class="sc-form">
      <p class="sc-nota"><strong>Guarde estes códigos agora.</strong> Cada um vale uma vez e serve se você perder o celular. Eles não aparecem de novo.</p>
      <ul class="sc-codigos">
        <li v-for="c in codigos" :key="c"><code>{{ c }}</code></li>
      </ul>
      <div class="sc-acoes">
        <button type="button" class="sc-btn sc-sec" @click="copiar">{{ copiado ? 'Copiado ✓' : 'Copiar' }}</button>
        <button type="button" class="sc-btn sc-sec" @click="baixar">Baixar .txt</button>
        <button type="button" class="sc-btn" @click="concluir">Já guardei, concluir</button>
      </div>
    </div>

    <!-- NOVOS CÓDIGOS -->
    <form v-else-if="etapa === 'novosCodigos'" class="sc-form" @submit.prevent="gerarNovos">
      <p class="sc-nota">Digite o código atual do aplicativo autenticador. Os códigos de recuperação anteriores deixam de valer.</p>
      <input v-model="codigoApp" class="sc-input" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" required />
      <div class="sc-acoes">
        <button type="submit" class="sc-btn" :disabled="ocupado || codigoApp.replace(/\s/g, '').length !== 6">Gerar novos códigos</button>
        <button type="button" class="sc-link" @click="etapa = 'inicio'; erro = ''">Cancelar</button>
      </div>
    </form>

    <!-- DESATIVAR -->
    <form v-else-if="etapa === 'desativar'" class="sc-form" @submit.prevent="desativar">
      <template v-if="!perdiCelular">
        <p class="sc-nota">Para desativar, digite o código atual do aplicativo (ou um código de recuperação). Depois disso, os acessos voltam a pedir o código enviado ao seu e-mail.</p>
        <input v-model="codigoApp" class="sc-input" autocomplete="one-time-code" maxlength="16" placeholder="000000" required />
        <button type="button" class="sc-link" :disabled="ocupado" @click="escolherPerdi">Perdi o celular — usar um código enviado ao e-mail</button>
      </template>
      <template v-else>
        <p class="sc-nota">Enviamos um código de 6 dígitos para o seu e-mail. Digite-o para desativar o aplicativo autenticador.</p>
        <input v-model="codigoEmail" class="sc-input" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" required />
        <button type="button" class="sc-link" :disabled="ocupado" @click="pedirCodigoEmail">Reenviar código</button>
      </template>
      <div class="sc-acoes">
        <button type="submit" class="sc-btn sc-perigo" :disabled="ocupado || !(perdiCelular ? codigoEmail : codigoApp)">Desativar</button>
        <button type="button" class="sc-link" @click="etapa = 'inicio'; erro = ''">Cancelar</button>
      </div>
    </form>

    <p v-if="enviado && (etapa === 'email' || (etapa === 'desativar' && perdiCelular)) && !erro" class="sc-ok">Código enviado para o seu e-mail.</p>
    <p v-if="erro" class="sc-erro" role="alert">{{ erro }}</p>
  </section>
</template>

<style scoped>
.sc {
  --sc-fundo: var(--surface, var(--card-bg, #ffffff));
  --sc-texto: var(--text, var(--text-primary, #1b1b1f));
  --sc-suave: var(--text-secondary, #5d5d66);
  --sc-borda: var(--border, rgba(120, 120, 130, 0.28));
  --sc-cor: var(--accent, var(--brand-1, #2563eb));
  background: var(--sc-fundo);
  color: var(--sc-texto);
  border: 1px solid var(--sc-borda);
  border-radius: 14px;
  padding: 18px;
  max-width: 560px;
}
@media (prefers-color-scheme: dark) {
  .sc { --sc-fundo: var(--surface, var(--card-bg, #1c1c21)); --sc-texto: var(--text, var(--text-primary, #f2f2f5)); --sc-suave: var(--text-secondary, #a4a4ad); }
}
.sc-topo { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.sc-topo h3 { margin: 0; font-size: 16px; font-weight: 700; }
.sc-selo { font-size: 12px; padding: 3px 10px; border-radius: 999px; background: rgba(120, 120, 130, 0.18); color: var(--sc-suave); }
.sc-selo.on { background: rgba(22, 163, 74, 0.16); color: #16a34a; }
.sc-nota { margin: 0 0 12px; font-size: 14px; line-height: 1.55; color: var(--sc-suave); }
.sc-form { display: flex; flex-direction: column; gap: 12px; }
.sc-passos { margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: var(--sc-suave); }
.sc-qr { align-self: center; border-radius: 10px; background: #fff; padding: 6px; }
.sc-chave { word-break: break-all; font-size: 13px; color: var(--sc-texto); }
.sc-input { font: inherit; font-size: 18px; letter-spacing: 4px; text-align: center; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--sc-borda); background: transparent; color: var(--sc-texto); }
.sc-input:focus { outline: 2px solid var(--sc-cor); outline-offset: 1px; }
.sc-acoes { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.sc-btn { font: inherit; font-weight: 600; font-size: 14px; padding: 10px 16px; border-radius: 10px; border: 0; cursor: pointer; background: var(--sc-cor); color: #fff; }
.sc-btn:disabled { opacity: 0.5; cursor: default; }
.sc-sec { background: rgba(120, 120, 130, 0.18); color: var(--sc-texto); }
.sc-perigo { background: #dc2626; color: #fff; }
.sc-link { font: inherit; font-size: 13px; background: none; border: 0; padding: 4px 2px; cursor: pointer; color: var(--sc-cor); text-align: left; }
.sc-link:disabled { opacity: 0.5; cursor: default; }
.sc-codigos { list-style: none; margin: 0; padding: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px 14px; border-radius: 10px; background: rgba(120, 120, 130, 0.12); }
.sc-codigos code { font-size: 14px; }
.sc-ok { margin: 12px 0 0; font-size: 13px; color: #16a34a; }
.sc-erro { margin: 12px 0 0; font-size: 13px; color: #dc2626; }
</style>
