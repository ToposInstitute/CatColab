import { Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import * as trpc from "@trpc/client";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import { MultiProvider } from "@solid-primitives/context";
import { Navigate, type RouteDefinition, type RouteSectionProps, Router } from "@solidjs/router";
import { Match, Switch, createResource, lazy, useContext } from "solid-js";

import type { AppRouter } from "backend/src/index.js";
import { RPCContext, RepoContext } from "./api";
import { newModelDocument } from "./document/types";
import { HelperContainer, lazyMdx } from "./page/help_page";
import { TheoryLibraryContext, stdTheories } from "./stdlib";

const serverUrl: string = import.meta.env.VITE_BACKEND_HOST;

const useHttps = serverUrl.match(/^https:\/\//)?.length === 1;
const serverHost = serverUrl.replace(/^https?:\/\//, "");

const httpUrl = `http${useHttps ? "s" : ""}://${serverHost}`;
const wsUrl = `ws${useHttps ? "s" : ""}://${serverHost}`;

const Root = (props: RouteSectionProps<unknown>) => {
    invariant(serverHost, "Must set environment variable VITE_BACKEND_HOST");

    const client = trpc.createTRPCClient<AppRouter>({
        links: [
            trpc.httpBatchLink({
                url: httpUrl,
            }),
        ],
    });

    const repo = new Repo({
        storage: new IndexedDBStorageAdapter("catcolab-demo"),
        network: [new BrowserWebSocketClientAdapter(wsUrl)],
    });

    return (
        <MultiProvider
            values={[
                [RPCContext, client],
                [RepoContext, repo],
                [TheoryLibraryContext, stdTheories],
            ]}
        >
            {props.children}
        </MultiProvider>
    );
};

function CreateModel() {
    const client = useContext(RPCContext);
    const repo = useContext(RepoContext);
    invariant(client && repo, "Missing context to create model");

    const init = newModelDocument();
    const doc = repo.create(init);

    const [ref] = createResource<string>(async () => {
        return await client.newRef.mutate({ title: init.name, docId: doc.documentId });
    });

    return (
        <Switch>
            <Match when={ref.error}>
                <span>Error: {ref.error}</span>
            </Match>
            <Match when={ref()}>{(ref) => <Navigate href={`/model/${ref()}`} />}</Match>
        </Switch>
    );
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
        component: lazy(() => import("./document/model_document_editor")),
    },
    {
        path: "/analysis/:ref",
        matchFilters: refIsUUIDFilter,
        component: lazy(() => import("./document/analysis_document_editor")),
    },
    {
        path: "/help",
        component: HelperContainer,
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
