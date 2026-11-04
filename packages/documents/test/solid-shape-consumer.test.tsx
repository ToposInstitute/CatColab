import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
import { For } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

// RFC-0006 "Use with SolidJS — Shape consumer".
//
// Components consume the shape they need: a generic shape over the basic
// object, a symmetric-list morphism and rich text works for any structurally
// compatible notebook, here a Petri net.
import {
    CellKind,
    createBinder,
    defineMorphism,
    defineObject,
    defineShape,
    type Notebook,
    type NotebookCell,
    RichText,
} from "catcolab-documents";
import { solidStore } from "./stores/solid-store-fixture";

const basicObject = defineObject({ tag: "Basic", content: "Object" });
const symmetricListMorphism = defineMorphism(
    { tag: "Hom", content: basicObject.obType },
    {
        domain: { apply: { tag: "Basic", content: "tensor" }, modality: "SymmetricList" },
        codomain: { apply: { tag: "Basic", content: "tensor" }, modality: "SymmetricList" },
    },
);

type BasicObCell = NotebookCell<typeof basicObject>;
type SymmetricListCell = NotebookCell<typeof symmetricListMorphism>;

const GenericShape = defineShape({
    objects: [basicObject],
    morphisms: [symmetricListMorphism],
    informal: [RichText],
});

function ObListEditor(props: { objects: BasicObCell[] }) {
    return <span>[{props.objects.map((place) => place.label).join(", ")}]</span>;
}

function MorphismCellEditor(props: {
    notebook: Notebook<typeof GenericShape>;
    morphism: SymmetricListCell;
}) {
    // Contrived test example: adding an arbitrary but valid input place
    const runTestMutation = () => {
        const referenced = new Set(
            [...props.morphism.from, ...props.morphism.to].map((ob) => ob.id),
        );
        const input = props.notebook.cellsOf(basicObject).find((ob) => !referenced.has(ob.id));
        if (input) {
            props.morphism.update({ from: [...props.morphism.from, input] });
        }
    };
    return (
        <li>
            <span class="cell-label">
                Transition: <ObListEditor objects={props.morphism.from} />
                <span> -&gt; </span>
                <ObListEditor objects={props.morphism.to} />
                <span>{props.morphism.label}</span>
            </span>
            <button aria-label="run test mutation" onClick={runTestMutation} />
        </li>
    );
}

function ModelCellEditor(props: {
    notebook: Notebook<typeof GenericShape>;
    cell: NotebookCell<typeof GenericShape>;
}) {
    const cell = props.cell;
    if (cell.kind === CellKind.Morphism) {
        return <MorphismCellEditor notebook={props.notebook} morphism={cell} />;
    }
    if (cell.kind === CellKind.Object) {
        return (
            <li>
                <span class="cell-label">Place: {cell.label}</span>
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

function ModelNotebookEditor(props: { notebook: Notebook<typeof GenericShape> }) {
    return (
        <section>
            <h1>{props.notebook.title}</h1>
            <ul>
                <For each={props.notebook.cellsOf(GenericShape)}>
                    {(cell) => <ModelCellEditor notebook={props.notebook} cell={cell} />}
                </For>
            </ul>
        </section>
    );
}

describe.skip("SolidJS shape consumer", () => {
    test("a generic editor renders a Petri net notebook and mutates it reactively", async () => {
        const solidBinder = createBinder(solidStore);

        const notebook = await solidBinder.createNotebook(PetriNet, { title: "Petri net" });
        const a = notebook.add(Place, { label: "A" });
        notebook.add(Place, { label: "B" });
        const c = notebook.add(Place, { label: "C" });
        notebook.add(Transition, { label: "fires", from: [a], to: [c] });

        const container = document.createElement("div");
        document.body.appendChild(container);

        const dispose = render(() => <ModelNotebookEditor notebook={notebook} />, container);

        expect(container.innerHTML).toBe(
            "<section><h1>Petri net</h1><ul>" +
                '<li><span class="cell-label">Place: A</span></li>' +
                '<li><span class="cell-label">Place: B</span></li>' +
                '<li><span class="cell-label">Place: C</span></li>' +
                '<li><span class="cell-label">Transition: <span>[A<!---->]</span>' +
                "<span> -&gt; </span><span>[C<!---->]</span><span>fires</span></span>" +
                '<button aria-label="run test mutation"></button></li>' +
                "</ul></section>",
        );

        const appendButton = container.querySelector<HTMLButtonElement>(
            '[aria-label="run test mutation"]',
        );
        expect(appendButton).not.toBeNull();
        appendButton?.click();

        expect(container.innerHTML).toBe(
            "<section><h1>Petri net</h1><ul>" +
                '<li><span class="cell-label">Place: A</span></li>' +
                '<li><span class="cell-label">Place: B</span></li>' +
                '<li><span class="cell-label">Place: C</span></li>' +
                '<li><span class="cell-label">Transition: <span>[A, B<!---->]</span>' +
                "<span> -&gt; </span><span>[C<!---->]</span><span>fires</span></span>" +
                '<button aria-label="run test mutation"></button></li>' +
                "</ul></section>",
        );

        dispose();
        container.remove();
    });
});
