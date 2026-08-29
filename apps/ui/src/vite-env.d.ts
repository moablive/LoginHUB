/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Opcional: sobrescreve a URL da API da Sul Alimentos (ver config/provisioning.ts). */
  readonly VITE_SUL_ALIMENTOS_API_URL?: string;
  /** Versao do build, vinda do arquivo VERSION pelo docker-compose. */
  readonly VITE_APP_VERSION: string;
  /** ISO da hora do bump — pega rebuild que nao trocou o numero da versao. */
  readonly VITE_APP_BUILD_DATE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
