<script setup lang="ts">
import { Loader2, Lock } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import { useCheckout, ID_FORMULARIO, type CampoForm } from '@/composables/useCheckout'
import { mascaraTelefone } from '@/lib/mascaras'

const { t } = useI18n()
const { loading, erroGeral, erroDuplicado, erros, form, validarCampo, enviar } = useCheckout()

// Máscara aplicada no input: o v-model puro guardaria o texto sem formato.
function aoDigitar(e: Event) {
  const el = e.target as HTMLInputElement
  const formatado = mascaraTelefone(el.value)
  form.telefone = formatado
  el.value = formatado
}

const campos: Array<{
  id: CampoForm
  tipo: string
  autocomplete: string
  inputmode?: 'text' | 'email' | 'tel' | 'numeric'
}> = [
  { id: 'nome', tipo: 'text', autocomplete: 'name' },
  { id: 'email', tipo: 'email', autocomplete: 'email', inputmode: 'email' },
  { id: 'telefone', tipo: 'tel', autocomplete: 'tel', inputmode: 'tel' },
]
</script>

<template>
  <div :id="ID_FORMULARIO" class="aw-card border-accent/45 shadow-[0_24px_60px_-40px_hsl(var(--aw-accent))]">
    <h3 class="text-lg font-semibold tracking-tight">{{ t.form.title }}</h3>
    <p class="mt-1.5 text-sm leading-relaxed text-muted">{{ t.form.subtitle }}</p>

    <form class="mt-6 space-y-4" novalidate @submit.prevent="enviar">
      <div v-for="campo in campos" :key="campo.id">
        <label :for="`f-${campo.id}`" class="mb-1.5 block text-sm font-medium">
          {{ t.form.fields[campo.id].label }}
        </label>
        <input
          :id="`f-${campo.id}`"
          :type="campo.tipo"
          :inputmode="campo.inputmode"
          :autocomplete="campo.autocomplete"
          :placeholder="t.form.fields[campo.id].placeholder"
          :aria-invalid="erros[campo.id] ? 'true' : 'false'"
          :aria-describedby="erros[campo.id] ? `e-${campo.id}` : undefined"
          :value="form[campo.id]"
          class="w-full rounded-lg border bg-bg px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
          :class="erros[campo.id] ? 'border-red-500/70' : 'border-border-soft'"
          @input="
            campo.id === 'telefone'
              ? aoDigitar($event)
              : (form[campo.id] = ($event.target as HTMLInputElement).value)
          "
          @blur="validarCampo(campo.id)"
        />
        <p v-if="erros[campo.id]" :id="`e-${campo.id}`" class="mt-1.5 text-xs text-red-500">
          {{ t.form.fields[campo.id].error }}
        </p>
      </div>

      <p class="flex items-start gap-2 pt-1 text-xs leading-relaxed text-muted">
        <Lock class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {{ t.form.privacy }}
      </p>

      <button
        type="submit"
        class="aw-btn aw-btn-primary w-full disabled:cursor-wait disabled:opacity-70"
        :disabled="loading"
      >
        <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
        {{ loading ? t.checkout.loading : t.form.submit }}
      </button>

      <p v-if="erroDuplicado" class="text-center text-xs leading-relaxed text-red-500" role="alert">
        {{ t.checkout.errorDuplicate }}
      </p>
      <p v-else-if="erroGeral" class="text-center text-xs leading-relaxed text-red-500" role="alert">
        {{ t.checkout.error }}
      </p>
      <p v-else class="text-center text-xs text-muted">{{ t.checkout.secure }}</p>
    </form>
  </div>
</template>
