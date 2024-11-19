import { Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { type FirebaseOptions, initializeApp } from "firebase/app";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import { MultiProvider } from "@solid-primitives/context";
import { Navigate, type RouteDefinition, type RouteSectionProps, Router } from "@solidjs/router";
import { FirebaseProvider } from "solid-firebase";
import { Show, createResource, lazy } from "solid-js";

import { RepoContext, RpcContext, createRpcClient, useApi } from "./api";
import { createModel } from "./model/document";
import { HelpContainer, lazyMdx } from "./page/help_page";
import { TheoryLibraryContext, stdTheories } from "./stdlib";

const serverUrl = import.meta.env.VITE_SERVER_URL;
const repoUrl = import.meta.env.VITE_AUTOMERGE_REPO_URL;
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

const Root = (props: RouteSectionProps<unknown>) => {
    invariant(serverUrl, "Must set environment variable VITE_SERVER_URL");
    invariant(repoUrl, "Must set environment variable VITE_AUTOMERGE_REPO_URL");

    const firebaseApp = initializeApp(firebaseOptions);
    const client = createRpcClient(serverUrl, firebaseApp);

    const repo = new Repo({
        storage: new IndexedDBStorageAdapter("catcolab"),
        network: [new BrowserWebSocketClientAdapter(repoUrl)],
    });

    return (
        <MultiProvider
            values={[
                [RpcContext, client],
                [RepoContext, repo],
                [TheoryLibraryContext, stdTheories],
            ]}
        >
            <FirebaseProvider app={firebaseApp}>{props.children}</FirebaseProvider>
        </MultiProvider>
    );
};

function CreateModel() {
    const api = useApi();

    const [ref] = createResource<string>(() => createModel(api));

    return <Show when={ref()}>{(ref) => <Navigate href={`/model/${ref()}`} />}</Show>;
}

const refIsUUIDFilter = {
    ref: (ref: string) => uuid.validate(ref),
};

const routes: RouteDefinition[] = [
    {
        path: "/",
        component: CreateModel,
    },
    {
        path: "/model/:ref",
        matchFilters: refIsUUIDFilter,
        component: lazy(() => import("./model/model_editor")),
    },
    {
        path: "/diagram/:ref",
        matchFilters: refIsUUIDFilter,
        component: lazy(() => import("./diagram/diagram_editor")),
    },
    {
        path: "/analysis/:ref",
        matchFilters: refIsUUIDFilter,
        component: lazy(() => import("./analysis/analysis_editor")),
    },
    {
        path: "/help",
        component: HelpContainer,
        children: [
            {
                path: "/",
                component: lazyMdx(() => import("./help/index.mdx")),
            },
            {
                path: "/credits",
                component: lazyMdx(() => import("./help/credits.mdx")),
            },
        ],
    },
];

function App() {
    return <Router root={Root}>{routes}</Router>;
}

export default App;
