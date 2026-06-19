import {
    byMorphismType,
    byObjectType,
    CellKind,
    createBinder,
    defineShape,
    type DocumentStore,
    homList,
    type ListKind,
    type MorphismCell,
    type Notebook,
    type NotebookCell,
    type ObjectCell,
} from "catcolab-documents";
import { For } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

import { type ModelDocument } from "catcolab-document-methods";

type SolidStoreHandle = {
    doc: ModelDocument;
    setDoc: SetStoreFunction<ModelDocument>;
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    createHandle(initialDoc) {
        const [doc, setDoc] = createStore<ModelDocument>(initialDoc);
        return { doc, setDoc };
    },
    viewDocument: (handle) => handle.doc,
    changeDocument: (handle, fn) => handle.setDoc(produce<ModelDocument>(fn)),
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
};

const solidBinder = createBinder(solidStore);

/**
 * Build a creatable shape whose single morphism is a `Hom` over a list of the
 * given `kind` (a Petri-net transition is the `SymmetricList` case). The list
 * `kind` is the *only* thing that varies across these shapes: the object type,
 * morphism structure and endpoint arity (a list of objects) are identical,
 * which is what lets the one consumer below drive all of them.
 */
function listShape<const K extends ListKind>(theory: string, kind: K) {
    const obType = { tag: "Basic", content: "Object" } as const;
    return defineShape({
        theory,
        objects: { Node: obType },
        morphisms: { Edge: homList(kind, obType) },
    });
}

// ---------------------------------------------------------------------------
// The consumer is written against a *precise* sub-shape, not `Notebook<Shape>`.
// It states exactly what it accepts: `Node` objects, and `Edge` morphisms whose
// endpoints are a list — of *any* `ListKind` — of those nodes. Because the
// contract pins the endpoints to a list, every endpoint the consumer reads is a
// typed `ObjectCell[]`; there is no `ObjectCell | ObjectCell[]` widening to
// normalize, and a notebook whose edges are single objects is rejected by the
// compiler rather than handled at runtime.
// ---------------------------------------------------------------------------

const node = { tag: "Basic", content: "Object" } as const;

/** The accepted edge: a `Hom` whose endpoints are a list of `node`s, of any
 * {@link ListKind}. Derived from {@link homList} so it never names the wire key
 * itself. */
type ListEdge = ReturnType<typeof homList<ListKind, typeof node>>;

/** The sub-shape the consumer accepts: `Node` objects and list-valued `Edge`s.
 * This is deliberately narrower than `Shape`: it admits exactly the cell types
 * below and nothing else. */
type AcceptsLists = {
    objects: { Node: typeof node };
    morphisms: { Edge: ListEdge };
};

type ListNotebook = Notebook<AcceptsLists, SolidStoreHandle>;
type NodeCell = ObjectCell<typeof node>;
type EdgeCell = MorphismCell<ListEdge>;

const isNode = byObjectType(node);

function ObListEditor(props: { objects: NodeCell[] }) {
    return <span>[{props.objects.map((ob) => ob.name).join(", ")}]</span>;
}

function EdgeCellEditor(props: { notebook: ListNotebook; edge: EdgeCell }) {
    // `dom`/`cod` are typed `NodeCell[]` from the contract: no normalization.
    // Contrived test example: adding an arbitrary but valid input node.
    const runTestMutation = () => {
        const referenced = new Set([...props.edge.dom, ...props.edge.cod].map((ob) => ob.id));
        const input = props.notebook
            .cells()
            .filter(isNode)
            .find((ob) => !referenced.has(ob.id));
        if (input) {
            props.edge.update({ dom: [...props.edge.dom, input] });
        }
    };
    return (
        <li>
            <span class="cell-label">
                Edge: <ObListEditor objects={props.edge.dom} />
                <span> -&gt; </span>
                <ObListEditor objects={props.edge.cod} />
                <span> {props.edge.name}</span>
            </span>
            <button aria-label="run test mutation" onClick={runTestMutation} />
        </li>
    );
}

function NotebookCellEditor(props: { notebook: ListNotebook; cell: NotebookCell<AcceptsLists> }) {
    const cell = props.cell;
    if (cell.kind === CellKind.Morphism) {
        return <EdgeCellEditor notebook={props.notebook} edge={cell} />;
    }
    if (cell.kind === CellKind.Object) {
        return (
            <li>
                <span class="cell-label">Node: {cell.name}</span>
            </li>
        );
    }
    if (cell.kind === CellKind.RichText) {
        return (
            <li>
                <span class="cell-label">Text: {cell.content}</span>
            </li>
        );
    }
    return null;
}

function NotebookEditor(props: { notebook: ListNotebook }) {
    return (
        <section>
            <h1>{props.notebook.name}</h1>
            <ul>
                <For each={props.notebook.cells()}>
                    {(cell) => <NotebookCellEditor notebook={props.notebook} cell={cell} />}
                </For>
            </ul>
        </section>
    );
}

const labelList = (names: string[]) => `<span>[${names.join(", ")}<!---->]</span>`;

const expectedHtml = (domNames: string[]) =>
    "<section><h1>Net</h1><ul>" +
    '<li><span class="cell-label">Node: A</span></li>' +
    '<li><span class="cell-label">Node: B</span></li>' +
    '<li><span class="cell-label">Node: C</span></li>' +
    '<li><span class="cell-label">Edge: ' +
    `${labelList(domNames)}<span> -&gt; </span>${labelList(["C"])}<span> fires</span></span>` +
    '<button aria-label="run test mutation"></button></li></ul></section>';

// One row per kind of list. The morphism structure is identical in each; only
// the list kind differs, so the single consumer above renders and edits them
// all without a line of kind-specific code.
const LIST_KINDS = [
    ["petri-net", "SymmetricList"],
    ["free-monoidal", "List"],
    ["cartesian", "CartesianList"],
    ["cocartesian", "CocartesianList"],
    ["additive", "AdditiveList"],
] as const satisfies ReadonlyArray<readonly [theory: string, kind: ListKind]>;

describe("Precise consumer over different kinds of list", () => {
    for (const [theory, kind] of LIST_KINDS) {
        test(`drives a ${kind} notebook`, () => {
            const shape = listShape(theory, kind);
            const isEdge = byMorphismType(shape.morphisms.Edge);

            const notebook = solidBinder.createNotebook(shape, { name: "Net" });
            const a = notebook.add(shape.objects.Node, { name: "A" });
            notebook.add(shape.objects.Node, { name: "B" });
            const c = notebook.add(shape.objects.Node, { name: "C" });
            notebook.add(shape.morphisms.Edge, { name: "fires", dom: [a], cod: [c] });

            const container = document.createElement("div");
            document.body.appendChild(container);

            // A concrete single-kind notebook satisfies the consumer's contract.
            const dispose = render(() => <NotebookEditor notebook={notebook} />, container);

            expect(container.innerHTML).toBe(expectedHtml(["A"]));

            const appendButton = container.querySelector<HTMLButtonElement>(
                '[aria-label="run test mutation"]',
            )!;
            appendButton.click();
            expect(container.innerHTML).toBe(expectedHtml(["A", "B"]));

            // The mutation round-trips through the store; the typed endpoint is
            // an array, read back without any normalization.
            const edges = notebook.cells().filter(isEdge);
            expect(edges).toHaveLength(1);
            expect(edges[0]!.dom.map((ob) => ob.name)).toEqual(["A", "B"]);
            expect(edges[0]!.cod.map((ob) => ob.name)).toEqual(["C"]);

            // The stored morphism type carries *this* list kind specifically: a
            // guard for a different kind rejects it, so the kind is persisted.
            const otherKind: ListKind = kind === "List" ? "SymmetricList" : "List";
            const isOtherKind = byMorphismType(homList(otherKind, node));
            expect(notebook.cells().filter(isOtherKind)).toHaveLength(0);

            dispose();
            container.remove();
        });
    }

    test("rejects a notebook whose edges are single objects, not lists", () => {
        const singleHomShape = defineShape({
            theory: "single-hom",
            objects: { Node: node },
            morphisms: { Edge: { tag: "Hom", content: node } },
        });
        const singleNotebook = solidBinder.createNotebook(singleHomShape, { name: "Net" });

        // @ts-expect-error A single-object `Hom` is not a list edge: the precise
        // contract refuses a notebook the consumer could not safely drive.
        const _rejected: ListNotebook = singleNotebook;
        void _rejected;
    });
});
