import {
    byMorphismType,
    byObjectType,
    CellKind,
    createBinder,
    type DocumentStore,
    type MorphismCell,
    type Notebook,
    type NotebookCell,
    type ObjectCell,
    defineShape,
} from "catcolab-documents";
import {
    PetriNet,
    Place,
    type PlaceCell,
    Transition,
    type TransitionCell,
} from "catcolab-logics/petri-net";
// Each test case defines its own small editor components so the three
// independent comparison sections stay self-contained; these helpers
// intentionally live inside the test bodies rather than at module scope.
/* eslint-disable unicorn/consistent-function-scoping */
import { For } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

import { Model, type ModelDocument, Nb } from "catcolab-document-methods";
import type { Cell, ModelJudgment, MorType, Ob, ObType } from "catcolab-document-types";

// The three sections below build the same small Petri-net notebook editor in
// three different styles — the current raw-document frontend, the generic
// `catcolab-documents` API, and the typed-logic API — and assert that each
// renders the same HTML, both on initial render and after appending an input
// place to the transition. This is the vitest port of the former
// `petri_net_editor_comparison.lts.md`.

const EXPECTED_INITIAL =
    "<section><h1>Petri net</h1><ul>" +
    '<li><span class="cell-label">Place: A</span></li>' +
    '<li><span class="cell-label">Place: B</span></li>' +
    '<li><span class="cell-label">Place: C</span></li>' +
    '<li><span class="cell-label">Transition: <span>[A<!---->]</span><span> -&gt; </span>' +
    "<span>[C<!---->]</span><span> fires</span></span>" +
    '<button aria-label="append input place"></button></li></ul></section>';

const EXPECTED_AFTER_APPEND =
    "<section><h1>Petri net</h1><ul>" +
    '<li><span class="cell-label">Place: A</span></li>' +
    '<li><span class="cell-label">Place: B</span></li>' +
    '<li><span class="cell-label">Place: C</span></li>' +
    '<li><span class="cell-label">Transition: <span>[A, B<!---->]</span><span> -&gt; </span>' +
    "<span>[C<!---->]</span><span> fires</span></span>" +
    '<button aria-label="append input place"></button></li></ul></section>';

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

describe("Petri-net editor comparison", () => {
    test("current frontend, reduced", () => {
        type CurrentPetriNetNotebook = {
            doc: ModelDocument;
            changeDoc(fn: (doc: ModelDocument) => void): void;
        };

        type CurrentPlaceDecl = Extract<ModelJudgment, { tag: "object" }>;
        type CurrentTransitionDecl = Extract<ModelJudgment, { tag: "morphism" }>;

        type CurrentCellConstructor = {
            name: string;
            construct: () => Cell<ModelJudgment>;
        };

        const placeObType: ObType = { tag: "Basic", content: "Object" };
        const transitionMorType: MorType = {
            tag: "Hom",
            content: {
                tag: "ModeApp",
                content: { modality: "SymmetricList", obType: placeObType },
            },
        };
        const tensorOp = { tag: "Basic", content: "tensor" } as const;

        const placeCellConstructor: CurrentCellConstructor = {
            name: "Place",
            construct: () => Nb.newFormalCell(Model.newObjectDecl(placeObType)),
        };

        const transitionCellConstructor: CurrentCellConstructor = {
            name: "Transition",
            construct: () => Nb.newFormalCell(Model.newMorphismDecl(transitionMorType)),
        };

        function createCurrentPetriNetNotebook(data: { name: string }): CurrentPetriNetNotebook {
            const initialDoc = Model.newModelDocument({ theory: "petri-net" });
            initialDoc.name = data.name;

            const [doc, setDoc] = createStore<ModelDocument>(initialDoc);
            return {
                doc,
                changeDoc: (fn) => setDoc(produce<ModelDocument>(fn)),
            };
        }

        function appendConstructedCell(
            notebook: CurrentPetriNetNotebook,
            cell: Cell<ModelJudgment>,
        ) {
            notebook.changeDoc((doc) => {
                Nb.appendCell(doc.notebook, cell);
            });
        }

        // Layer 1: the tensor `App` wrapper, mirroring `wrapApp`/`unwrapApp`.
        function unwrapApp(ob: Ob | null, applyOp: typeof tensorOp): Ob | null {
            if (ob?.tag === "App" && ob.content.op.content === applyOp.content) {
                return ob.content.ob;
            }
            return null;
        }

        function wrapApp(ob: Ob, applyOp: typeof tensorOp): Ob {
            return { tag: "App", content: { op: applyOp, ob } };
        }

        // Layer 2: the `List` modality, mirroring `extractObList`/`buildObList`.
        function extractObList(ob: Ob | null): Array<Ob | null> {
            return ob?.tag === "List" ? ob.content.objects : [];
        }

        function buildObList(modality: "SymmetricList", objects: Array<Ob | null>): Ob {
            return { tag: "List", content: { modality, objects } };
        }

        function encodePlaceIds(placeIds: string[]): Ob {
            const objects = placeIds.map((id): Ob => ({ tag: "Basic", content: id }));
            return wrapApp(buildObList("SymmetricList", objects), tensorOp);
        }

        function placeIds(ob: Ob | null): string[] {
            return extractObList(unwrapApp(ob, tensorOp)).flatMap((item) =>
                item?.tag === "Basic" ? [item.content] : [],
            );
        }

        function addCurrentPlace(
            notebook: CurrentPetriNetNotebook,
            args: { name: string },
        ): CurrentPlaceDecl {
            const cell = placeCellConstructor.construct();
            if (cell.tag !== "formal" || cell.content.tag !== "object") {
                throw new Error("Place constructor produced the wrong cell shape");
            }
            cell.content.name = args.name;
            appendConstructedCell(notebook, cell);
            return cell.content;
        }

        function addCurrentTransition(
            notebook: CurrentPetriNetNotebook,
            args: {
                name: string;
                dom: CurrentPlaceDecl[];
                cod: CurrentPlaceDecl[];
            },
        ): CurrentTransitionDecl {
            const cell = transitionCellConstructor.construct();
            if (cell.tag !== "formal" || cell.content.tag !== "morphism") {
                throw new Error("Transition constructor produced the wrong cell shape");
            }
            cell.content.name = args.name;
            cell.content.dom = encodePlaceIds(args.dom.map((place) => place.id));
            cell.content.cod = encodePlaceIds(args.cod.map((place) => place.id));
            appendConstructedCell(notebook, cell);
            return cell.content;
        }

        function updateCurrentTransition(
            notebook: CurrentPetriNetNotebook,
            transition: CurrentTransitionDecl,
            fn: (transition: CurrentTransitionDecl) => void,
        ) {
            notebook.changeDoc((doc) => {
                for (const judgment of Nb.getFormalContent(doc.notebook)) {
                    if (judgment.tag === "morphism" && judgment.id === transition.id) {
                        fn(judgment);
                        return;
                    }
                }
            });
        }

        function appendCurrentInput(
            notebook: CurrentPetriNetNotebook,
            transition: CurrentTransitionDecl,
            place: CurrentPlaceDecl,
        ) {
            updateCurrentTransition(notebook, transition, (transition) => {
                transition.dom = encodePlaceIds([...placeIds(transition.dom), place.id]);
            });
        }

        function placeName(notebook: CurrentPetriNetNotebook, id: string): string {
            for (const judgment of Nb.getFormalContent(notebook.doc.notebook)) {
                if (judgment.tag === "object" && judgment.id === id) {
                    return judgment.name;
                }
            }
            return "?";
        }

        function InlinePlaceListEditor(props: {
            placeIds: string[];
            placeName: (id: string) => string;
        }) {
            return <span>[{props.placeIds.map(props.placeName).join(", ")}]</span>;
        }

        function CurrentTransitionCell(props: {
            notebook: CurrentPetriNetNotebook;
            transition: CurrentTransitionDecl;
            appendInput: () => void;
        }) {
            const name = (id: string) => placeName(props.notebook, id);
            return (
                <li>
                    <span class="cell-label">
                        Transition:{" "}
                        <InlinePlaceListEditor
                            placeIds={placeIds(props.transition.dom)}
                            placeName={name}
                        />
                        <span> -&gt; </span>
                        <InlinePlaceListEditor
                            placeIds={placeIds(props.transition.cod)}
                            placeName={name}
                        />
                        <span> {props.transition.name}</span>
                    </span>
                    <button aria-label="append input place" onClick={props.appendInput} />
                </li>
            );
        }

        function CurrentPetriNetCell(props: {
            notebook: CurrentPetriNetNotebook;
            cell: Cell<ModelJudgment>;
            appendInput: () => void;
        }) {
            if (props.cell.tag !== "formal") {
                return (
                    <li>
                        <span class="cell-label">Text: {String(props.cell.content)}</span>
                    </li>
                );
            }
            switch (props.cell.content.tag) {
                case "object":
                    return (
                        <li>
                            <span class="cell-label">Place: {props.cell.content.name}</span>
                        </li>
                    );
                case "morphism":
                    return (
                        <CurrentTransitionCell
                            notebook={props.notebook}
                            transition={props.cell.content}
                            appendInput={props.appendInput}
                        />
                    );
                case "equation":
                    return (
                        <li>
                            <span class="cell-label">Equation: {props.cell.content.name}</span>
                        </li>
                    );
                case "instantiation":
                    return (
                        <li>
                            <span class="cell-label">Instantiate: {props.cell.content.name}</span>
                        </li>
                    );
            }
        }

        function CurrentPetriNetEditor(props: {
            notebook: CurrentPetriNetNotebook;
            appendInput: () => void;
        }) {
            return (
                <section>
                    <h1>{props.notebook.doc.name}</h1>
                    <ul>
                        <For each={Nb.getCells(props.notebook.doc.notebook)}>
                            {(cell) => (
                                <CurrentPetriNetCell
                                    notebook={props.notebook}
                                    cell={cell}
                                    appendInput={props.appendInput}
                                />
                            )}
                        </For>
                    </ul>
                </section>
            );
        }

        const notebook = createCurrentPetriNetNotebook({ name: "Petri net" });
        const a = addCurrentPlace(notebook, { name: "A" });
        const b = addCurrentPlace(notebook, { name: "B" });
        const c = addCurrentPlace(notebook, { name: "C" });
        const transition = addCurrentTransition(notebook, { name: "fires", dom: [a], cod: [c] });

        const container = document.createElement("div");
        document.body.appendChild(container);

        const dispose = render(
            () => (
                <CurrentPetriNetEditor
                    notebook={notebook}
                    appendInput={() => appendCurrentInput(notebook, transition, b)}
                />
            ),
            container,
        );

        expect(container.innerHTML).toBe(EXPECTED_INITIAL);

        appendCurrentInput(notebook, transition, b);
        expect(container.innerHTML).toBe(EXPECTED_AFTER_APPEND);

        dispose();
        container.remove();
    });

    test("catcolab-documents, generic consumer", () => {
        // Bare runtime type values, declared `as const` so a transition's
        // list-valued endpoint arity survives inference.
        const ob = { tag: "Basic", content: "Object" } as const;
        const mor = {
            tag: "Hom",
            content: {
                tag: "ModeApp",
                content: { modality: "SymmetricList", obType: ob },
            },
        } as const;

        type ObCell = ObjectCell<typeof ob>;
        type MorCell = MorphismCell<typeof mor>;

        const GenericShape = defineShape({
            objects: { ob },
            morphisms: { mor },
        });

        const isOb = byObjectType(ob);
        const isMor = byMorphismType(mor);

        function InlineListEditor(props: { places: ObCell[] }) {
            return <span>[{props.places.map((place) => place.name).join(", ")}]</span>;
        }

        function MorCellView(props: { transition: MorCell; appendInput: () => void }) {
            return (
                <li>
                    <span class="cell-label">
                        Transition: <InlineListEditor places={props.transition.dom} />
                        <span> -&gt; </span>
                        <InlineListEditor places={props.transition.cod} />
                        <span> {props.transition.name}</span>
                    </span>
                    <button aria-label="append input place" onClick={props.appendInput} />
                </li>
            );
        }

        function CellView(props: { cell: NotebookCell; appendInput: () => void }) {
            const cell = props.cell;
            if (isMor(cell)) {
                return <MorCellView transition={cell} appendInput={props.appendInput} />;
            }
            if (isOb(cell)) {
                return (
                    <li>
                        <span class="cell-label">Place: {cell.name}</span>
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

        function ModelEditor(props: {
            notebook: Notebook<typeof GenericShape, SolidStoreHandle>;
            appendInput: () => void;
        }) {
            return (
                <section>
                    <h1>{props.notebook.name}</h1>
                    <ul>
                        <For each={props.notebook.cells()}>
                            {(cell) => <CellView cell={cell} appendInput={props.appendInput} />}
                        </For>
                    </ul>
                </section>
            );
        }

        function appendGenericInput(transition: MorCell, place: ObCell) {
            transition.update({ dom: [...transition.dom, place] });
        }

        const notebook = solidBinder.createNotebook(PetriNet, { name: "Petri net" });
        const a = notebook.addObject(Place, { name: "A" });
        notebook.addObject(Place, { name: "B" });
        const c = notebook.addObject(Place, { name: "C" });
        notebook.addMorphism(Transition, { name: "fires", dom: [a], cod: [c] });

        // The runtime API returns untyped handles; recover precise ones via the guards.
        const transition = notebook.cells().find(byMorphismType(Transition))!;
        const input = notebook.cells().filter(byObjectType(Place))[1]!;

        const container = document.createElement("div");
        document.body.appendChild(container);

        const dispose = render(
            () => (
                <ModelEditor
                    notebook={notebook}
                    appendInput={() => appendGenericInput(transition, input)}
                />
            ),
            container,
        );

        expect(container.innerHTML).toBe(EXPECTED_INITIAL);

        appendGenericInput(transition, input);
        expect(container.innerHTML).toBe(EXPECTED_AFTER_APPEND);

        dispose();
        container.remove();
    });

    test("catcolab-documents, typed logic", () => {
        const isPlace = byObjectType(Place);
        const isTransition = byMorphismType(Transition);

        function InlinePlaceListEditor(props: { places: PlaceCell[] }) {
            return <span>[{props.places.map((place) => place.name).join(", ")}]</span>;
        }

        function TransitionCell(props: {
            transition: TransitionCell;
            appendInput: () => void;
        }) {
            return (
                <li>
                    <span class="cell-label">
                        Transition: <InlinePlaceListEditor places={props.transition.dom} />
                        <span> -&gt; </span>
                        <InlinePlaceListEditor places={props.transition.cod} />
                        <span> {props.transition.name}</span>
                    </span>
                    <button aria-label="append input place" onClick={props.appendInput} />
                </li>
            );
        }

        function PetriNetCell(props: { cell: NotebookCell; appendInput: () => void }) {
            const cell = props.cell;
            if (isTransition(cell)) {
                return <TransitionCell transition={cell} appendInput={props.appendInput} />;
            }
            if (isPlace(cell)) {
                return (
                    <li>
                        <span class="cell-label">Place: {cell.name}</span>
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

        function PetriNetEditor(props: {
            notebook: Notebook<typeof PetriNet, SolidStoreHandle>;
            appendInput: () => void;
        }) {
            return (
                <section>
                    <h1>{props.notebook.name}</h1>
                    <ul>
                        <For each={props.notebook.cells()}>
                            {(cell) => (
                                <PetriNetCell
                                    cell={cell}
                                    appendInput={props.appendInput}
                                />
                            )}
                        </For>
                    </ul>
                </section>
            );
        }

        const notebook = solidBinder.createNotebook(PetriNet, { name: "Petri net" });
        const a = notebook.add(Place, { name: "A" });
        const b = notebook.add(Place, { name: "B" });
        const c = notebook.add(Place, { name: "C" });
        const transition = notebook.add(Transition, { name: "fires", dom: [a], cod: [c] });

        const container = document.createElement("div");
        document.body.appendChild(container);

        const dispose = render(
            () => (
                <PetriNetEditor
                    notebook={notebook}
                    appendInput={() => transition.update({ dom: [...transition.dom, b] })}
                />
            ),
            container,
        );

        expect(container.innerHTML).toBe(EXPECTED_INITIAL);

        transition.update({ dom: [...transition.dom, b] });
        expect(container.innerHTML).toBe(EXPECTED_AFTER_APPEND);

        dispose();
        container.remove();
    });
});
