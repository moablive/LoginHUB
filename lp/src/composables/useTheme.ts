import { ref, watchEffect } from 'vue'

// Escuro por padrão: o público é técnico e a LP é lida majoritariamente à noite,
// em estúdio. O claro existe para quem imprime ou tem sensibilidade a contraste.
export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'aw-security-theme'

const saved = localStorage.getItem(STORAGE_KEY)
const theme = ref<Theme>(saved === 'light' ? 'light' : 'dark')

// Fora do componente: a classe segue o estado mesmo se nenhum componente montar.
watchEffect(() => {
  const root = document.documentElement
  root.classList.toggle('dark', theme.value === 'dark')
  root.style.colorScheme = theme.value
  localStorage.setItem(STORAGE_KEY, theme.value)
})

export function useTheme() {
  const toggle = () => {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }
  return { theme, toggle }
}
