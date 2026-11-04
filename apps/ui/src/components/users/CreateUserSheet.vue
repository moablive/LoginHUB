<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import axios from 'axios';
import {
  ArrowLeftIcon,
  BriefcaseIcon,
  EnvelopeIcon,
  InformationCircleIcon,
  PaperAirplaneIcon,
  ShieldCheckIcon,
} from '@heroicons/vue/24/outline';
import { userApi } from '@loginhub/api-client';
import type { UserRole } from '@loginhub/schema';
import { InviteEmailTemplate, MoneyAppInviteEmail } from '@/templates/emails';
import { getProvisionedApp, hubRolesDoApp, type ProvisionField } from '@/config/provisioning';
import { masks } from '@/utils/masks';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';

const ROLE_OPTIONS: { value: Exclude<UserRole, 'master'>; label: string; description: string }[] = [
  { value: 'admin', label: 'Administrador', description: 'Pode gerenciar usuários e configurações do aplicativo.' },
  { value: 'operador', label: 'Operador', description: 'Opera o dia a dia (estoque, tabelas), sem financeiro nem administração.' },
  { value: 'user', label: 'Usuário Padrão', description: 'Acesso comum ao aplicativo.' },
  { value: 'suporte', label: 'Suporte', description: 'Acesso para atendimento e diagnóstico.' },
];

const props = defineProps<{
  aberto: boolean;
  appId: string;
  appName?: string;
  appBotUrl?: string | null;
  appPlatformUrl?: string | null;
  appLogo?: string | null;
}>();

const emit = defineEmits<{
  fechar: [];
  sucesso: [resultado: { email: string; emailSent: boolean; magicLinkToken?: string }];
}>();

type Step = 'form' | 'preview';

/** Valor sentinela do select quando o convite deve criar o cadastro no app. */
const PROVISION_ROLE = '__provision__';

const MAGIC_LINK_PLACEHOLDER = '__MAGIC_LINK__';
const PREVIEW_FAKE_TOKEN = 'preview-token-xyz';

// Apps com provisionamento próprio (ver config/provisioning.ts) invertem o
// fluxo: quem cria o usuário aqui no hub é o endpoint do próprio app, junto
// com o cadastro dele — sem isso a pessoa ficaria com login e sem cadastro.
const provisioned = computed(() => getProvisionedApp(props.appId));
const defaultRole = computed(() => (provisioned.value ? PROVISION_ROLE : 'user'));
// Só os papéis que fazem sentido neste app, com a descrição no contexto dele.
const roleOptions = computed(() => hubRolesDoApp(provisioned.value, ROLE_OPTIONS));

const step = ref<Step>('form');
const formData = ref({ nome: '', email: '', role: defaultRole.value });
const extraData = ref<Record<string, string>>({});
const fieldErrors = ref<Record<string, string>>({});
const isLoading = ref(false);
const error = ref<string | null>(null);
// Opções dos campos remote-select (ex.: lista de artistas do label), por nome do campo.
// O `item` cru vai junto porque o `fillsBase` copia campos dele (nome, e-mail)
// para o convite — o par value/label não basta.
const remoteOptions = ref<Record<string, { value: string; label: string; item: Record<string, unknown> }[]>>({});
// Falha ao carregar um remote-select, por campo. Antes só ia para o console, e
// um select vazio era indistinguível de "não há ninguém sem login" — foi assim
// que a URL morta da Sul Alimentos passou despercebida.
const remoteErrors = ref<Record<string, string>>({});
// Campos travados porque vieram do cadastro escolhido no select.
const baseTravada = ref(false);

const blankExtras = () =>
  Object.fromEntries((provisioned.value?.fields ?? []).map((f) => [f.name, f.defaultValue ?? '']));

// Carrega os campos remote-select quando a folha abre, com o Bearer master.
// Filtra itens que já têm login e mapeia para { value, label }.
function carregarRemotos() {
  const prov = provisioned.value;
  if (!prov) return;
  const token = localStorage.getItem('awl_token');
  for (const field of prov.fields) {
    if (field.type !== 'remote-select' || !field.source) continue;
    const source = field.source;
    void (async () => {
      try {
        const { data } = await axios.get(source, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          timeout: 20000,
        });
        const arr: Array<Record<string, unknown>> = Array.isArray(data)
          ? data
          : ((data?.artists ?? data?.data ?? []) as Array<Record<string, unknown>>);
        const opts = arr
          .filter((it) => !field.excludeWhenField || !it[field.excludeWhenField])
          .map((it) => ({
            value: String(it[field.optionValue || 'id'] ?? ''),
            label: String(it[field.optionLabel || 'name'] ?? it[field.optionValue || 'id'] ?? ''),
            item: it,
          }));
        remoteOptions.value = { ...remoteOptions.value, [field.name]: opts };
        remoteErrors.value = { ...remoteErrors.value, [field.name]: '' };
      } catch (err) {
        console.error('[CreateUserSheet] falha ao carregar opções de', field.name, err);
        remoteOptions.value = { ...remoteOptions.value, [field.name]: [] };
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        remoteErrors.value = {
          ...remoteErrors.value,
          [field.name]: status
            ? `Não foi possível carregar a lista (erro ${status}). Só o cadastro novo está disponível.`
            : `Não foi possível falar com ${props.appName || 'o aplicativo'} para carregar a lista. ` +
              `Verifique se ele está no ar — só o cadastro novo está disponível.`,
        };
      }
    })();
  }
}

watch(
  () => props.aberto,
  (aberto) => {
    if (!aberto) return;
    formData.value = { nome: '', email: '', role: defaultRole.value };
    extraData.value = blankExtras();
    fieldErrors.value = {};
    step.value = 'form';
    error.value = null;
    remoteErrors.value = {};
    baseTravada.value = false;
    carregarRemotos();
  },
  { immediate: true },
);

// Só o papel provisionado passa pelo endpoint do app. Os demais níveis
// (admin, suporte...) continuam no fluxo normal do LoginHUB — sem isso não
// haveria como convidar um administrador para um app provisionado.
const provisionMode = computed(() => !!provisioned.value && formData.value.role === PROVISION_ROLE);

const isMoneyApp = computed(() => props.appName?.toLowerCase().includes('money'));

function montarEmail(token: string): string {
  // Só inclui o botão "Acessar Sistema" se o app tem URL de plataforma cadastrada.
  const loginUrl = props.appPlatformUrl || undefined;
  return isMoneyApp.value
    ? MoneyAppInviteEmail({ email: formData.value.email, magicLinkToken: token, loginUrl, botUrl: props.appBotUrl, appLogo: props.appLogo })
    : InviteEmailTemplate({
        email: formData.value.email,
        appName: props.appName || 'nossa plataforma',
        magicLinkToken: token,
        loginUrl,
        botUrl: props.appBotUrl,
        appLogo: props.appLogo,
      });
}

// HTML para o preview (com placeholder amigável)
const previewHtml = computed(() => (formData.value.email ? montarEmail(PREVIEW_FAKE_TOKEN) : ''));

function limparErro(campo: string) {
  if (fieldErrors.value[campo]) fieldErrors.value = { ...fieldErrors.value, [campo]: '' };
}

function setBase(campo: 'nome' | 'email', valor: string) {
  formData.value[campo] = valor;
  // O app responde os erros com o nome do campo dele ("name"), não "nome".
  limparErro(campo === 'nome' ? 'name' : campo);
}

function setExtra(field: ProvisionField, valor: string) {
  extraData.value = { ...extraData.value, [field.name]: field.mask ? masks[field.mask](valor) : valor };
  limparErro(field.name);
}

// Campo condicional: só aparece quando a condição bate.
const visivel = (f: ProvisionField) => !f.showWhen || extraData.value[f.showWhen.field] === f.showWhen.equals;

// Escolher um item existente traz nome e e-mail do cadastro dele; voltar para
// "criar novo" (ou para vazio) devolve os dois campos ao admin, em branco.
function escolher(field: ProvisionField, value: string) {
  setExtra(field, value);
  if (!field.fillsBase) return;

  const alvo = (remoteOptions.value[field.name] ?? []).find((o) => o.value === value);
  if (!alvo) {
    // Só limpa o que este select tinha preenchido. Quem digitou nome e e-mail
    // antes de escolher "criar novo" não pode ver os dois campos esvaziarem
    // na sua frente.
    if (baseTravada.value) formData.value = { ...formData.value, nome: '', email: '' };
    baseTravada.value = false;
    return;
  }
  const de = (chave?: string) => (chave ? String(alvo.item[chave] ?? '') : undefined);
  baseTravada.value = true;
  formData.value = {
    ...formData.value,
    nome: de(field.fillsBase.nome) ?? formData.value.nome,
    email: de(field.fillsBase.email) ?? formData.value.email,
  };
  fieldErrors.value = { ...fieldErrors.value, name: '', email: '' };
}

const selecionados = (field: ProvisionField) =>
  String(extraData.value[field.name] ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

function alternarOpcao(field: ProvisionField, value: string) {
  const atual = selecionados(field);
  const next = atual.includes(value) ? atual.filter((v) => v !== value) : [...atual, value];
  setExtra(field, next.join(','));
}

function avancar() {
  if (!formData.value.nome.trim() || !formData.value.email.trim()) {
    error.value = 'Preencha nome e e-mail.';
    return;
  }

  if (provisionMode.value && provisioned.value) {
    const missing = provisioned.value.fields.filter(
      (f) => f.required && visivel(f) && !String(extraData.value[f.name] ?? '').trim(),
    );
    if (missing.length) {
      fieldErrors.value = Object.fromEntries(missing.map((f) => [f.name, 'Campo obrigatório']));
      error.value = `Preencha ${missing.map((f) => f.label).join(', ')}.`;
      return;
    }
    error.value = null;
    // O e-mail é montado e enviado pelo próprio app, então não há o que
    // pré-visualizar aqui — o convite sai direto.
    void enviarProvisionado();
    return;
  }

  error.value = null;
  step.value = 'preview';
}

/**
 * Convite para app com provisionamento: um POST só no endpoint do app, que
 * cria o usuário aqui no LoginHUB (via M2M), grava o cadastro dele e dispara
 * o e-mail com o template do próprio app.
 */
async function enviarProvisionado() {
  const prov = provisioned.value;
  if (!prov) return;
  isLoading.value = true;
  error.value = null;

  try {
    // Só campos com máscara perdem a formatação. Passar o número da comissão
    // por `unmask` transformaria "7.5" em "75".
    const extras = Object.fromEntries(
      prov.fields.map((field) => {
        const raw = String(extraData.value[field.name] ?? '').trim();
        return [field.name, field.mask ? masks.unmask(raw) : raw];
      }),
    );

    const payload = prov.buildPayload({ nome: formData.value.nome.trim(), email: formData.value.email.trim() }, extras);

    const token = localStorage.getItem('awl_token');
    const { data } = await axios.post(prov.endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 20000,
    });

    emit('sucesso', {
      email: formData.value.email.trim(),
      emailSent: data?.invite?.emailSent ?? true,
      magicLinkToken: data?.invite?.magicLinkToken ?? undefined,
    });
    emit('fechar');
  } catch (err: unknown) {
    console.error(err);
    const response = axios.isAxiosError(err) ? err.response : undefined;
    const body = response?.data as { error?: string; fields?: Record<string, unknown> } | undefined;

    if (body?.fields) {
      fieldErrors.value = Object.fromEntries(
        Object.entries(body.fields)
          .filter(([, v]) => v === true || (typeof v === 'string' && v))
          .map(([k, v]) => [k, v === true ? 'Já cadastrado' : String(v)]),
      );
    }

    if (body?.error) {
      error.value = body.error;
    } else if (!response) {
      error.value = `Não foi possível falar com ${props.appName || 'o aplicativo'}. Verifique se o sistema está no ar e tente de novo.`;
    } else if (response.status === 401 || response.status === 403) {
      // Sessão master aberta antes da correção do login não tem token no
      // localStorage; só um logout/login novo passa a guardá-lo.
      error.value =
        `Sua sessão não foi aceita por ${props.appName || 'este aplicativo'}. ` +
        `Saia e entre de novo no painel para renovar o acesso, e repita o convite.`;
    } else {
      error.value = 'Ocorreu um erro ao convidar o usuário.';
    }
  } finally {
    isLoading.value = false;
  }
}

async function enviar() {
  isLoading.value = true;
  error.value = null;

  try {
    // HTML real para envio: link trocado pelo placeholder que o backend substitui
    const emailHtml = montarEmail(MAGIC_LINK_PLACEHOLDER);

    const res = await userApi.create({
      ...formData.value,
      app_id: props.appId,
      role: formData.value.role as UserRole,
      telefone: undefined,
      emailHtml,
    });

    emit('sucesso', { email: formData.value.email, emailSent: res.emailSent, magicLinkToken: res.magicLinkToken });
    emit('fechar');
  } catch (err: unknown) {
    console.error(err);
    if (err instanceof Error) {
      const m = err.message.toLowerCase();
      // 409 = e-mail já cadastrado em outro aplicativo
      if (err.message.includes('409') || m.includes('conflito') || m.includes('já está em uso') || m.includes('duplicate')) {
        error.value = `O e-mail "${formData.value.email}" já está cadastrado em outro aplicativo do sistema. Cada e-mail só pode ser usado uma vez. Use um e-mail diferente.`;
      } else {
        error.value = err.message;
      }
    } else {
      error.value = 'Ocorreu um erro ao convidar o usuário.';
    }
  } finally {
    isLoading.value = false;
  }
}

const titulo = computed(() => {
  if (step.value === 'preview') return 'Pré-visualizar convite';
  if (provisionMode.value && provisioned.value)
    return `Convidar ${provisioned.value.roleLabel}${props.appName ? ` — ${props.appName}` : ''}`;
  return 'Convidar usuário';
});

const descricaoPapel = computed(() =>
  provisionMode.value
    ? provisioned.value?.roleDescription
    : roleOptions.value.find((opt) => opt.value === formData.value.role)?.description,
);
</script>

<template>
  <UiSheet
    :aberto="aberto"
    :titulo="titulo"
    :subtitulo="step === 'form' ? appName : undefined"
    :largura="step === 'preview' ? 'xl' : 'md'"
    :bloqueado="isLoading"
    @fechar="emit('fechar')"
  >
    <template v-if="step === 'form' && appLogo" #cabecalho>
      <img :src="appLogo" :alt="appName || 'Logo'" class="order-first h-10 w-10 shrink-0 rounded-[9px] object-contain ring-1 ring-separator" />
    </template>

    <!-- ETAPA 1: formulário -->
    <form v-if="step === 'form'" id="form-convidar" class="space-y-6" @submit.prevent="avancar">
      <p v-if="error" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ error }}</p>

      <!-- Deixa explícito, antes de qualquer campo, o que a pessoa vira no app. -->
      <div v-if="provisionMode && provisioned" class="flex items-start gap-3 rounded-celula bg-accent/10 p-3">
        <BriefcaseIcon class="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <p class="text-footnote text-label">
          <strong>Este convite cria um {{ provisioned.roleLabel.toLowerCase() }}{{ appName ? ` da ${appName}` : '' }}.</strong>
          {{ provisioned.roleDescription }} O cadastro no {{ appName || 'aplicativo' }} e o acesso aqui no LoginHUB são
          criados de uma vez só, e o e-mail de convite sai com o template do próprio {{ appName || 'aplicativo' }}.
        </p>
      </div>

      <div class="space-y-4">
        <UiTextField
          :model-value="formData.nome"
          rotulo="Nome completo"
          required
          :readonly="baseTravada"
          :class="baseTravada ? '!text-label-2' : ''"
          placeholder="Ex.: João Silva"
          autocomplete="off"
          :erro="fieldErrors.name || null"
          @update:model-value="(v: string) => setBase('nome', v)"
        />

        <div>
          <UiTextField
            :model-value="formData.email"
            rotulo="E-mail de acesso"
            type="email"
            required
            :readonly="baseTravada"
            :class="baseTravada ? '!text-label-2' : ''"
            placeholder="usuario@aplicativo.com"
            autocomplete="off"
            :erro="fieldErrors.email || null"
            @update:model-value="(v: string) => setBase('email', v)"
          />
          <div class="mt-2 flex items-start gap-2 px-1">
            <InformationCircleIcon class="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p class="text-footnote text-label-2">
              <template v-if="baseTravada">
                <strong class="text-label">Nome e e-mail vêm do cadastro escolhido</strong> e não podem ser alterados aqui —
                é por este e-mail que a pessoa encontra o próprio registro depois de entrar. Para corrigi-lo, edite o
                cadastro no {{ appName || 'aplicativo' }} antes de convidar.
              </template>
              <template v-else>
                <strong class="text-label">E-mail único por aplicativo:</strong> o mesmo e-mail pode ser usado em aplicativos
                diferentes, mas não pode se repetir dentro deste aplicativo.
              </template>
            </p>
          </div>
        </div>

        <!-- Campos que o app exige além de nome/e-mail (comissão, artista, módulos...) -->
        <template v-if="provisionMode && provisioned">
          <template v-for="field in provisioned.fields" :key="field.name">
            <div v-if="visivel(field)">
              <!-- remote-select -->
              <template v-if="field.type === 'remote-select'">
                <UiSelect
                  :model-value="extraData[field.name] ?? ''"
                  :rotulo="field.required ? field.label : `${field.label} (opcional)`"
                  :erro="fieldErrors[field.name] || remoteErrors[field.name] || null"
                  :dica="
                    field.name in remoteOptions && (remoteOptions[field.name] ?? []).length === 0
                      ? 'Nenhum cadastro sem login por aqui — só resta criar um novo.'
                      : field.help
                  "
                  @update:model-value="(v: string) => escolher(field, v)"
                >
                  <option value="">Selecione…</option>
                  <option v-for="o in remoteOptions[field.name] ?? []" :key="o.value" :value="o.value">{{ o.label }}</option>
                  <option v-if="field.allowNew" :value="field.newValue || '__new__'">{{ field.newLabel || 'Criar novo' }}</option>
                </UiSelect>
              </template>

              <!-- checkbox-group: lista de marcação, como no Ajustes -->
              <template v-else-if="field.type === 'checkbox-group'">
                <p class="mb-1.5 px-1 text-footnote font-medium text-label-2">
                  {{ field.label }}<span v-if="!field.required" class="font-normal"> (opcional)</span>
                </p>
                <div class="divide-y overflow-hidden rounded-controle bg-fill-2">
                  <label
                    v-for="o in field.options ?? []"
                    :key="o.value"
                    class="flex min-h-toque cursor-pointer items-center gap-3 px-4 py-2 text-body"
                  >
                    <input
                      type="checkbox"
                      class="h-5 w-5 shrink-0 rounded accent-[rgb(var(--acento))]"
                      :checked="selecionados(field).includes(o.value)"
                      @change="alternarOpcao(field, o.value)"
                    />
                    {{ o.label }}
                  </label>
                </div>
                <p v-if="fieldErrors[field.name] || field.help" class="mt-1.5 px-1 text-footnote" :class="fieldErrors[field.name] ? 'text-danger' : 'text-label-2'">
                  {{ fieldErrors[field.name] || field.help }}
                </p>
              </template>

              <!-- text / number (padrão) -->
              <template v-else>
                <p class="mb-1.5 px-1 text-footnote font-medium text-label-2">
                  {{ field.label }}<span v-if="!field.required" class="font-normal"> (opcional)</span>
                </p>
                <div class="relative">
                  <UiTextField
                    :model-value="extraData[field.name] ?? ''"
                    :rotulo="field.label"
                    rotulo-oculto
                    :type="field.type === 'number' ? 'number' : 'text'"
                    :step="field.type === 'number' ? '0.01' : undefined"
                    :inputmode="field.type === 'number' ? 'decimal' : field.mask ? 'numeric' : undefined"
                    :placeholder="field.placeholder"
                    :class="field.suffix ? '!pr-10' : ''"
                    @update:model-value="(v: string) => setExtra(field, v)"
                  />
                  <span v-if="field.suffix" class="pointer-events-none absolute inset-y-0 right-4 flex items-center text-body font-semibold text-label-2">
                    {{ field.suffix }}
                  </span>
                </div>
                <p v-if="fieldErrors[field.name] || field.help" class="mt-1.5 px-1 text-footnote" :class="fieldErrors[field.name] ? 'text-danger' : 'text-label-2'">
                  {{ fieldErrors[field.name] || field.help }}
                </p>
              </template>
            </div>
          </template>
        </template>

        <UiSelect v-model="formData.role" rotulo="Nível de acesso" :dica="descricaoPapel">
          <option v-if="provisioned" :value="PROVISION_ROLE">
            {{ provisioned.roleLabel }}{{ appName ? ` da ${appName}` : '' }}
          </option>
          <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </UiSelect>
      </div>

      <div class="flex items-start gap-3 rounded-celula bg-fill-2 p-3">
        <ShieldCheckIcon class="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <p class="text-subhead font-semibold">Verificação em duas etapas</p>
          <p class="mt-0.5 text-footnote text-label-2">
            Exigida em todas as contas. Ao abrir o convite, a pessoa define a senha e escaneia o QR Code na mesma tela —
            então precisa estar com o celular à mão. O QR aparece no navegador, nunca no e-mail.
          </p>
        </div>
      </div>
    </form>

    <!-- ETAPA 2: pré-visualização do e-mail -->
    <div v-else class="space-y-4">
      <p v-if="error" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ error }}</p>

      <div class="flex items-start gap-3 rounded-celula bg-accent/10 p-3">
        <EnvelopeIcon class="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <p class="text-footnote text-label">
          Este e-mail será enviado para <strong>{{ formData.email }}</strong>. O link de acesso (Magic Link) é gerado
          automaticamente e inserido no template no momento do envio.
        </p>
      </div>

      <div class="overflow-hidden rounded-celula ring-1 ring-separator">
        <iframe title="Pré-visualização do e-mail" :srcdoc="previewHtml" class="block h-[480px] w-full border-0 bg-white" sandbox="" />
      </div>
    </div>

    <template #acoes>
      <template v-if="step === 'form'">
        <UiButton variante="gray" :disabled="isLoading" @click="emit('fechar')">Cancelar</UiButton>
        <UiButton type="submit" form="form-convidar" :carregando="isLoading && provisionMode">
          <template v-if="provisionMode">
            <template v-if="isLoading">Enviando…</template>
            <template v-else><PaperAirplaneIcon class="h-5 w-5" /> Enviar convite</template>
          </template>
          <template v-else>Pré-visualizar <EnvelopeIcon class="h-5 w-5" /></template>
        </UiButton>
      </template>
      <template v-else>
        <UiButton variante="gray" :disabled="isLoading" @click="step = 'form'">
          <ArrowLeftIcon class="h-5 w-5" /> Voltar
        </UiButton>
        <UiButton :carregando="isLoading" @click="enviar">
          <template v-if="isLoading">Enviando…</template>
          <template v-else><PaperAirplaneIcon class="h-5 w-5" /> Enviar convite</template>
        </UiButton>
      </template>
    </template>
  </UiSheet>
</template>
