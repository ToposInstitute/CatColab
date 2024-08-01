import { type DocHandle, Repo, isValidAutomergeUrl } from "@automerge/automerge-repo";
import type * as A from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import * as uuid from "uuid";

import { ModelEditor, type ModelNotebook } from "./model";
import { newNotebook } from "./notebook";
import { stdTheories } from "./theory";

import * as trpc from "@trpc/client";
import type { AppRouter } from "backend/src/index.js";
import { createResource, Match, Switch } from "solid-js";

const serverHost = "localhost:5173";

function App() {
    const theories = stdTheories();

    const http_url = `http://${serverHost}/api`;
    const ws_url = `ws://${serverHost}/api`;

    const api = trpc.createTRPCClient<AppRouter>({
        links: [
            trpc.httpBatchLink({
                url: http_url,
            }),
        ],
    });

    const repo = new Repo({
        storage: new IndexedDBStorageAdapter("catcolab-demo"),
        network: [new BrowserWebSocketClientAdapter(ws_url)],
    });

    const urlHash = document.location.hash.substring(1);

    const init: ModelNotebook = {
        name: "Untitled",
        notebook: newNotebook(),
    };

    const [handle] = createResource(async () => {
        let docId: A.DocumentId;

        if (uuid.validate(urlHash)) {
            docId = (await api.docIdFor.query(urlHash))!;
        } else {
            const doc = repo.create(init);

            docId = doc.documentId;

            const refId = await api.newRef.mutate({
                docId,
                title: init.name,
            });

            document.location.hash = refId;
        }

        return repo.find(docId) as DocHandle<ModelNotebook>;
    });

    return (
        <Switch>
            <Match when={handle.loading}>
                <p>Loading...</p>
            </Match>
            <Match when={handle.error}>
                <span>Error: {handle.error}</span>
            </Match>
            <Match when={handle()}>
                <ModelEditor handle={handle()!} init={init} theories={theories} />
            </Match>
        </Switch>
    );
}

export default App;
