import { Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import * as trpc from "@trpc/client";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import { MultiProvider } from "@solid-primitives/context";
import { type RouteDefinition, type RouteSectionProps, Router, useNavigate } from "@solidjs/router";
import { Match, Switch, createResource, lazy, useContext } from "solid-js";

import type { AppRouter } from "backend/src/index.js";
import { RPCContext, RepoContext } from "./api";
import { newModelDocument } from "./document/types";
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

const refIsUUIDFilter = {
    ref: (ref: string) => uuid.validate(ref),
};

function CreateModel() {
    const client = useContext(RPCContext);
    invariant(client, "Must provide RPCContext");

    const repo = useContext(RepoContext);
    invariant(repo, "Must provide RepoContext");

    const init = newModelDocument();
    const doc = repo.create(init);

    const [ref] = createResource<string>(async () => {
        return await client.newRef.mutate({ title: init.name, docId: doc.documentId });
    });

    const navigator = useNavigate();

    return (
        <Switch>
            <Match when={ref.loading}>
                <p>Loading...</p>
            </Match>
            <Match when={ref.error}>
                <span>Error: {ref.error}</span>
            </Match>
            <Match when={ref()}>
                {(ref) => <div ref={(_) => navigator(`/model/${ref()}`)}>Loading...</div>}
            </Match>
        </Switch>
    );
}

import Docs from "./docs/index.mdx";

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
        path: "/docs",
        component: (_) => <Docs />,
    }
];

function App() {
    return <Router root={Root}>{routes}</Router>;
}

export default App;
