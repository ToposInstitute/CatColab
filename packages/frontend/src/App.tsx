import { type DocHandle, Repo } from "@automerge/automerge-repo";
import type * as A from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import * as uuid from "uuid";

import { ModelEditor, type ModelNotebook } from "./model";
import { newNotebook } from "./notebook";
import { stdTheories } from "./stdlib";

import * as trpc from "@trpc/client";
import type { AppRouter } from "backend/src/index.js";
import { Match, Switch, createResource } from "solid-js";

const serverHost = import.meta.env.VITE_BACKEND_HOST;

function App() {
    if (!serverHost) {
        throw "Must set environment variable VITE_BACKEND_HOST";
    }

    const http_url = `https://${serverHost}`;
    const ws_url = `wss://${serverHost}`;

    const client = trpc.createTRPCClient<AppRouter>({
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
        analysis: newNotebook(),
    };

    const [handle] = createResource(async () => {
        let docId: A.DocumentId;
        let refId: string;

        if (uuid.validate(urlHash)) {
            refId = urlHash;
            const res = await client.docIdFor.query(urlHash);
            if (!res) {
                throw `Failed to get documentId for ref ${refId}`;
            }
            docId = res;
        } else {
            const doc = repo.create(init);

            docId = doc.documentId;

            refId = await client.newRef.mutate({
                docId,
                title: init.name,
            });

            document.location.hash = refId;
        }

        return {
            handle: repo.find(docId) as DocHandle<ModelNotebook>,
            refId: refId,
        };
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
                {(h) => (
                    <ModelEditor
                        handle={h().handle}
                        refId={h().refId}
                        client={client}
                        init={init}
                        theories={stdTheories}
                    />
                )}
            </Match>
        </Switch>
    );
}

export default App;
