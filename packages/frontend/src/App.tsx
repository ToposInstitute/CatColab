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

import { type Api, ApiContext, createRpcClient, useApi } from "./api";
import { helpRoutes } from "./help/routes";
import { createModel } from "./model/document";
import { TheoryLibraryContext, stdTheories } from "./stdlib";

const serverUrl = import.meta.env.VITE_SERVER_URL;
const repoUrl = import.meta.env.VITE_AUTOMERGE_REPO_URL;
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

const Root = (props: RouteSectionProps<unknown>) => {
    invariant(serverUrl, "Must set environment variable VITE_SERVER_URL");
    invariant(repoUrl, "Must set environment variable VITE_AUTOMERGE_REPO_URL");
    const serverHost = new URL(serverUrl).host;

    const firebaseApp = initializeApp(firebaseOptions);
    const rpc = createRpcClient(serverUrl, firebaseApp);

    const repo = new Repo({
        storage: new IndexedDBStorageAdapter("catcolab"),
        network: [new BrowserWebSocketClientAdapter(repoUrl)],
    });

    const api: Api = { serverHost, rpc, repo };

    return (
        <MultiProvider
            values={[
                [ApiContext, api],
                [TheoryLibraryContext, stdTheories],
            ]}
        >
            <FirebaseProvider app={firebaseApp}>{props.children}</FirebaseProvider>
        </MultiProvider>
    );
};

function CreateModel() {
    const api = useApi();

    const theoryId = stdTheories.getDefault().id;
    const [ref] = createResource<string>(() => createModel(api, theoryId));

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
        component: lazy(() => import("./help/help_container")),
        children: helpRoutes,
    },
    {
        path: "/dev/*",
        component: (props) => {
            const url = `https://next.catcolab.org${props.location.pathname}`;
            window.location.replace(url);
            return null;
        },
    },
    {
        path: "/profile",
        component: lazy(() => import("./user/profile")),
    },
    {
        path: "*",
        component: lazy(() => import("./page/404_page")),
    },
];

function App() {
    return <Router root={Root}>{routes}</Router>;
}

export default App;
