import { For, Show, createEffect, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { Dynamic, render } from "solid-js/web";
import {
    new_shelf,
    new_notebook,
    type Notebook,
    type Shelf,
    type Metadata,
    type Cell,
    type Value
} from "catlog-next";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import * as uuid from "uuid";
import {
    DocHandle,
    DocHandleChangePayload,
    isValidAutomergeUrl,
    Repo,
} from "@automerge/automerge-repo";

type Ref<T> = {
    value: T;
};

class Var<T> {
    now: T;
    update: (f: (r: Ref<T>) => void) => void;

    constructor(value: T, update: (f: (r: Ref<T>) => void) => void) {
        this.now = value;
        this.update = update;
    }

    zoom<S>(field: any): Var<S> {
        return new Var((this.now as any)[field] as S, (f) =>
            this.update((r) => {
                let inner = { value: (r.value as any)[field] as S };
                f(inner);
                if (typeof inner.value != "object") {
                    (r.value as any)[field] = inner.value;
                }
            }),
        );
    }
}

function Metadata(props: { metadata: Var<Metadata> }) {
    return (
        <div>
            <TextInput text={props.metadata.zoom("title")} />
        </div>
    );
}

function TextInput(props: { text: Var<string> }) {
    return (
        <input
            value={props.text.now}
            onInput={(ev) => props.text.update((r) => (r.value = ev.target.value))}
        />
    );
}

type Widget = {
    name: string,
    component: (props: { cell: Var<Cell> }) => any,
    init: Value
}

const WIDGETS: Record<string, Widget> = {
    "institute.topos.picker": {
        name: "Picker",
        component: Picker,
        init: "Empty"
    },
    "institute.topos.object": {
        name: "Object",
        component: ObjectCell,
        init: { "Record": { "name": { "Text": "" }, "type": { "Text": "" } } }
    }
}

function ObjectCell(props: { cell: Var<Cell> }) {
    return (<div class="object">
        <TextInput text={props.cell.zoom("content").zoom("Record").zoom("name").zoom("Text")} />
        <span>: </span>
        <TextInput text={props.cell.zoom("content").zoom("Record").zoom("type").zoom("Text")} />
    </div>)
}

function Picker(props: { cell: Var<Cell> }) {
    return (<div class="picker">
        <select
            value={props.cell.now.widget}
            onChange={ev => {
                props.cell.update(c => {
                    let widget = ev.target.value;
                    c.value.widget = widget;
                    c.value.content = WIDGETS[widget]!.init;
                })
            }}>
            <For each={Object.entries(WIDGETS)}>
                {w => <option value={w[0]}>{w[1].name}</option>}
            </For>
        </select>
    </div>)
}

function Cell(props: { cell: Var<Cell>; del: (_: any) => void }) {
    return (
        <div>
            <button onClick={props.del}>Delete</button>
            <Dynamic component={WIDGETS[props.cell.now.widget]!.component} cell={props.cell} />
        </div>
    );
}

function newCell(notebook: Notebook) {
    let id = uuid.v7();
    notebook.cells[id] = {
        widget: "institute.topos.picker",
        content: "Empty",
    };
    notebook.order.push(id);
}

function deleteCell(notebook: Notebook, id: string) {
    delete notebook.cells[id];
    notebook.order = notebook.order.filter((i) => id != i);
}

function Notebook(props: { notebook: Var<Notebook> }) {
    return (
        <div>
            <Metadata metadata={props.notebook.zoom("metadata")} />
            <ul>
                <For each={props.notebook.now.order}>
                    {(cellId) => (
                        <li class="cell">
                            <Cell
                                cell={props.notebook.zoom("cells").zoom(cellId)}
                                del={(_) =>
                                    props.notebook.update((n) => deleteCell(n.value, cellId))
                                }
                            />
                        </li>
                    )}
                </For>
            </ul>
            <button onClick={(_) => props.notebook.update((n) => newCell(n.value))}>
                New Cell
            </button>
        </div>
    );
}

/** Create a Solid Store that tracks an Automerge document.
 */
export async function makeDocHandleReactive<T extends object>(handle: DocHandle<T>): Promise<T> {
    const init = await handle.doc();

    const [store, setStore] = createStore<T>(init as T);

    const onChange = (payload: DocHandleChangePayload<T>) => {
        // Use [`reconcile`](https://www.solidjs.com/tutorial/stores_immutable)
        // function to diff the data and thus avoid re-rendering the whole DOM.
        setStore(reconcile(payload.doc));
    };

    handle.on("change", onChange);

    return store;
}

function newNotebook(shelf: Var<Shelf>) {
    shelf.update((s) => {
        const id = uuid.v7();
        s.value.notebooks[id] = new_notebook();
        s.value.last_opened = id;
    });
}

function deleteNotebook(shelf: Var<Shelf>) {
    shelf.update((r) => {
        const s = r.value;
        if (s.last_opened) {
            delete s.notebooks[s.last_opened];
            if (Object.entries(s.notebooks).length == 0) {
                s.last_opened = null;
            } else {
                s.last_opened = Object.entries(s.notebooks)[0]![0];
            }
        }
    });
}

function App(props: { shelf: Var<Shelf> }) {
    return (
        <div>
            <select
                onInput={(ev) => props.shelf.update((s) => (s.value.last_opened = ev.target.value))}
                value={props.shelf.now.last_opened}
            >
                <For each={Object.entries(props.shelf.now.notebooks)}>
                    {(notebook) => (
                        <option value={notebook[0]}>{notebook[1].metadata.title}</option>
                    )}
                </For>
            </select>
            <button onClick={(_) => newNotebook(props.shelf)}>New notebook</button>
            <button onClick={(_) => deleteNotebook(props.shelf)}>Delete notebook</button>
            <Show when={props.shelf.now.last_opened}>
                {(id) => (
                    <Notebook
                        notebook={props.shelf.zoom("notebooks").zoom(props.shelf.now.last_opened)}
                    />
                )}
            </Show>
        </div>
    );
}

const repo = new Repo({
    network: [],
    storage: new IndexedDBStorageAdapter("catcolab"),
});

const rootDocUrl = `${document.location.hash.substring(1)}`;
let handle: DocHandle<Shelf>;
if (isValidAutomergeUrl(rootDocUrl)) {
    handle = repo.find(rootDocUrl);
} else {
    handle = repo.create<Shelf>(new_shelf());
}
document.location.hash = handle.url;
const shelf = await makeDocHandleReactive(handle);

const root = document.getElementById("root");

// biome-ignore lint/style/noNonNullAssertion: we know that root exists
render(() => <App shelf={new Var(shelf, (f) => handle.change((s) => f({ value: s })))} />, root!);
