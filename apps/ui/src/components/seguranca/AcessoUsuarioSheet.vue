<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ComputerDesktopIcon, DevicePhoneMobileIcon, LockOpenIcon, ShieldCheckIcon } from '@heroicons/vue/24/outline';
import { aparelhoApi } from '@loginhub/api-client';
import type { AparelhosDoApp, TipoAparelho, User } from '@loginhub/schema';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiSection from '@/components/ui/UiSection.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiAlert from '@/components/ui/UiAlert.vue';

/**
 * Ficha de acesso de um membro (04/11/2026, pedido do dono): tocar no nome na
 * lista de usuários abre onde a pessoa está autenticada e o histórico dos
 * logins dela (entrou, recusado, saiu, liberado).
 *
 * Desde 05/11/2026 a conta de CPF tem DUAS vagas — 📱 celular e 💻 computador —
 * cada uma com o próprio Liberar. Conta de e-mail não fica presa: aparece o
 * último login.
 *
 * A ficha busca o registro SÓ desta pessoa (`?usuario=`), para o histórico
 * não depender do corte dos últimos eventos do app inteiro (parecer do Conselho).
 */
const props = defineProps<{ user: User | null; appId: string | undefined; app2fa: boolean }>();
const emit = defineEmits<{ fechar: []; recarregar: [] }>();

type Preso = AparelhosDoApp['presos'][number];

const dados = ref<AparelhosDoApp>({ presos: [], registro: [] });
const carregando = ref(false);
const erro = ref('');

async function carregar() {
  const u = props.user;
  if (!u || !props.appId) return;
  carregando.value = true;
  erro.value = '';
  try {
    dados.value = await aparelhoApi.getByAppId(props.appId, u.id);
  } catch {
    dados.value = { presos: [], registro: [] };
    erro.value = 'Não foi possível carregar os acessos desta pessoa.';
  } finally {
    carregando.value = false;
  }
}

const VAGAS: { tipo: TipoAparelho; rotulo: string; icone: typeof DevicePhoneMobileIcon }[] = [
  { tipo: 'celular', rotulo: 'Celular', icone: DevicePhoneMobileIcon },
  { tipo: 'computador', rotulo: 'Computador', icone: ComputerDesktopIcon },
];
const vaga = (tipo: TipoAparelho): Preso | null => dados.value.presos.find((p) => p.tipo === tipo) ?? null;
const historico = computed(() => dados.value.registro);
const ultimoLogin = computed(() => historico.value.find((r) => r.evento === 'entrou') ?? null);
const ehCpf = computed(() => /^\d{11}$/.test(props.user?.email ?? ''));

const ROTULO: Record<string, string> = { entrou: 'Entrou', recusado: 'Recusado', saiu: 'Saiu', liberado: 'Liberado' };
const TOM: Record<string, 'success' | 'danger' | 'neutro' | 'warning'> = { entrou: 'success', recusado: 'danger', saiu: 'neutro', liberado: 'warning' };

function quando(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR');

const aLiberar = ref<Preso | null>(null);
const liberando = ref(false);

watch(
  () => props.user?.id,
  () => {
    dados.value = { presos: [], registro: [] };
    void carregar();
  },
  { immediate: true },
);

async function liberar() {
  const p = aLiberar.value;
  if (!p) return;
  liberando.value = true;
  erro.value = '';
  try {
    await aparelhoApi.liberar(p.usuarioId, 'painel do hub', props.appId, p.tipo);
    emit('recarregar');
    await carregar();
  } catch {
    erro.value = 'Não foi possível liberar o aparelho.';
  } finally {
    liberando.value = false;
    aLiberar.value = null;
  }
}
</script>

<template>
  <UiSheet :aberto="!!user" :titulo="user?.nome || ''" :subtitulo="user?.email" largura="lg" @fechar="emit('fechar')">
    <div v-if="user" class="space-y-6">
      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>

      <UiSection titulo="Onde está autenticado" lista>
        <!-- Conta de CPF: as duas vagas -->
        <template v-if="ehCpf">
          <div v-for="v in VAGAS" :key="v.tipo" class="flex flex-wrap items-center gap-3 px-4 py-3">
            <component :is="v.icone" class="h-7 w-7 shrink-0" :class="vaga(v.tipo) && !vaga(v.tipo)!.expirado ? 'text-success' : 'text-label-3'" />
            <div class="min-w-0 flex-1">
              <template v-if="vaga(v.tipo)">
                <p class="flex flex-wrap items-center gap-2 text-subhead font-medium">
                  {{ vaga(v.tipo)!.aparelhoNome || 'aparelho sem nome' }}
                  <UiBadge v-if="vaga(v.tipo)!.expirado" tom="warning">Parado há mais de 12 h</UiBadge>
                  <UiBadge v-else tom="success">Conectado</UiBadge>
                </p>
                <p class="text-footnote text-label-2">
                  {{ v.rotulo }}<template v-if="vaga(v.tipo)!.ip"> · IP <span class="font-mono">{{ vaga(v.tipo)!.ip }}</span></template>
                  · desde {{ dataHora(vaga(v.tipo)!.desde) }} · último acesso {{ quando(vaga(v.tipo)!.ultimoAcesso) }}
                </p>
                <p v-if="vaga(v.tipo)!.expirado" class="mt-1 text-footnote text-label-2">
                  O próximo login de outro computador assume a vaga sozinho.
                </p>
              </template>
              <template v-else>
                <p class="text-subhead text-label-2">{{ v.rotulo }}: vaga livre</p>
                <p class="text-footnote text-label-2">
                  {{ carregando ? 'Carregando…' : `O próximo login completo num ${v.rotulo.toLowerCase()} ocupa esta vaga.` }}
                </p>
              </template>
            </div>
            <UiButton
              v-if="vaga(v.tipo)"
              variante="tinted"
              tamanho="small"
              :carregando="liberando && aLiberar?.tipo === v.tipo"
              @click="aLiberar = vaga(v.tipo)"
            >
              <LockOpenIcon class="h-4 w-4" />
              Liberar
            </UiButton>
          </div>
          <p class="px-4 py-3 text-footnote text-label-2">
            Um celular e um computador por CPF. O computador pode ser compartilhado: quando outra pessoa entra nele, a vaga de
            quem estava antes é solta. Computador parado há mais de 12 h também libera a vaga.
          </p>
        </template>

        <!-- Conta de e-mail: não fica presa, aparece o último login -->
        <div v-else class="flex items-start gap-3 px-4 py-3">
          <DevicePhoneMobileIcon class="mt-0.5 h-7 w-7 shrink-0 text-label-2" />
          <div class="min-w-0 flex-1">
            <template v-if="ultimoLogin">
              <p class="text-subhead font-medium">{{ ultimoLogin.aparelhoNome || 'aparelho sem nome' }}</p>
              <p class="text-footnote text-label-2">
                Último login {{ quando(ultimoLogin.criadoEm) }}<template v-if="ultimoLogin.ip"> · IP <span class="font-mono">{{ ultimoLogin.ip }}</span></template>
              </p>
            </template>
            <p v-else-if="carregando" class="text-subhead text-label-2">Carregando…</p>
            <p v-else class="text-subhead text-label-2">Sem login no registro (o registro começou em 04/11/2026 e guarda 6 meses).</p>
            <p class="mt-1 text-footnote text-label-2">Conta de e-mail: entra em mais de um aparelho, por isso não fica presa — aqui aparece o último login.</p>
          </div>
        </div>

        <div class="flex items-center gap-2 px-4 py-3 text-footnote text-label-2">
          <ShieldCheckIcon class="h-4 w-4 shrink-0" />
          <template v-if="!app2fa">2FA não se aplica a este aplicativo.</template>
          <template v-else-if="user.dois_fatores?.ativo">2FA ativo.</template>
          <template v-else>2FA pendente: configura no próximo login.</template>
        </div>
      </UiSection>

      <UiSection :titulo="`Histórico de logins (${historico.length})`" lista>
        <p v-if="!historico.length" class="px-4 py-3 text-subhead text-label-2">
          {{ carregando ? 'Carregando…' : 'Sem eventos no registro (começou em 04/11/2026 e guarda 6 meses).' }}
        </p>
        <p v-else-if="historico.length >= 200" class="px-4 py-2 text-footnote text-label-2">Mostrando os 200 eventos mais recentes.</p>
        <div v-for="r in historico" :key="r.id" class="flex min-h-toque flex-wrap items-center gap-2 px-4 py-2 text-footnote text-label-2">
          <UiBadge :tom="TOM[r.evento] ?? 'neutro'">{{ ROTULO[r.evento] ?? r.evento }}</UiBadge>
          <ComputerDesktopIcon v-if="r.tipo === 'computador'" class="h-4 w-4" />
          <DevicePhoneMobileIcon v-else-if="r.tipo === 'celular'" class="h-4 w-4" />
          <span class="text-label">{{ r.aparelhoNome || 'aparelho sem nome' }}</span>
          <span v-if="r.ip" class="font-mono">{{ r.ip }}</span>
          <span v-if="r.detalhe">— {{ r.detalhe }}</span>
          <span class="ml-auto" :title="dataHora(r.criadoEm)">{{ quando(r.criadoEm) }}</span>
        </div>
      </UiSection>
    </div>
  </UiSheet>

  <UiAlert
    :aberto="!!aLiberar"
    tom="warning"
    :icone="LockOpenIcon"
    :titulo="user && aLiberar ? `Liberar o ${aLiberar.tipo} de ${user.nome}?` : ''"
    :mensagem="
      aLiberar
        ? `A vaga de ${aLiberar.tipo} sai de “${aLiberar.aparelhoNome || 'aparelho sem nome'}” e a sessão dele cai em até 1 minuto. A outra vaga não muda.`
        : ''
    "
    confirmar="Liberar"
    :carregando="liberando"
    texto-carregando="Liberando…"
    @fechar="aLiberar = null"
    @confirmar="liberar"
  />
</template>
