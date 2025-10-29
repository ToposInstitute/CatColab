import { type FirebaseOptions, initializeApp } from "firebase/app";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import Dialog, { Content, Portal } from "@corvu/dialog";
import { MultiProvider } from "@solid-primitives/context";
import { Navigate, type RouteDefinition, type RouteSectionProps, Router } from "@solidjs/router";
import { getAuth, signOut } from "firebase/auth";
import { FirebaseProvider } from "solid-firebase";
import { ErrorBoundary, Show, createResource, createSignal, lazy } from "solid-js";

import { Api, ApiContext, useApi } from "./api";
import { helpRoutes } from "./help/routes";
import { createModel } from "./model/document";
import { ErrorBoundaryDialog } from "./page/error_boundary";
import { PageContainer } from "./page/page_container";
import { stdTheories } from "./stdlib";
import { TheoryLibraryContext } from "./theory";

const serverUrl = import.meta.env.VITE_SERVER_URL;
const repoUrl = import.meta.env.VITE_AUTOMERGE_REPO_URL;
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

const Root = (props: RouteSectionProps<unknown>) => {
    invariant(serverUrl, "Must set environment variable VITE_SERVER_URL");
    invariant(repoUrl, "Must set environment variable VITE_AUTOMERGE_REPO_URL");

    const firebaseApp = initializeApp(firebaseOptions);
    const api = new Api({ serverUrl, repoUrl, firebaseApp });

    const [isSessionInvalid] = createResource(
        async () => {
            const result = await api.rpc.validate_session.query();
            if (result.tag === "Err") {
                await signOut(getAuth(firebaseApp));

                // Why this needs to be a separate modal:
                // We cannot automatically reload the page because a bug in validate_session might
                // trigger an infinite reload loop, so the reload must be user-triggered. Although
                // ErrorBoundary might seem like the natural place to handle this, it only catches the
                // first error, and there's no guarantee that an error from validate_session will be the
                // first one encountered.
                return true;
            }

            return false;
        },
        {
            initialValue: false,
        },
    );

    return (
        <MultiProvider
            values={[
                [ApiContext, api],
                [TheoryLibraryContext, stdTheories],
            ]}
        >
            <FirebaseProvider app={firebaseApp}>
                <ErrorBoundary fallback={(err) => <ErrorBoundaryDialog error={err} />}>
                    <PageContainer>{props.children}</PageContainer>
                </ErrorBoundary>
                <Show when={isSessionInvalid()}>
                    <SessionExpiredModal />
                </Show>
            </FirebaseProvider>
        </MultiProvider>
    );
};

export function SessionExpiredModal() {
    const [reloading, setReloading] = createSignal(false);

    const handleReload = () => {
        setReloading(true);
        location.reload();
    };

    return (
        <Dialog initialOpen={true}>
            <Portal>
                <Content class="popup error-dialog">
                    <h3>Session Expired</h3>
                    <p>Your session is no longer valid. Please reload the page to continue.</p>
                    <button onClick={handleReload} disabled={reloading()}>
                        {reloading() ? "Reloading..." : "Reload Page"}
                    </button>
                </Content>
            </Portal>
        </Dialog>
    );
}

function CreateModel() {
    const api = useApi();

    const [ref] = createResource<string>(() => {
        return createModel(api, stdTheories.defaultTheoryMetadata().id);
    });

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
        path: "/:kind/:ref/:subkind?/:subref?",
        matchFilters: {
            kind: ["model", "diagram", "analysis"],
            ref: refIsUUIDFilter.ref,
            subkind: (v?: string) => !v || v === "analysis" || v === "diagram" || v === "model",
            subref: (v?: string) => !v || refIsUUIDFilter.ref(v),
        },
        component: lazy(() => import("./page/document_page")),
    },
    {
        path: "/help",
        component: lazy(() => import("./help/help_layout")),
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
