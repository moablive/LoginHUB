<script setup lang="ts">
import { ref, watch } from 'vue';
import { PhoneIcon } from '@heroicons/vue/24/outline';
import { userApi } from '@loginhub/api-client';
import type { User, UpdateUserDTO as UpdateUserPayload } from '@loginhub/schema';
import { getProvisionedApp } from '@/config/provisioning';
import { masks } from '@/utils/masks';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';

const props = defineProps<{
  aberto: boolean;
  user: User | null;
  /** O app do usuário — decide quais níveis o select oferece (ver provisioning.ts). */
  appId?: string;
}>();
const emit = defineEmits<{ fechar: []; sucesso: [] }>();

const provisioned = getProvisionedApp(props.appId);

const form = ref({ nome: '', email: '', telefone: '', role: 'user' });
const carregando = ref(false);
const erro = ref<string | null>(null);

// Papel que o app não oferece some do select — mas o papel ATUAL do usuário
// fica, senão o formulário abriria com um valor que não existe na lista.
const oferece = (r: string) => !provisioned?.hubRoles || r in provisioned.hubRoles || form.value.role === r;

watch(
  () => props.user,
  (u) => {
    if (!u) return;
    form.value = { nome: u.nome, email: u.email, telefone: masks.phone(u.telefone || ''), role: u.role || 'user' };
    erro.value = null;
  },
  { immediate: true },
);

function aoDigitarTelefone(v: string) {
  form.value.telefone = masks.phone(v);
}

async function salvar() {
  if (!props.user) return;
  carregando.value = true;
  erro.value = null;
  try {
    const cleanPhone = form.value.telefone.replace(/\D/g, '');
    const payload: UpdateUserPayload = {
      nome: form.value.nome,
      email: form.value.email,
      telefone: cleanPhone || undefined,
      role: form.value.role,
    };
    await userApi.update(props.user.id, payload);
    emit('sucesso');
    emit('fechar');
  } catch (e) {
    console.error(e);
    erro.value = 'Não foi possível atualizar o usuário. Verifique os dados e tente novamente.';
  } finally {
    carregando.value = false;
  }
}
</script>

<template>
  <UiSheet :aberto="aberto && !!user" titulo="Editar usuário" :subtitulo="user?.email" :bloqueado="carregando" @fechar="emit('fechar')">
    <form id="form-editar-usuario" class="space-y-4" @submit.prevent="salvar">
      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>

      <UiTextField v-model="form.nome" rotulo="Nome completo" required autocomplete="off" />
      <UiTextField v-model="form.email" rotulo="E-mail de acesso" type="email" required autocomplete="off" />

      <UiSelect v-model="form.role" rotulo="Nível de acesso">
        <option v-if="oferece('user')" value="user">Usuário</option>
        <option v-if="oferece('operador')" value="operador">Operador</option>
        <option v-if="oferece('admin')" value="admin">Administrador</option>
        <option v-if="oferece('suporte')" value="suporte">Suporte</option>
        <!-- Papel da Sul Alimentos que o hub não oferece no convite padrão:
             sem a opção, o select de um motorista abria em branco. -->
        <option v-if="form.role === 'motorista'" value="motorista">Motorista</option>
        <option v-if="form.role === 'master'" value="master">Master</option>
      </UiSelect>

      <UiTextField
        :model-value="form.telefone"
        rotulo="Telefone / WhatsApp"
        type="tel"
        inputmode="tel"
        maxlength="15"
        placeholder="(00) 00000-0000"
        @update:model-value="aoDigitarTelefone"
      >
        <template #icone><PhoneIcon /></template>
      </UiTextField>
    </form>

    <template #acoes>
      <UiButton variante="gray" :disabled="carregando" @click="emit('fechar')">Cancelar</UiButton>
      <UiButton type="submit" form="form-editar-usuario" :carregando="carregando">
        {{ carregando ? 'Salvando…' : 'Salvar alterações' }}
      </UiButton>
    </template>
  </UiSheet>
</template>
