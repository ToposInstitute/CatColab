/* @refresh reload */
import { createSignal, createMemo, For, Show } from "solid-js"
import { render, Switch, Match } from "solid-js/web";
import * as uuid from "uuid"

function Header() {
    return (<h1>CatColab</h1>)
}

type Id = string;

type SimpleCell = {
    widget: "simple",
    name: string,
    tp: string
}

type ArrowCell = {
    widget: "arrow",
    name: string,
    src: string,
    tgt: string,
    tp: string
}

type Cell = SimpleCell | ArrowCell

type Notebook = {
    title: string,
    cells: Map<string, Cell>,
    order: string[]
}

type Shelf = {
    notebooks: Map<string, Notebook>
}

type Var<T> = {
    val: T,
    update: (f: (x: T) => T) => void
}

function zoom<T>(v: Var<T>, field: keyof T): Var<any> {
    return {
        val: v.val[field],
        update: (f) => v.update(v => {v[field] = f(v[field]); return v; })
    }
}

function zoomMap<S, T>(v: Var<Map<S, T>>, key: S): Var<T> {
    return {
        val: v.val.get(key) as T,
        update: (f) => v.update(v => { v.set(key, f(v.get(key) as T)); return v; })
    }
}

function TextField(props: { name: string, label: string, value: Var<string> }) {
    return (<div>
        <label for={props.name}>{props.label}</label>
        <input type="text" name={props.name}
            value={props.value.val}
            onInput={ev => props.value.update(_ => ev.target.value)} />
    </div>)
}

function SimpleCell(props: { cell: Var<SimpleCell> }) {
    return (
        <div class="cell simple">
            <form>
                <TextField name="name" label="Name" value={zoom(props.cell, "name")} />
                <TextField name="type" label="Type" value={zoom(props.cell, "tp")} />
            </form>
        </div>
    )
}

function ArrowCell(props: { cell: Var<ArrowCell> }) {
    return (
        <div class="cell arrow">
            <form>
                <TextField name="name" label="Name" value={zoom(props.cell, "name")} />
                <TextField name="src" label="Source" value={zoom(props.cell, "src")} />
                <TextField name="tgt" label="Target" value={zoom(props.cell, "tgt")} />
                <TextField name="type" label="Type" value={zoom(props.cell, "tp")} />
            </form>
        </div>
    )
}

function Cell(props: { cellId: string, notebook: Var<Notebook> }) {
    let cell = createMemo(() => {
        return {
            val: props.notebook.val.cells.get(props.cellId),
            update: (f: (c: Cell) => Cell) => {
                props.notebook.update((n) => {
                    n.cells.set(props.cellId, f(n.cells.get(props.cellId) as Cell));
                    return n;
                });
            }
        }
    }) as () => Var<Cell>;
    return (
        <Switch>
            <Match when={cell().val.widget === 'simple'}>
                <SimpleCell cell={cell() as Var<SimpleCell>} />
            </Match>
            <Match when={cell().val.widget === 'arrow'}>
                <ArrowCell cell={cell() as Var<ArrowCell>} />
            </Match>
        </Switch>
    )
}

function Notebook(props: { notebook: Var<Notebook> }) {
    return (
        <div class="notebook">
            <form>
                <TextField name="title" label="Title" value={zoom(props.notebook, "title")} />
            </form>
            <ul class="cells">
                <For each={props.notebook.val.order}>
                    {(id: Id,) =>
                        <li><Cell cellId={id} notebook={props.notebook} /></li>
                    }
                </For>
            </ul>
            <button onClick={_ => props.notebook.update(newSimple)}>New Simple</button>
            <button onClick={_ => props.notebook.update(newArrow)}>New Arrow</button>
        </div>
    )
}

function Shelf(props: { shelf: Var<Shelf> }) {
    let [notebookId, setNotebookId] = createSignal<string | undefined>(undefined)
    return (
        <div class="shelf">
            <form>
                <label for="notebook">Notebook: </label>
                <select name="notebook"
                    value={notebookId()}
                    onInput={ev => { setNotebookId(ev.target.value) }}>
                    <For each={[...props.shelf.val.notebooks.keys()]}>
                        {(notebookId) =>
                            <option value={notebookId}>
                                {props.shelf.val.notebooks.get(notebookId)?.title}
                            </option>
                        }
                    </For>
                </select>
            </form>
            <button onClick={_ => {
                let id = uuid.v7()
                props.shelf.update(s => newNotebook(s, id))
                setNotebookId(id)
            }}>New notebook</button>
            <Show when={notebookId()}>
                {notebookId =>
                    <Notebook notebook={zoomMap(zoom(props.shelf, "notebooks"), notebookId())} />
                }
            </Show>
        </div>
    )
}

function newNotebook(s: Shelf, withId: string): Shelf {
    let id = withId || uuid.v7()
    let n = {
        title: "Untitled",
        cells: new Map(),
        order: []
    }
    s.notebooks.set(id, n)
    return s
}

function newCell(n: Notebook, content: Cell): Notebook {
    let id = uuid.v7()
    n.cells.set(id, content)
    n.order.push(id)
    return n
}

function newSimple(n: Notebook): Notebook {
    return newCell(n, {
        widget: "simple",
        name: "",
        tp: ""
    })
}

function newArrow(n: Notebook): Notebook {
    return newCell(n, {
        widget: "arrow",
        name: "",
        src: "",
        tgt: "",
        tp: ""
    })
}

function newShelf(): Shelf {
    return {
        notebooks: new Map()
    }
}

function App() {
    let [shelf, setShelf] = createSignal(newShelf())
    let updateShelf = (f: (n: Shelf) => void) => {
        let s = structuredClone(shelf())
        f(s)
        setShelf(s)
    }
    return (<div>
        <Header />
        <Shelf shelf={{ val: shelf(), update: updateShelf }} />
        <button onClick={_ => console.log(shelf())}>Dump</button>
    </div>)
}

const root = document.getElementById("root");

// biome-ignore lint/style/noNonNullAssertion: we know that root exists
render(() => <App />, root!);
