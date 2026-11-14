/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: 'api' | 'local';
  readonly VITE_API_BASE?: string;
  readonly VITE_LIB?: string;
}
