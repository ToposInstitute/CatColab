// Each test case defines its editor components and helpers inside the `test()`
// body so that the three scenarios stay fully self-contained and comparable.
// Some of these are pure (don't capture parent-scope variables), which trips
// `consistent-function-scoping`; hoisting them out would scatter each scenario.
/* oxlint-disable unicorn/consistent-function-scoping */
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
import { For } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

import { Model, type ModelDocument, Nb } from "catcolab-document-methods";
import type { Cell, ModelJudgment, MorType, Ob, ObType } from "catcolab-document-types";

const EXPECTED_INITIAL =
    "<section><h1>Petri net</h1><ul>" +
    '<li><span class="cell-label">Place: A</span></li>' +
    '<li><span class="cell-label">Place: B</span></li>' +
    '<li><span class="cell-label">Place: C</span></li>' +
    '<li><span class="cell-label">Transition: <span>[A<!---->]</span><span> -&gt; </span>' +
    "<span>[C<!---->]</span><span> fires</span></span>" +
    '<button aria-label="run test mutation"></button></li></ul></section>';

const EXPECTED_AFTER_APPEND =
    "<section><h1>Petri net</h1><ul>" +
    '<li><span class="cell-label">Place: A</span></li>' +
    '<li><span class="cell-label">Place: B</span></li>' +
    '<li><span class="cell-label">Place: C</span></li>' +
    '<li><span class="cell-label">Transition: <span>[A, B<!---->]</span><span> -&gt; </span>' +
    "<span>[C<!---->]</span><span> fires</span></span>" +
    '<button aria-label="run test mutation"></button></li></ul></section>';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deep-clone a value, replacing every UUID with a stable label assigned by
 * first encounter (`uuid:0`, `uuid:1`, ...). The mapping is shared across the
 * whole value, so equal UUIDs collapse to equal labels: a morphism endpoint
 * that references an object's id stays equal to that object's id, while the
 * random values themselves are erased. UUID-valued object keys (the
 * `cellContents` map keys) are normalized with the same map.
 */
function normalizeUuids(value: unknown): unknown {
    const labels = new Map<string, string>();
    const label = (s: string): string => {
        let l = labels.get(s);
        if (l === undefined) {
            l = `uuid:${labels.size}`;
            labels.set(s, l);
        }
        return l;
    };
    const walk = (v: unknown): unknown => {
        if (typeof v === "string") {
            return UUID_RE.test(v) ? label(v) : v;
        }
        if (Array.isArray(v)) {
            return v.map(walk);
        }
        if (v && typeof v === "object") {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(v as Record<string, unknown>)) {
                const nk = UUID_RE.test(k) ? label(k) : k;
                out[nk] = walk((v as Record<string, unknown>)[k]);
            }
            return out;
        }
        return v;
    };
    return walk(value);
}

/**
 * The notebook all three tests build (places A, B, C and a transition `fires`),
 * after the editor's "run test mutation" button has wired place B into the
 * transition's domain, so `dom: [A, B]` and `cod: [C]`. UUIDs are normalized by
 * {@link normalizeUuids}; the labels `uuid:4`, `uuid:5`, `uuid:6` are the object
 * *judgment* ids of A, B, C, so the transition's `dom`/`cod` references below
 * verify the wiring produced by the component, not just the presence of some
 * object.
 */
const EXPECTED_NOTEBOOK_JSON = {
    name: "Petri net",
    type: "model",
    theory: "petri-net",
    notebook: {
        cellOrder: ["uuid:0", "uuid:1", "uuid:2", "uuid:3"],
        cellContents: {
            "uuid:0": {
                tag: "formal",
                id: "uuid:0",
                content: {
                    tag: "object",
                    id: "uuid:4",
                    name: "A",
                    obType: { tag: "Basic", content: "Object" },
                },
            },
            "uuid:1": {
                tag: "formal",
                id: "uuid:1",
                content: {
                    tag: "object",
                    id: "uuid:5",
                    name: "B",
                    obType: { tag: "Basic", content: "Object" },
                },
            },
            "uuid:2": {
                tag: "formal",
                id: "uuid:2",
                content: {
                    tag: "object",
                    id: "uuid:6",
                    name: "C",
                    obType: { tag: "Basic", content: "Object" },
                },
            },
            "uuid:3": {
                tag: "formal",
                id: "uuid:3",
                content: {
                    tag: "morphism",
                    id: "uuid:7",
                    name: "fires",
                    morType: {
                        tag: "Hom",
                        content: {
                            tag: "ModeApp",
                            content: {
                                modality: "SymmetricList",
                                obType: { tag: "Basic", content: "Object" },
                            },
                        },
                    },
                    dom: {
                        tag: "App",
                        content: {
                            op: { tag: "Basic", content: "tensor" },
                            ob: {
                                tag: "List",
                                content: {
                                    modality: "SymmetricList",
                                    objects: [
                                        { tag: "Basic", content: "uuid:4" },
                                        { tag: "Basic", content: "uuid:5" },
                                    ],
                                },
                            },
                        },
                    },
                    cod: {
                        tag: "App",
                        content: {
                            op: { tag: "Basic", content: "tensor" },
                            ob: {
                                tag: "List",
                                content: {
                                    modality: "SymmetricList",
                                    objects: [{ tag: "Basic", content: "uuid:6" }],
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    version: "2",
};

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
        type CurrentNotebook = {
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

        function createCurrentPetriNetNotebook(data: { name: string }): CurrentNotebook {
            const initialDoc = Model.newModelDocument({ theory: "petri-net" });
            initialDoc.name = data.name;

            const [doc, setDoc] = createStore<ModelDocument>(initialDoc);
            return {
                doc,
                changeDoc: (fn) => setDoc(produce<ModelDocument>(fn)),
            };
        }

        function appendConstructedCell(notebook: CurrentNotebook, cell: Cell<ModelJudgment>) {
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
            notebook: CurrentNotebook,
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
            notebook: CurrentNotebook,
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
            notebook: CurrentNotebook,
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
            notebook: CurrentNotebook,
            transition: CurrentTransitionDecl,
            place: CurrentPlaceDecl,
        ) {
            updateCurrentTransition(notebook, transition, (transition) => {
                transition.dom = encodePlaceIds([...placeIds(transition.dom), place.id]);
            });
        }

        function placeName(notebook: CurrentNotebook, id: string): string {
            for (const judgment of Nb.getFormalContent(notebook.doc.notebook)) {
                if (judgment.tag === "object" && judgment.id === id) {
                    return judgment.name;
                }
            }
            return "?";
        }

        function ObListEditor(props: { placeIds: string[]; placeName: (id: string) => string }) {
            return <span>[{props.placeIds.map(props.placeName).join(", ")}]</span>;
        }

        function MorphismCellEditor(props: {
            notebook: CurrentNotebook;
            transition: CurrentTransitionDecl;
        }) {
            const name = (id: string) => placeName(props.notebook, id);
            // Contrived test example: adding an arbitrary but valid input place
            const runTestMutation = () => {
                const referenced = new Set([
                    ...placeIds(props.transition.dom),
                    ...placeIds(props.transition.cod),
                ]);
                for (const judgment of Nb.getFormalContent(props.notebook.doc.notebook)) {
                    if (judgment.tag === "object" && !referenced.has(judgment.id)) {
                        appendCurrentInput(props.notebook, props.transition, judgment);
                        return;
                    }
                }
            };
            return (
                <li>
                    <span class="cell-label">
                        Transition:{" "}
                        <ObListEditor placeIds={placeIds(props.transition.dom)} placeName={name} />
                        <span> -&gt; </span>
                        <ObListEditor placeIds={placeIds(props.transition.cod)} placeName={name} />
                        <span> {props.transition.name}</span>
                    </span>
                    <button aria-label="run test mutation" onClick={runTestMutation} />
                </li>
            );
        }

        function ModelCellEditor(props: { notebook: CurrentNotebook; cell: Cell<ModelJudgment> }) {
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
                        <MorphismCellEditor
                            notebook={props.notebook}
                            transition={props.cell.content}
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

        function ModelNotebookEditor(props: { notebook: CurrentNotebook }) {
            return (
                <section>
                    <h1>{props.notebook.doc.name}</h1>
                    <ul>
                        <For each={Nb.getCells(props.notebook.doc.notebook)}>
                            {(cell) => <ModelCellEditor notebook={props.notebook} cell={cell} />}
                        </For>
                    </ul>
                </section>
            );
        }

        const notebook = createCurrentPetriNetNotebook({ name: "Petri net" });
        const a = addCurrentPlace(notebook, { name: "A" });
        addCurrentPlace(notebook, { name: "B" });
        const c = addCurrentPlace(notebook, { name: "C" });
        addCurrentTransition(notebook, { name: "fires", dom: [a], cod: [c] });

        const container = document.createElement("div");
        document.body.appendChild(container);

        const dispose = render(() => <ModelNotebookEditor notebook={notebook} />, container);

        expect(container.innerHTML).toBe(EXPECTED_INITIAL);

        const appendButton = container.querySelector<HTMLButtonElement>(
            '[aria-label="run test mutation"]',
        )!;
        appendButton.click();
        expect(container.innerHTML).toBe(EXPECTED_AFTER_APPEND);

        expect(normalizeUuids(structuredClone(unwrap(notebook.doc)))).toEqual(
            EXPECTED_NOTEBOOK_JSON,
        );

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
            notebook: Notebook<typeof PetriNet, SolidStoreHandle>;
            transition: TransitionCell;
        }) {
            // Contrived test example: adding an arbitrary but valid input place
            const runTestMutation = () => {
                const referenced = new Set(
                    [...props.transition.dom, ...props.transition.cod].map((place) => place.id),
                );
                const input = props.notebook
                    .cells()
                    .filter(isPlace)
                    .find((place) => !referenced.has(place.id));
                if (input) {
                    props.transition.update({ dom: [...props.transition.dom, input] });
                }
            };
            return (
                <li>
                    <span class="cell-label">
                        Transition: <InlinePlaceListEditor places={props.transition.dom} />
                        <span> -&gt; </span>
                        <InlinePlaceListEditor places={props.transition.cod} />
                        <span> {props.transition.name}</span>
                    </span>
                    <button aria-label="run test mutation" onClick={runTestMutation} />
                </li>
            );
        }

        function PetriNetCell(props: {
            notebook: Notebook<typeof PetriNet, SolidStoreHandle>;
            cell: NotebookCell<typeof PetriNet>;
        }) {
            const cell = props.cell;
            if (isTransition(cell)) {
                return <TransitionCell notebook={props.notebook} transition={cell} />;
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

        function PetriNetEditor(props: { notebook: Notebook<typeof PetriNet, SolidStoreHandle> }) {
            return (
                <section>
                    <h1>{props.notebook.name}</h1>
                    <ul>
                        <For each={props.notebook.cellsOf(PetriNet)}>
                            {(cell) => <PetriNetCell notebook={props.notebook} cell={cell} />}
                        </For>
                    </ul>
                </section>
            );
        }

        const notebook = solidBinder.createNotebook(PetriNet, { name: "Petri net" });
        const a = notebook.add(Place, { name: "A" });
        notebook.add(Place, { name: "B" });
        const c = notebook.add(Place, { name: "C" });
        notebook.add(Transition, { name: "fires", dom: [a], cod: [c] });

        const container = document.createElement("div");
        document.body.appendChild(container);

        const dispose = render(() => <PetriNetEditor notebook={notebook} />, container);

        expect(container.innerHTML).toBe(EXPECTED_INITIAL);

        const appendButton = container.querySelector<HTMLButtonElement>(
            '[aria-label="run test mutation"]',
        )!;
        appendButton.click();
        expect(container.innerHTML).toBe(EXPECTED_AFTER_APPEND);

        expect(normalizeUuids(notebook.dump())).toEqual(EXPECTED_NOTEBOOK_JSON);

        dispose();
        container.remove();
    });

    test("catcolab-documents, generic consumer", () => {
        const basicObject = { tag: "Basic", content: "Object" } as const;
        const symmetricListMorphism = {
            tag: "Hom",
            content: {
                tag: "ModeApp",
                content: { modality: "SymmetricList", obType: basicObject },
            },
        } as const;

        type BasicObCell = ObjectCell<typeof basicObject>;
        type SymmetricListCell = MorphismCell<typeof symmetricListMorphism>;

        const GenericShape = defineShape({
            objects: { basicObject },
            morphisms: { symmetricListMorphism },
        });

        const isOb = byObjectType(basicObject);
        const isMor = byMorphismType(symmetricListMorphism);

        function ObListEditor(props: { objects: BasicObCell[] }) {
            return <span>[{props.objects.map((place) => place.name).join(", ")}]</span>;
        }

        function MorphismCellEditor(props: {
            notebook: Notebook<typeof GenericShape, SolidStoreHandle>;
            morphism: SymmetricListCell;
        }) {
            // Contrived test example: adding an arbitrary but valid input place
            const runTestMutation = () => {
                const referenced = new Set(
                    [...props.morphism.dom, ...props.morphism.cod].map((ob) => ob.id),
                );
                const input = props.notebook
                    .cells()
                    .filter(isOb)
                    .find((ob) => !referenced.has(ob.id));
                if (input) {
                    props.morphism.update({ dom: [...props.morphism.dom, input] });
                }
            };
            return (
                <li>
                    <span class="cell-label">
                        Transition: <ObListEditor objects={props.morphism.dom} />
                        <span> -&gt; </span>
                        <ObListEditor objects={props.morphism.cod} />
                        <span> {props.morphism.name}</span>
                    </span>
                    <button aria-label="run test mutation" onClick={runTestMutation} />
                </li>
            );
        }

        function ModelCellEditor(props: {
            notebook: Notebook<typeof GenericShape, SolidStoreHandle>;
            cell: NotebookCell<typeof GenericShape>;
        }) {
            const cell = props.cell;
            if (isMor(cell)) {
                return <MorphismCellEditor notebook={props.notebook} morphism={cell} />;
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

        function ModelNotebookEditor(props: {
            notebook: Notebook<typeof GenericShape, SolidStoreHandle>;
        }) {
            return (
                <section>
                    <h1>{props.notebook.name}</h1>
                    <ul>
                        <For each={props.notebook.cellsOf(GenericShape)}>
                            {(cell) => <ModelCellEditor notebook={props.notebook} cell={cell} />}
                        </For>
                    </ul>
                </section>
            );
        }

        const notebook = solidBinder.createNotebook(PetriNet, { name: "Petri net" });
        const a = notebook.add(Place, { name: "A" });
        notebook.add(Place, { name: "B" });
        const c = notebook.add(Place, { name: "C" });
        notebook.add(Transition, { name: "fires", dom: [a], cod: [c] });

        const container = document.createElement("div");
        document.body.appendChild(container);

        const dispose = render(() => <ModelNotebookEditor notebook={notebook} />, container);

        expect(container.innerHTML).toBe(EXPECTED_INITIAL);

        const appendButton = container.querySelector<HTMLButtonElement>(
            '[aria-label="run test mutation"]',
        )!;
        appendButton.click();
        expect(container.innerHTML).toBe(EXPECTED_AFTER_APPEND);

        expect(normalizeUuids(notebook.dump())).toEqual(EXPECTED_NOTEBOOK_JSON);

        dispose();
        container.remove();
    });
});
