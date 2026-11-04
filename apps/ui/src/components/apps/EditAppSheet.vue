<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { appApi } from '@loginhub/api-client';
import type { App, Categoria } from '@loginhub/schema';
import { masks } from '@/utils/masks';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import LogoUpload from './LogoUpload.vue';

const props = withDefaults(
  defineProps<{
    app: App | null;
    /** Grupos do painel, já na ordem da tela. Vazio = o seletor não aparece. */
    categorias?: Categoria[];
  }>(),
  { categorias: () => [] },
);
const emit = defineEmits<{ fechar: []; salvo: [] }>();

const form = reactive({
  nome: '',
  email: '',
  documento: '',
  telefone: '',
  urlPlataforma: '',
  urlBot: '',
  // '' = "Sem categoria". Vai como null para a API.
  categoria_id: '',
});
const logo = ref<string | null>(null);
const salvando = ref(false);
const erro = ref<string | null>(null);

watch(
  () => props.app,
  (app) => {
    if (!app) return;
    Object.assign(form, {
      nome: app.nome,
      email: app.email,
      documento: masks.cnpj(app.documento),
      telefone: masks.phone(app.telefone || ''),
      urlPlataforma: app.platform_url || '',
      urlBot: app.bot_url || '',
      categoria_id: app.categoria_id ? String(app.categoria_id) : '',
    });
    logo.value = app.logo ?? null;
    erro.value = null;
  },
  { immediate: true },
);

// Máscara aplicada no próprio valor do campo, como era no `value={masks…}`.
watch(() => form.documento, (v) => (form.documento = masks.cnpj(v)));
watch(() => form.telefone, (v) => (form.telefone = masks.phone(v)));

const opcoesCategoria = computed(() => [
  { valor: '', rotulo: 'Sem categoria' },
  ...props.categorias.map((c) => ({ valor: String(c.id), rotulo: c.nome })),
]);

async function salvar() {
  if (!props.app) return;
  salvando.value = true;
  erro.value = null;
  try {
    const telefone = form.telefone.replace(/\D/g, '');
    await appApi.update(props.app.id, {
      nome: form.nome,
      email: form.email,
      documento: form.documento.replace(/\D/g, ''),
      telefone: telefone || undefined,
      logo: logo.value ?? null,
      platform_url: form.urlPlataforma.trim() || null,
      bot_url: form.urlBot.trim() || null,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
    });
    emit('salvo');
  } catch (e) {
    console.error(e);
    erro.value = 'Não foi possível atualizar o aplicativo. Verifique se o CNPJ ou e-mail já estão em uso.';
  } finally {
    salvando.value = false;
  }
}

// Fora do template: o vue-tsc se perde com "https://" escrito no atributo.
const EXEMPLO_PLATAFORMA = 'https://app.exemplo.com';
const EXEMPLO_BOT = 'https://t.me/seu_bot';
</script>

<template>
  <UiSheet :aberto="!!app" titulo="Editar aplicativo" :subtitulo="app?.nome" :bloqueado="salvando" @fechar="emit('fechar')">
    <form id="form-editar-app" class="space-y-4" @submit.prevent="salvar">
      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>

      <UiTextField v-model="form.nome" rotulo="Nome do aplicativo" required />

      <LogoUpload v-model="logo" />

      <UiSelect
        v-if="categorias.length > 0"
        v-model="form.categoria_id"
        rotulo="Categoria"
        :opcoes="opcoesCategoria"
        dica="Grupo em que o aplicativo aparece no painel. Ao trocar, ele entra no fim do novo grupo."
      />

      <UiTextField v-model="form.documento" rotulo="Documento (CNPJ)" inputmode="numeric" maxlength="18" required />
      <UiTextField v-model="form.email" rotulo="E-mail corporativo" type="email" autocomplete="email" required />
      <UiTextField v-model="form.telefone" rotulo="Telefone" type="tel" inputmode="tel" maxlength="15" />
      <UiTextField
        v-model="form.urlPlataforma"
        rotulo="URL da plataforma (opcional)"
        type="url"
        :placeholder="EXEMPLO_PLATAFORMA"
        dica="Link “Acessar sistema” do e-mail de convite."
      />
      <UiTextField
        v-model="form.urlBot"
        rotulo="URL do bot (opcional)"
        type="url"
        :placeholder="EXEMPLO_BOT"
        dica="Enviada no e-mail de convite para o usuário acessar o bot."
      />
    </form>

    <template #acoes>
      <UiButton variante="gray" :disabled="salvando" @click="emit('fechar')">Cancelar</UiButton>
      <UiButton type="submit" form="form-editar-app" :carregando="salvando">
        {{ salvando ? 'Salvando…' : 'Salvar alterações' }}
      </UiButton>
    </template>
  </UiSheet>
</template>
