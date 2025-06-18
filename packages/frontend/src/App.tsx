import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import { MultiProvider } from "@solid-primitives/context";
import {
    Navigate,
    type RouteDefinition,
    type RouteSectionProps,
    Router,
} from "@solidjs/router";

import { ErrorBoundary, Show, createResource, lazy } from "solid-js";

import { helpRoutes } from "./help/routes";
import { createModel } from "./model/document";
import { PageContainer } from "./page/page_container";
import { TheoryLibraryContext, stdTheories } from "./stdlib";
import { ErrorBoundaryDialog } from "./util/errors";
import { Api, ApiContext, useApi } from "./api";

const repoUrl = import.meta.env.VITE_AUTOMERGE_REPO_URL;

const Root = (props: RouteSectionProps<unknown>) => {
    invariant(repoUrl, "Must set environment variable VITE_AUTOMERGE_REPO_URL");

    const repo = new Repo({
        storage: new IndexedDBStorageAdapter("catcolab"),
        network: [new BrowserWebSocketClientAdapter(repoUrl)],
    });

    const api: Api = { repo };

    return (
        <MultiProvider
            values={[
                [ApiContext, api],
                [TheoryLibraryContext, stdTheories],
            ]}
        >
            <ErrorBoundary
                fallback={(err) => <ErrorBoundaryDialog error={err} />}
            >
                <PageContainer>{props.children}</PageContainer>
            </ErrorBoundary>
        </MultiProvider>
    );
};

function CreateModel() {
    const api = useApi();

    const theoryId = stdTheories.getDefault().id;
    const [ref] = createResource<string>(() => createModel(api, theoryId));

    return (
        <Show when={ref()}>
            {(ref) => <Navigate href={`/model/${ref()}`} />}
        </Show>
    );
}

const refIsUUIDFilter = {
    ref: (ref: string) => {
        console.log("ref", ref, isValidAutomergeUrl(ref));
        return isValidAutomergeUrl("automerge:" + ref);
    },
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
        path: "/profile",
        component: lazy(() => import("./user/profile")),
    },
    {
        path: "/documents",
        component: lazy(() => import("./user/documents")),
    },
    {
        path: "*",
        component: lazy(() => import("./page/404_page")),
    },
];

function App() {
    // We need two "top-level" error boundaries in order to display the SessionExpiredModal even after an
    // error occurs, while also catching error created by the router or other providers
    return (
        <ErrorBoundary fallback={(err) => <ErrorBoundaryDialog error={err} />}>
            <Router root={Root}>{routes}</Router>
        </ErrorBoundary>
    );
}

export default App;
