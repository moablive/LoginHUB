import { reactive, ref } from 'vue'
import { apenasDigitos, emailValido, nomeValido, telefoneValido } from '@/lib/mascaras'

// Assinatura do LoginHUB (R$ 24,99/mês, cartão recorrente no Mercado Pago).
//
// Quem vende é o próprio LoginHUB: `POST /api/venda/apps/<id>/assinar` cria o
// pedido e devolve a página do Mercado Pago onde se cadastra o cartão. Quando o
// pagamento entra, o hub cria a conta do assinante e manda o link de acesso
// (senha + Google Authenticator) para o e-mail digitado aqui.
//
// Ele fica VISÍVEL na seção de preço, não atrás de um modal: é obrigatório para
// pagar, e esconder o que é obrigatório só faz a pessoa procurar. Os CTAs do
// topo e do rodapé rolam até ele.
export type CampoForm = 'nome' | 'email' | 'telefone'

export interface FormContratante {
  nome: string
  email: string
  telefone: string
}

/** Id do app "LoginHUB" no próprio LoginHUB (aplicativos.id). */
export const APP_ID = '28'

export const ID_FORMULARIO = 'form-contratacao'
export const ID_PRIMEIRO_CAMPO = 'f-nome'

// Estado no módulo: o formulário é um só, e o botão do topo precisa alcançá-lo.
const loading = ref(false)
const erroGeral = ref(false)
const erroDuplicado = ref(false)
const erros = reactive<Partial<Record<CampoForm, boolean>>>({})
const form = reactive<FormContratante>({ nome: '', email: '', telefone: '' })

const validadores: Record<CampoForm, (v: string) => boolean> = {
  nome: nomeValido,
  email: emailValido,
  telefone: telefoneValido,
}

export function useCheckout() {
  /** CTA de qualquer lugar da página: rola até o formulário e põe o cursor nele. */
  function irParaFormulario() {
    document.getElementById(ID_FORMULARIO)?.scrollIntoView({ block: 'center' })
    // O scroll é suave (CSS); focar antes da hora cancela a animação no Chrome.
    window.setTimeout(() => document.getElementById(ID_PRIMEIRO_CAMPO)?.focus(), 500)
  }

  /** Valida um campo só — usado no blur, para não acusar erro enquanto digita. */
  function validarCampo(campo: CampoForm) {
    erros[campo] = form[campo].length > 0 && !validadores[campo](form[campo])
  }

  function validarTudo(): boolean {
    let ok = true
    for (const campo of Object.keys(validadores) as CampoForm[]) {
      const valido = validadores[campo](form[campo])
      erros[campo] = !valido
      if (!valido) ok = false
    }
    return ok
  }

  async function enviar() {
    if (loading.value) return
    erroGeral.value = false
    erroDuplicado.value = false
    if (!validarTudo()) {
      // Leva o foco ao primeiro campo errado: sem isso, num formulário longo a
      // pessoa clica em "pagar" e nada visível acontece.
      const primeiro = (Object.keys(validadores) as CampoForm[]).find((c) => erros[c])
      if (primeiro) document.getElementById(`f-${primeiro}`)?.focus()
      return
    }

    loading.value = true
    try {
      const res = await fetch(`/api/venda/apps/${APP_ID}/assinar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome.trim(),
          email: form.email.trim(),
          telefone: apenasDigitos(form.telefone),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string }

      // 409: o e-mail já tem assinatura ou conta — o caminho é entrar, não pagar de novo.
      if (res.status === 409) {
        erroDuplicado.value = true
        return
      }

      if (!res.ok || !data.url) {
        erroGeral.value = true
        return
      }

      // Navegação de topo para o Mercado Pago. É de propósito que não abre em
      // aba nova: checkout em popup some atrás da janela, e a venda vai junto.
      window.location.href = data.url
    } catch {
      erroGeral.value = true
    } finally {
      loading.value = false
    }
  }

  return { loading, erroGeral, erroDuplicado, erros, form, irParaFormulario, validarCampo, enviar }
}
