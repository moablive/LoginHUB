import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // Template com várias linhas curtas lê melhor que um atributo por linha.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      // Prop opcional tipada já é `undefined` por padrão; exigir default só
      // duplicaria o tipo.
      'vue/require-default-prop': 'off',
    },
  },
  {
    // Service worker: roda no escopo do worker, não no da página.
    files: ['src/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
])
