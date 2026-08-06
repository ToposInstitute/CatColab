import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import {
    createContext,
    createSignal,
    For,
    onCleanup,
    Show,
    useContext,
    type Accessor,
} from "solid-js";
import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
/* oxlint-disable unicorn/consistent-function-scoping */
import {
    type NotebookCell,
    CellKind,
    createBinder,
    defineMorphism,
    defineObject,
    defineShape,
    type DocumentStore,
    type ModelValidationResult,
    type Notebook,
    RichText,
    type ValidatableNotebook,
} from "catcolab-documents";
import type { DblModel, ObType, QualifiedName } from "catlog-wasm";
import { selfResolving } from "./self_resolving";

type SolidStoreHandle = {
    draftDoc: Document;
    docView: Document;
    setDocView: SetStoreFunction<Document>;
    listeners: Set<() => void>;
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    async createHandle(initialDoc) {
        const draftDoc = structuredClone(initialDoc as Document);
        const [docView, setDocView] = createStore<Document>(initialDoc as Document);
        return { draftDoc, docView, setDocView, listeners: new Set() };
    },
    getDocumentView: (handle) => handle.docView,
    changeDocument: (handle, fn) => {
        fn(handle.draftDoc);
        handle.setDocView(reconcile(structuredClone(handle.draftDoc), { key: "id" }));
        for (const listener of Array.from(handle.listeners)) {
            listener();
        }
    },
    subscribe: (handle, callback) => {
        handle.listeners.add(callback);
        return () => {
            handle.listeners.delete(callback);
        };
    },
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
    ...selfResolving<SolidStoreHandle>(),
};

const solidBinder = createBinder(solidStore);

const entity = defineObject({ tag: "Basic", content: "Entity" });
const attrType = defineObject({ tag: "Basic", content: "AttrType" });
const attr = defineMorphism(
    { tag: "Basic", content: "Attr" },
    { domain: entity.obType, codomain: attrType.obType },
);

const AttrPickerShape = defineShape({
    objects: [entity, attrType],
    morphisms: [attr],
    informal: [RichText],
});

type AttrPickerNotebook = Notebook<typeof AttrPickerShape, SolidStoreHandle> &
    ValidatableNotebook<SolidStoreHandle>;

/** Poll until `predicate` holds (validation results arrive asynchronously). */
async function until(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
        if (Date.now() > deadline) {
            throw new Error("condition not met in time");
        }
        await new Promise((resolve) => setTimeout(resolve));
    }
}

function label(model: DblModel, id: QualifiedName): string {
    return model.obGeneratorLabel(id)?.join(".") ?? "?";
}

function filteredCompletions(model: DblModel, obType: ObType, text: string): QualifiedName[] {
    const needle = text.toLowerCase();
    return model
        .obGeneratorsWithType(obType)
        .filter((id) => label(model, id).toLowerCase().includes(needle));
}

function codomainLabel(model: DblModel | undefined, morphism: NotebookCell<typeof attr>): string {
    if (!model) {
        return "?";
    }
    const cod = model?.morPresentation(morphism.id)?.cod;
    return cod?.tag === "Basic" ? label(model, cod.content) : "?";
}

describe("shape-driven completion picker", () => {
    test("uses a generic shape with elaborated-model completions", async () => {
        let validation!: Accessor<ModelValidationResult | undefined>;
        let model!: () => DblModel | undefined;

        type EditorContextValue = {
            notebook: AttrPickerNotebook;
            model: Accessor<DblModel>;
        };
        const EditorContext = createContext<EditorContextValue>();
        const useEditor = () => {
            const context = useContext(EditorContext);
            if (!context) {
                throw new Error("Schema editor context is missing.");
            }
            return context;
        };

        function CompletionPicker(props: {
            obType: ObType;
            selected: string;
            onSelect: (id: QualifiedName) => void;
        }) {
            const editor = useEditor();
            const [text, setText] = createSignal("");
            const [open, setOpen] = createSignal(true);
            const [presumptive, setPresumptive] = createSignal(0);
            const completions = () => filteredCompletions(editor.model(), props.obType, text());
            const select = (id: QualifiedName) => {
                props.onSelect(id);
                setText(label(editor.model(), id));
                setOpen(false);
            };
            const movePresumptive = (delta: number) => {
                const options = completions();
                if (options.length === 0) {
                    return;
                }
                setPresumptive((index) => (index + delta + options.length) % options.length);
            };
            const selectPresumptive = () => {
                const id = completions()[presumptive()];
                if (id) {
                    select(id);
                }
            };

            return (
                <span class="picker">
                    <span class="selected">{props.selected}</span>
                    <input
                        aria-label="attribute type"
                        value={text()}
                        onFocus={() => setOpen(true)}
                        onInput={(event) => {
                            setText(event.currentTarget.value);
                            setPresumptive(0);
                            setOpen(true);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowDown") {
                                event.preventDefault();
                                movePresumptive(1);
                            } else if (event.key === "ArrowUp") {
                                event.preventDefault();
                                movePresumptive(-1);
                            } else if (event.key === "Enter") {
                                event.preventDefault();
                                selectPresumptive();
                            } else if (event.key === "Escape") {
                                setOpen(false);
                            }
                        }}
                    />
                    <Show when={open()}>
                        <ul class="completion-list">
                            <For each={completions()}>
                                {(id, index) => (
                                    <li
                                        classList={{ presumptive: index() === presumptive() }}
                                        onMouseDown={() => select(id)}
                                    >
                                        {label(editor.model(), id)}
                                    </li>
                                )}
                            </For>
                        </ul>
                    </Show>
                </span>
            );
        }

        function AttrCellEditor(props: { attribute: NotebookCell<typeof attr> }) {
            const editor = useEditor();
            const selectCodomain = (id: QualifiedName) => {
                const result = editor.notebook.get(attrType, id);
                if (result.tag === "Ok") {
                    props.attribute.update({ to: result.content });
                }
            };

            return (
                <li>
                    <span class="cell-label">
                        Attr: {props.attribute.label}: {props.attribute.from.label} -&gt;{" "}
                        <CompletionPicker
                            obType={attrType.obType}
                            selected={codomainLabel(editor.model(), props.attribute)}
                            onSelect={selectCodomain}
                        />
                    </span>
                </li>
            );
        }

        function SchemaCellEditor(props: { cell: NotebookCell<typeof AttrPickerShape> }) {
            if (props.cell.kind === CellKind.Morphism) {
                return <AttrCellEditor attribute={props.cell} />;
            }
            if (props.cell.kind === CellKind.Object) {
                const label = props.cell.type === attrType ? "AttrType" : "Entity";
                return (
                    <li>
                        <span class="cell-label">
                            {label}: {props.cell.label}
                        </span>
                    </li>
                );
            }
            if (props.cell.kind === CellKind.RichText) {
                return (
                    <li>
                        <span class="cell-label">Text: {props.cell.content}</span>
                    </li>
                );
            }
            return null;
        }

        function SchemaNotebookEditor(props: { notebook: AttrPickerNotebook }) {
            // Reactive validation: `onValidate` re-validates on changes to any
            // document the validation depends on (this notebook and anything it
            // instantiates) and delivers only results that actually differ, so
            // wiring it to a signal is all a component needs.
            const [result, setResult] = createSignal<ModelValidationResult>();
            const unsubscribe = props.notebook.onValidate(setResult);
            onCleanup(unsubscribe);
            const currentModel = () => {
                const validated = result();
                return validated?.tag === "Ok" ? validated.content : undefined;
            };

            validation = result;
            model = currentModel;

            return (
                <section>
                    <h1>{props.notebook.title}</h1>
                    <Show when={currentModel()} fallback={<p>Validating...</p>}>
                        {(m) => (
                            <EditorContext.Provider value={{ notebook: props.notebook, model: m }}>
                                <ul>
                                    <For each={props.notebook.cellsOf(AttrPickerShape)}>
                                        {(cell) => <SchemaCellEditor cell={cell} />}
                                    </For>
                                </ul>
                            </EditorContext.Provider>
                        )}
                    </Show>
                </section>
            );
        }

        const notebook = await solidBinder.createNotebook(SimpleSchema, {
            title: "Company schema",
        });
        const person = notebook.add(Entity, { label: "Person" });
        const string = notebook.add(AttrType, { label: "String" });
        notebook.add(AttrType, { label: "Integer" });
        notebook.add(AttrType, { label: "Boolean" });
        const name = notebook.add(Attr, { label: "name", from: person, to: string });

        const container = document.createElement("div");
        document.body.appendChild(container);
        const dispose = render(() => <SchemaNotebookEditor notebook={notebook} />, container);

        await until(() => validation() !== undefined);
        expect(validation()?.tag).toBe("Ok");
        expect(codomainLabel(model(), name)).toBe("String");
        expect(
            [...container.querySelectorAll(".completion-list li")].map((li) => li.textContent),
        ).toEqual(["String", "Integer", "Boolean"]);
        expect(container.textContent).toContain("Entity: Person");
        expect(container.textContent).not.toContain("PersonString");

        const input = container.querySelector<HTMLInputElement>(
            'input[aria-label="attribute type"]',
        )!;
        input.value = "in";
        input.dispatchEvent(new InputEvent("input", { bubbles: true }));
        expect(
            [...container.querySelectorAll(".completion-list li")].map((li) => li.textContent),
        ).toEqual(["String", "Integer"]);

        input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(container.querySelector(".completion-list li.presumptive")?.textContent).toBe(
            "Integer",
        );

        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await until(() => codomainLabel(model(), name) === "Integer");

        const updatedInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="attribute type"]',
        )!;
        updatedInput.value = "";
        updatedInput.dispatchEvent(new InputEvent("input", { bubbles: true }));
        updatedInput.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
        const stringItem = [...container.querySelectorAll(".completion-list li")].find(
            (li) => li.textContent === "String",
        )!;
        stringItem.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        await until(() => codomainLabel(model(), name) === "String");

        notebook.add(AttrType, { label: "Date" });
        await until(() => {
            const m = model();
            return !!m && filteredCompletions(m, attrType.obType, "").length === 4;
        });
        container
            .querySelector<HTMLInputElement>('input[aria-label="attribute type"]')!
            .dispatchEvent(new FocusEvent("focus", { bubbles: true }));
        expect(
            [...container.querySelectorAll(".completion-list li")].map((li) => li.textContent),
        ).toEqual(["String", "Integer", "Boolean", "Date"]);

        dispose();
        container.remove();
    });
});
