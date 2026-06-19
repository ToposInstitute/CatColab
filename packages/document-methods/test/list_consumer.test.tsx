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
    type Shape,
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

type GenericNotebook = Notebook<Shape, SolidStoreHandle>;

/** Predicate that narrows an untyped cell handle to an object cell. */
type ObjectGuard = (cell: { readonly kind: symbol }) => cell is ObjectCell;
/** Predicate that narrows an untyped cell handle to a morphism cell. */
type MorphismGuard = (cell: { readonly kind: symbol }) => cell is MorphismCell;

/**
 * Normalize an endpoint into a list. A list morphism always decodes its
 * endpoints to an array, but the *untyped* {@link MorphismCell} the generic
 * consumer reads widens that to `ObjectCell | ObjectCell[]`, so the consumer
 * normalizes rather than assuming a shape — which is exactly why the same code
 * works for every {@link ListKind}.
 */
const asList = (endpoint: ObjectCell | ObjectCell[]): ObjectCell[] =>
    Array.isArray(endpoint) ? endpoint : endpoint ? [endpoint] : [];

function ObListEditor(props: { objects: ObjectCell[] }) {
    return <span>[{props.objects.map((ob) => ob.name).join(", ")}]</span>;
}

function MorphismCellEditor(props: {
    notebook: GenericNotebook;
    morphism: MorphismCell;
    isOb: ObjectGuard;
}) {
    const dom = () => asList(props.morphism.dom);
    const cod = () => asList(props.morphism.cod);
    // Contrived test example: adding an arbitrary but valid input object.
    const runTestMutation = () => {
        const referenced = new Set([...dom(), ...cod()].map((ob) => ob.id));
        const input = props.notebook
            .cells()
            .filter(props.isOb)
            .find((ob) => !referenced.has(ob.id));
        if (input) {
            props.morphism.update({ dom: [...dom(), input] });
        }
    };
    return (
        <li>
            <span class="cell-label">
                Edge: <ObListEditor objects={dom()} />
                <span> -&gt; </span>
                <ObListEditor objects={cod()} />
                <span> {props.morphism.name}</span>
            </span>
            <button aria-label="run test mutation" onClick={runTestMutation} />
        </li>
    );
}

function NotebookCellEditor(props: {
    notebook: GenericNotebook;
    cell: NotebookCell;
    isOb: ObjectGuard;
    isMor: MorphismGuard;
}) {
    const cell = props.cell;
    if (props.isMor(cell)) {
        return <MorphismCellEditor notebook={props.notebook} morphism={cell} isOb={props.isOb} />;
    }
    if (props.isOb(cell)) {
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

function NotebookEditor(props: {
    notebook: GenericNotebook;
    isOb: ObjectGuard;
    isMor: MorphismGuard;
}) {
    return (
        <section>
            <h1>{props.notebook.name}</h1>
            <ul>
                <For each={props.notebook.cells()}>
                    {(cell) => (
                        <NotebookCellEditor
                            notebook={props.notebook}
                            cell={cell}
                            isOb={props.isOb}
                            isMor={props.isMor}
                        />
                    )}
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

describe("Generic consumer over different kinds of list", () => {
    for (const [theory, kind] of LIST_KINDS) {
        test(`drives a ${kind} notebook`, () => {
            const node = { tag: "Basic", content: "Object" } as const;
            const shape = listShape(theory, kind);
            const isOb = byObjectType(shape.objects.Node);
            const isMor = byMorphismType(shape.morphisms.Edge);

            const notebook = solidBinder.createNotebook(shape, { name: "Net" });
            const a = notebook.add(shape.objects.Node, { name: "A" });
            notebook.add(shape.objects.Node, { name: "B" });
            const c = notebook.add(shape.objects.Node, { name: "C" });
            notebook.add(shape.morphisms.Edge, { name: "fires", dom: [a], cod: [c] });

            const container = document.createElement("div");
            document.body.appendChild(container);

            const dispose = render(
                () => <NotebookEditor notebook={notebook} isOb={isOb} isMor={isMor} />,
                container,
            );

            expect(container.innerHTML).toBe(expectedHtml(["A"]));

            const appendButton = container.querySelector<HTMLButtonElement>(
                '[aria-label="run test mutation"]',
            )!;
            appendButton.click();
            expect(container.innerHTML).toBe(expectedHtml(["A", "B"]));

            // The mutation round-trips through the store: the consumer reads the
            // appended object back out of the list endpoint.
            const edges = notebook.cells().filter(isMor);
            expect(edges).toHaveLength(1);
            expect(asList(edges[0]!.dom).map((ob) => ob.name)).toEqual(["A", "B"]);
            expect(asList(edges[0]!.cod).map((ob) => ob.name)).toEqual(["C"]);

            // The stored morphism type carries *this* list kind specifically: a
            // guard for a different kind rejects it, so the kind is persisted.
            const otherKind: ListKind = kind === "List" ? "SymmetricList" : "List";
            const isOtherKind = byMorphismType(homList(otherKind, node));
            expect(notebook.cells().filter(isOtherKind)).toHaveLength(0);

            dispose();
            container.remove();
        });
    }
});
