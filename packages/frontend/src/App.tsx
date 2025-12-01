import Dialog, { Content, Portal } from "@corvu/dialog";

import { MultiProvider } from "@solid-primitives/context";

import { Navigate, type RouteDefinition, Router, type RouteSectionProps } from "@solidjs/router";

import { type FirebaseOptions, initializeApp } from "firebase/app";

import { getAuth, signOut } from "firebase/auth";
import { FirebaseProvider } from "solid-firebase";
import { createResource, createSignal, ErrorBoundary, lazy, Show } from "solid-js";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import { Button } from "catcolab-ui-components";
import { Api, ApiContext, useApi } from "./api";
import { helpRoutes } from "./help/routes";
import { createModelLibraryWithApi, ModelLibraryContext } from "./model";
import { createModel } from "./model/document";
import { ErrorBoundaryDialog } from "./page/error_boundary";
import { PageContainer } from "./page/page_container";
import { stdTheories } from "./stdlib";
import { TheoryLibraryContext } from "./theory";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { Repo } from "@automerge/automerge-repo";

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
                return true;
            }
            return false;
        },
        {
            initialValue: false,
        },
    );

    const theories = stdTheories;
    const models = createModelLibraryWithApi(api, theories);

    return (
        <MultiProvider
            values={[
                [ApiContext, api],
                [TheoryLibraryContext, theories],
                [ModelLibraryContext, models],
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

const BACKEND_URL = "http://localhost:8080";
const WS_URL = "ws://localhost:8080/repo-ws";

async function main() {
    console.log("🚀 Starting Automerge client...");

    // Fetch the document ID from the backend
    console.log(`📡 Fetching document ID from ${BACKEND_URL}/doc-id...`);
    const response = await fetch(`${BACKEND_URL}/doc-id`);
    const { doc_id } = await response.json();
    console.log(`📄 Document ID: ${doc_id}`);

    // Create automerge repo with WebSocket adapter
    console.log(`🔌 Connecting to WebSocket at ${WS_URL}...`);
    const repo = new Repo({
        network: [new WebSocketClientAdapter(WS_URL)],
    });

    // Find the document (now returns a Promise)
    console.log(`🔍 Finding document ${doc_id}...`);
    const handle = await repo.find(doc_id as any);
    console.log("✅ Document ready!");

    // Log initial document state
    const doc = handle.doc();
    console.log("📖 Initial document state:", JSON.stringify(doc, null, 2));

    // Listen for changes
    handle.on("change", ({ doc, patches }) => {
        console.log("🔄 Document changed!");
        console.log("   New state:", JSON.stringify(doc, null, 2));
        console.log("   Patches:", patches);
    });

    // Make a test change after 2 seconds
    setTimeout(() => {
        console.log("✏️  Making a test change...");
        handle.change((doc: any) => {
            doc.count = (doc.count || 0) + 1;
            doc.clientMessage = "Hello from TypeScript client!";
            doc.timestamp = new Date().toISOString();
        });
        console.log("✅ Change submitted");
    }, 2000);

    // Make another change after 4 seconds
    setTimeout(() => {
        console.log("✏️  Making another test change...");
        handle.change((doc: any) => {
            doc.count = (doc.count || 0) + 1;
            doc.lastUpdate = new Date().toISOString();
        });
        console.log("✅ Second change submitted");
    }, 4000);

    // Keep the process running
    console.log("👀 Watching for changes...");
}

// Run main function on startup
main().catch((error) => {
    console.error("❌ Error:", error);
});

// Why this needs to be a separate modal: we cannot automatically reload the
// page because a bug in validate_session might trigger an infinite reload loop,
// so the reload must be user-triggered. Although ErrorBoundary might seem like
// the natural place to handle this, it only catches the first error, and
// there's no guarantee that an error from validate_session will be the first
// one encountered.
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
                    <Button variant="primary" onClick={handleReload} disabled={reloading()}>
                        {reloading() ? "Reloading..." : "Reload Page"}
                    </Button>
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

const HomePage = lazy(() => import("./page/home_page"));

const refIsUUIDFilter = {
    ref: (ref: string) => uuid.validate(ref),
};

const routes: RouteDefinition[] = [
    {
        path: "/",
        component: HomePage,
    },
    {
        path: "/new",
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
        path: "/trash",
        component: lazy(() => import("./user/trash")),
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
