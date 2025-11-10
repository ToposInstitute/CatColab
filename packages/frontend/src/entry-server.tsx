/**
 * Server-side entry point for prerendering the home page
 * Renders the actual HomePage component with all necessary providers
 */

import { Repo } from "@automerge/automerge-repo";
import { MultiProvider } from "@solid-primitives/context";
import { Route, Router } from "@solidjs/router";
import { type FirebaseApp, type FirebaseOptions, initializeApp } from "firebase/app";
import { FirebaseProvider } from "solid-firebase";
import { renderToString } from "solid-js/web";

import { ApiContext } from "./api";
import { createRpcClient } from "./api/rpc";
import { ModelLibraryContext, createModelLibraryWithApi } from "./model";
import HomePage from "./page/home_page";
import { stdTheories } from "./stdlib";
import { TheoryLibraryContext } from "./theory";

// Use environment variables for SSR
const serverUrl = process.env.VITE_SERVER_URL || "http://localhost:8000";
const firebaseOptions: FirebaseOptions = JSON.parse(process.env.VITE_FIREBASE_OPTIONS || "{}");

// Create a minimal SSR-compatible Api mock
function createSSRApi(firebaseApp: FirebaseApp) {
    const rpc = createRpcClient(serverUrl, firebaseApp);
    const repo = new Repo(); // No storage or network for SSR
    const localRepo = new Repo();

    return {
        serverHost: new URL(serverUrl).host,
        rpc,
        repo,
        localRepo,
        docCache: new Map(),
        getLiveDoc: async () => {
            throw new Error("getLiveDoc not available during SSR");
        },
        getLiveDocFromLink: async () => {
            throw new Error("getLiveDocFromLink not available during SSR");
        },
        getDocHandle: async () => {
            throw new Error("getDocHandle not available during SSR");
        },
        getPermissions: async () => ({ read: false, write: false }),
        isDocumentDeleted: async () => false,
        clearCachedDoc: () => {},
        createDoc: async () => {
            throw new Error("createDoc not available during SSR");
        },
        duplicateDoc: async () => {
            throw new Error("duplicateDoc not available during SSR");
        },
        makeUnversionedRef: (refId: string) => ({
            _id: refId,
            _version: null,
            _server: new URL(serverUrl).host,
        }),
    };
}

export function render() {
    // Initialize Firebase and API for SSR
    const firebaseApp = initializeApp(firebaseOptions);
    // biome-ignore lint/suspicious/noExplicitAny: SSR mock needs to match Api interface
    const api = createSSRApi(firebaseApp) as any;

    const theories = stdTheories;
    const models = createModelLibraryWithApi(api, theories);

    return renderToString(() => (
        <MultiProvider
            values={[
                [ApiContext, api],
                [TheoryLibraryContext, theories],
                [ModelLibraryContext, models],
            ]}
        >
            <FirebaseProvider app={firebaseApp}>
                <Router>
                    <Route path="/" component={HomePage} />
                </Router>
            </FirebaseProvider>
        </MultiProvider>
    ));
}
