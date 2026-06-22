/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_ANIMEONSEN_SEARCH_TOKEN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
