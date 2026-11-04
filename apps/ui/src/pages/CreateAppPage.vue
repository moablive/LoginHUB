<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import {
  BuildingOfficeIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  IdentificationIcon,
  LinkIcon,
  PhoneIcon,
  RocketLaunchIcon,
} from '@heroicons/vue/24/outline';
import { appApi, categoriaApi } from '@loginhub/api-client';
import type { Categoria } from '@loginhub/schema';
import { masks } from '@/utils/masks';
import UiNavBar from '@/components/ui/UiNavBar.vue';
import UiSection from '@/components/ui/UiSection.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiAlert from '@/components/ui/UiAlert.vue';
import LogoUpload from '@/components/apps/LogoUpload.vue';

const router = useRouter();

const form = reactive({
  nome: '',
  documento: '',
  email: '',
  telefone: '',
  urlPlataforma: '',
  urlBot: '',
  // '' = "Sem categoria"; vira null no envio.
  categoria_id: '',
});
const logo = ref<string | null>(null);
const categorias = ref<Categoria[]>([]);
const enviando = ref(false);
const sucesso = ref(false);
const alerta = ref<{ titulo: string; mensagem: string } | null>(null);
const erros = reactive<Record<'nome' | 'documento' | 'urlPlataforma' | 'urlBot', string | null>>({
  nome: null,
  documento: null,
  urlPlataforma: null,
  urlBot: null,
});

onMounted(() => {
  categoriaApi
    .getAll()
    .then((lista) => (categorias.value = lista))
    .catch((e) => console.error('Erro ao buscar categorias', e));
});

// Máscaras no próprio valor, como o setValue do formulário antigo fazia.
watch(() => form.documento, (v) => (form.documento = masks.cpfCnpj(v)));
watch(() => form.telefone, (v) => (form.telefone = masks.phone(v)));

const opcoesCategoria = computed(() => [
  { valor: '', rotulo: 'Sem categoria' },
  ...categorias.value.map((c) => ({ valor: String(c.id), rotulo: c.nome })),
]);

const URL_VALIDA = /^https?:\/\/.+/i;

function validar(): boolean {
  erros.nome = form.nome.trim() ? null : 'Nome é obrigatório';
  erros.documento = form.documento.trim() ? null : 'Documento é obrigatório';
  erros.urlPlataforma = form.urlPlataforma && !URL_VALIDA.test(form.urlPlataforma) ? 'URL deve começar com http:// ou https://' : null;
  erros.urlBot = form.urlBot && !URL_VALIDA.test(form.urlBot) ? 'URL deve começar com http:// ou https://' : null;
  return !Object.values(erros).some(Boolean);
}

async function provisionar() {
  if (!validar()) return;
  enviando.value = true;
  try {
    await appApi.create({
      nome: form.nome,
      documento: form.documento,
      email: form.email,
      telefone: form.telefone,
      // Campo vazio vai como ausente, igual ao formulário antigo deixava passar.
      platform_url: form.urlPlataforma || undefined,
      bot_url: form.urlBot || undefined,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      logo: logo.value || undefined,
    });
    sucesso.value = true;
  } catch (e: unknown) {
    console.error(e);
    if (axios.isAxiosError(e)) {
      alerta.value = { titulo: 'Erro no provisionamento', mensagem: e.response?.data?.message || 'Falha ao criar aplicativo' };
    } else {
      alerta.value = { titulo: 'Erro inesperado', mensagem: 'Ocorreu um erro interno. Tente novamente.' };
    }
  } finally {
    enviando.value = false;
  }
}

function voltarParaLista() {
  sucesso.value = false;
  void router.push('/dashboard');
}

// Fora do template: o vue-tsc se perde com "https://" escrito no atributo.
const EXEMPLO_PLATAFORMA = 'https://app.exemplo.com';
const EXEMPLO_BOT = 'https://t.me/seu_bot';
</script>

<template>
  <div class="animate-fade-in">
    <UiNavBar titulo="Novo aplicativo" subtitulo="Provisionamento de novo tenant" voltar="/dashboard" voltar-texto="Aplicativos" />

    <form class="mx-auto mt-4 max-w-2xl space-y-8" @submit.prevent="provisionar">
      <UiSection titulo="Identidade">
        <div class="space-y-4">
          <UiTextField v-model="form.nome" rotulo="Nome do aplicativo" placeholder="Ex.: Tech Solutions Ltda" :erro="erros.nome" required>
            <template #icone><BuildingOfficeIcon /></template>
          </UiTextField>
          <LogoUpload v-model="logo" />
          <UiSelect
            v-if="categorias.length > 0"
            v-model="form.categoria_id"
            rotulo="Categoria (opcional)"
            :opcoes="opcoesCategoria"
            dica="Grupo em que o aplicativo aparece no painel. Dá para mudar depois, em Editar."
          />
        </div>
      </UiSection>

      <UiSection titulo="Dados corporativos">
        <div class="space-y-4">
          <UiTextField
            v-model="form.documento"
            rotulo="Documento (CPF/CNPJ)"
            placeholder="000.000.000-00 ou 00.000.000/0001-00"
            inputmode="numeric"
            maxlength="18"
            :erro="erros.documento"
            required
          >
            <template #icone><IdentificationIcon /></template>
          </UiTextField>
          <UiTextField v-model="form.email" rotulo="E-mail corporativo" type="email" autocomplete="email" placeholder="contato@aplicativo.com" required>
            <template #icone><EnvelopeIcon /></template>
          </UiTextField>
          <UiTextField v-model="form.telefone" rotulo="Telefone" type="tel" inputmode="tel" placeholder="(00) 0000-0000" maxlength="15" required>
            <template #icone><PhoneIcon /></template>
          </UiTextField>
        </div>
      </UiSection>

      <UiSection titulo="Links do convite" rodape="Os dois são opcionais e aparecem no e-mail de convite.">
        <div class="space-y-4">
          <UiTextField
            v-model="form.urlPlataforma"
            rotulo="URL da plataforma"
            type="url"
            :placeholder="EXEMPLO_PLATAFORMA"
            dica="Endereço web do aplicativo. É o link “Acessar sistema” do e-mail de convite."
            :erro="erros.urlPlataforma"
          >
            <template #icone><GlobeAltIcon /></template>
          </UiTextField>
          <UiTextField
            v-model="form.urlBot"
            rotulo="URL do bot"
            type="url"
            :placeholder="EXEMPLO_BOT"
            dica="Link enviado no e-mail de convite para os usuários acessarem o bot (Telegram, WhatsApp etc.)."
            :erro="erros.urlBot"
          >
            <template #icone><LinkIcon /></template>
          </UiTextField>
        </div>
      </UiSection>

      <UiButton type="submit" tamanho="large" bloco :carregando="enviando">
        <RocketLaunchIcon v-if="!enviando" class="h-5 w-5" />
        {{ enviando ? 'Provisionando…' : 'Provisionar tenant' }}
      </UiButton>
    </form>

    <UiAlert
      :aberto="sucesso"
      tom="success"
      :icone="CheckCircleIcon"
      titulo="Tenant provisionado!"
      mensagem="O aplicativo e o usuário administrador foram criados com sucesso."
      :cancelar="null"
      confirmar="Voltar para a lista"
      @fechar="voltarParaLista"
    />

    <UiAlert
      :aberto="!!alerta"
      tom="danger"
      :titulo="alerta?.titulo ?? ''"
      :mensagem="alerta?.mensagem"
      :cancelar="null"
      confirmar="Entendi"
      @fechar="alerta = null"
    />
  </div>
</template>
