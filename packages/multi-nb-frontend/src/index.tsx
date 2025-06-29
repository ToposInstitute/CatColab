/* @refresh reload */
import { render } from "solid-js/web";

import "./reset.css";
import "./index.css";
import { dragHandler, Frame } from "./frame";
import { createSignal } from "solid-js";
import { Repo } from "@automerge/automerge-repo";
import { LiveDocProvider } from "./use-livedoc";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { makePersisted } from "@solid-primitives/storage";
import { DocumentsProvider, DocumentStore } from "./use-documents";
import { createStore } from "solid-js/store";

function App() {
    const repo = new Repo({
        storage: new IndexedDBStorageAdapter(),
    });

    const frameF: Frame = { tag: "full" };

    const [frame, setFrame, _init1] = makePersisted(createSignal(frameF), {
        storage: localStorage,
    });

    const [documents, setDocuments, _init2] = makePersisted(
        createStore<DocumentStore>({ allDocumentIds: [] }),
        {
            storage: localStorage,
        },
    );

    const [dragState, setDragState] = createSignal("none");

    dragHandler.setDragState = setDragState;

    return (
        <DocumentsProvider
            documents={{ value: documents, update: setDocuments }}
        >
            <LiveDocProvider repo={repo}>
                <div
                    class="container"
                    onMouseUp={() => {
                        setDragState("none");
                        dragHandler.onMove = (_x, _y) => {};
                    }}
                    onMouseMove={(ev) => {
                        dragHandler.onMove(ev.clientX, ev.clientY);
                    }}
                    classList={{
                        dragns: dragState() == "ns",
                        dragew: dragState() == "ew",
                    }}
                >
                    <Frame
                        close={() => setFrame(frameF)}
                        reset={setFrame}
                        frame={frame()}
                    />
                </div>
            </LiveDocProvider>
        </DocumentsProvider>
    );
}

const root = document.getElementById("root");

// biome-ignore lint/style/noNonNullAssertion: we know that root exists
render(() => <App />, root!);
