/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_MASTER_KEY: string;
  /** Opcional: sobrescreve a URL da API da Sul Alimentos (ver config/provisioning.ts). */
  readonly VITE_SUL_ALIMENTOS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
