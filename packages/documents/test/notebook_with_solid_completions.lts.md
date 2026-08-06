# SolidJS completion pickers

<!-- verifier:prepend-to-following -->

```tsx
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

import type { Document } from "catcolab-document-types";
import type { DblModel, ObType, QualifiedName } from "catlog-wasm";
import { selfResolving } from "documents/test/self_resolving";

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
```

<!-- verifier:prepend-to-following -->

```tsx
const MyEntity = defineObject({ tag: "Basic", content: "Entity" });
const MyAttrType = defineObject({ tag: "Basic", content: "AttrType" });
const MyAttr = defineMorphism(
    { tag: "Basic", content: "Attr" },
    { domain: MyEntity.obType, codomain: MyAttrType.obType },
);

const MyShape = defineShape({
    objects: [MyEntity, MyAttrType],
    morphisms: [MyAttr],
    informal: [RichText],
});

type MyNotebook = Notebook<typeof MyShape>;
```

<!-- verifier:prepend-to-following -->

```tsx
function label(model: DblModel, id: QualifiedName): string {
    return model.obGeneratorLabel(id)?.join(".") ?? "?";
}

function filteredCompletions(model: DblModel, obType: ObType, text: string): QualifiedName[] {
    const needle = text.toLowerCase();
    return model
        .obGeneratorsWithType(obType)
        .filter((id) => label(model, id).toLowerCase().includes(needle));
}

function codomainLabel(model: DblModel | undefined, morphism: NotebookCell<typeof MyAttr>): string {
    if (!model) {
        return "?";
    }
    const cod = model?.morPresentation(morphism.id)?.cod;
    return cod?.tag === "Basic" ? label(model, cod.content) : "?";
}
```

<!-- verifier:prepend-to-following -->

```tsx
type MyContextValue = {
    notebook: MyNotebook;
    model: Accessor<DblModel>;
};

const MyContext = createContext<MyContextValue>();

function useMyContext() {
    const context = useContext(MyContext);
    if (!context) {
        throw new Error("Schema editor context is missing.");
    }
    return context;
}

function selectCodomain(
    notebook: MyNotebook,
    attrCell: NotebookCell<typeof MyAttr>,
    id: QualifiedName,
) {
    const result = notebook.get(MyAttrType, id);
    if (result.tag === "Ok") {
        attrCell.update({ to: result.content });
    }
}

function CompletionPicker(props: {
    obType: ObType;
    selected: string;
    text: Accessor<string>;
    onSelect: (id: QualifiedName) => void;
}) {
    const context = useMyContext();
    return (
        <span class="picker">
            <span class="selected">{props.selected}</span>
            <ul class="completion-list">
                <For each={filteredCompletions(context.model(), props.obType, props.text())}>
                    {(id) => (
                        <li onClick={() => props.onSelect(id)}>{label(context.model(), id)}</li>
                    )}
                </For>
            </ul>
        </span>
    );
}

function MyAttrCellEditor(props: {
    attrCell: NotebookCell<typeof MyAttr>;
    text: Accessor<string>;
}) {
    const context = useMyContext();
    return (
        <li>
            Attr: {props.attrCell.label}: {props.attrCell.from.label} -&gt;{" "}
            <CompletionPicker
                obType={MyAttrType.obType}
                selected={codomainLabel(context.model(), props.attrCell)}
                text={props.text}
                onSelect={(id) => selectCodomain(context.notebook, props.attrCell, id)}
            />
        </li>
    );
}

function MyCellEditor(props: { cell: NotebookCell<typeof MyShape>; text: Accessor<string> }) {
    if (props.cell.kind === CellKind.Morphism) {
        return <MyAttrCellEditor attrCell={props.cell} text={props.text} />;
    }
    if (props.cell.kind === CellKind.Object) {
        const kind = props.cell.type === MyAttrType ? "MyAttrType" : "MyEntity";
        return (
            <li>
                {kind}: {props.cell.label}
            </li>
        );
    }
    if (props.cell.kind === CellKind.RichText) {
        return <li>Text: {props.cell.content}</li>;
    }
    return null;
}

// Globals for testing
let testCurrentModel!: () => DblModel | undefined;

function MyNotebookEditor(props: {
    notebook: MyNotebook & ValidatableNotebook;
    text: Accessor<string>;
}) {
    const [validation, setValidation] = createSignal<ModelValidationResult>();
    const unsubscribe = props.notebook.onValidate(setValidation);
    onCleanup(unsubscribe);

    const model = () => {
        const result = validation();
        return result?.tag === "Ok" ? result.content : undefined;
    };

    testCurrentModel = model;

    return (
        <section>
            <h1>{props.notebook.title}</h1>
            <Show when={model()} fallback={<p>Validating...</p>}>
                {(m) => (
                    <MyContext.Provider value={{ notebook: props.notebook, model: m }}>
                        <ul>
                            <For each={props.notebook.cellsOf(MyShape)}>
                                {(cell) => <MyCellEditor cell={cell} text={props.text} />}
                            </For>
                        </ul>
                    </MyContext.Provider>
                )}
            </Show>
        </section>
    );
}
```

```tsx
import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
async function until(predicate: () => boolean) {
    while (!predicate()) {
        await new Promise((resolve) => setTimeout(resolve));
    }
}

const notebook = await solidBinder.createNotebook(SimpleSchema, { title: "Company schema" });
const person = notebook.add(Entity, { label: "Person" });
const string = notebook.add(AttrType, { label: "String" });
notebook.add(AttrType, { label: "Integer" });
notebook.add(AttrType, { label: "Boolean" });
const name = notebook.add(Attr, { label: "name", from: person, to: string });

const [text, setText] = createSignal("");
const container = document.createElement("div");
document.body.appendChild(container);
const dispose = render(() => <MyNotebookEditor notebook={notebook} text={text} />, container);

await until(() => testCurrentModel() !== undefined);
console.log(
    "all:",
    [...container.querySelectorAll(".completion-list li")].map((li) => li.textContent).join(", "),
);
console.log("codomain:", codomainLabel(testCurrentModel(), name));

setText("in");
console.log(
    "filtered:",
    [...container.querySelectorAll(".completion-list li")].map((li) => li.textContent).join(", "),
);

const model = testCurrentModel();
if (!model) {
    throw new Error("Expected a valid model.");
}
const integer = filteredCompletions(model, MyAttrType.obType, "in").find(
    (id) => label(model, id) === "Integer",
)!;
selectCodomain(notebook, name, integer);
await until(() => codomainLabel(testCurrentModel(), name) === "Integer");
console.log("codomain:", codomainLabel(testCurrentModel(), name));

dispose();
container.remove();
```

```
all: String, Integer, Boolean
codomain: String
filtered: String, Integer
codomain: Integer
```
