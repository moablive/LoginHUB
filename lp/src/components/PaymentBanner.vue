<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CheckCircle2, Clock, X, XCircle } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import { LOGINHUB_URL } from '@/links'

const { t } = useI18n()

// O Mercado Pago devolve o assinante para `/assine/obrigado?pedido=<ref>` (back_url
// da assinatura, montada pelo LoginHUB a partir do endereço do app). A página não
// tem router: lê o `pedido` da query, pergunta ao hub como o pedido está e mostra
// o estado. O cartão pode levar alguns instantes para entrar, então enquanto estiver
// "iniciada" consulta de novo, algumas vezes, antes de dizer "pendente".
type Estado = 'aprovado' | 'pendente' | 'erro'

const emObrigado = window.location.pathname.startsWith('/assine/obrigado')
const pedido = new URLSearchParams(window.location.search).get('pedido') ?? ''
const estado = ref<Estado | null>(emObrigado && pedido ? 'pendente' : null)

async function consultar(tentativa = 0): Promise<void> {
  try {
    const res = await fetch(`/api/venda/assinaturas/${encodeURIComponent(pedido)}`)
    const dados = (await res.json()) as { status?: string }
    if (dados.status === 'ativa') {
      estado.value = 'aprovado'
    } else if (dados.status === 'pausada' || dados.status === 'cancelada' || !res.ok) {
      estado.value = 'erro'
    } else if (tentativa < 6) {
      window.setTimeout(() => void consultar(tentativa + 1), 5000)
    }
  } catch {
    estado.value = 'erro'
  }
}

onMounted(() => {
  if (emObrigado && pedido) void consultar()
})

const conteudo = computed(() => {
  if (estado.value === 'aprovado') return { ...t.value.payment.approved, tom: 'ok' as const, icone: CheckCircle2 }
  if (estado.value === 'pendente') return { ...t.value.payment.pending, tom: 'aviso' as const, icone: Clock }
  return { ...t.value.payment.error, tom: 'erro' as const, icone: XCircle }
})

function fechar() {
  estado.value = null
  // Volta para a raiz para o aviso não reaparecer num F5 — e para o link
  // copiado não carregar um "pagamento aprovado" que não é de quem abriu.
  window.history.replaceState({}, '', import.meta.env.BASE_URL)
}
</script>

<template>
  <div v-if="estado" class="fixed inset-x-0 top-16 z-40 px-4" role="status" aria-live="polite">
    <div
      class="aw-container flex items-start gap-4 rounded-xl2 border p-4 shadow-2xl backdrop-blur-xl"
      :class="{
        'border-accent/40 bg-surface/95': conteudo.tom === 'ok',
        'border-amber-500/40 bg-surface/95': conteudo.tom === 'aviso',
        'border-red-500/40 bg-surface/95': conteudo.tom === 'erro',
      }"
    >
      <component
        :is="conteudo.icone"
        class="mt-0.5 h-5 w-5 shrink-0"
        :class="{
          'text-accent': conteudo.tom === 'ok',
          'text-amber-500': conteudo.tom === 'aviso',
          'text-red-500': conteudo.tom === 'erro',
        }"
      />
      <div class="flex-1">
        <p class="text-sm font-semibold">{{ conteudo.title }}</p>
        <p class="mt-1 text-sm leading-relaxed text-muted">{{ conteudo.body }}</p>
        <a v-if="conteudo.tom === 'ok'" :href="LOGINHUB_URL" class="aw-btn aw-btn-primary mt-3 !py-2 text-sm">
          {{ t.payment.enter }}
        </a>
      </div>
      <button
        class="rounded-lg p-1.5 text-muted transition-colors hover:text-fg"
        :aria-label="t.payment.dismiss"
        @click="fechar"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
