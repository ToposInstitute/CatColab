/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_TITLE: string;
    readonly VITE_SERVER_URL: string;
    readonly VITE_AUTOMERGE_REPO_URL: string;
    readonly VITE_FIREBASE_OPTIONS: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
