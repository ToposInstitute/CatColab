# A simple morphism editor with completions

This example is a smaller companion to the object editor and the completion
pickers: one component that lists a notebook's morphisms and lets the user
repoint each morphism's target from a completion list. The completions come
from the _validated_ model, not from raw cells, following the same pipeline as
the frontend:

1. validate the notebook to get the elaborated `DblModel`,
2. ask the model for object generators of the endpoint's type,
3. filter their labels by the user's text,
4. on selection, resolve the chosen id back to a typed cell and update the
   morphism endpoint.

The component is written against a minimal shape — one basic object type and
the `Hom` morphism over it — so any structurally matching logic can use it. The
notebook we render below is a `SimpleOlog`.

<!-- verifier:prepend-to-following -->

```tsx
import {
    type NotebookCell,
    createBinder,
    defineMorphism,
    defineObject,
    defineShape,
    type DocumentStore,
    type ModelValidationResult,
    type Notebook,
    type ValidatableNotebook,
} from "catcolab-documents";
import { createSignal, For, onCleanup, Show, type Accessor } from "solid-js";
import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { delegateEvents, render } from "solid-js/web";

import type { Document } from "catcolab-document-types";
import type { DblModel, QualifiedName } from "catlog-wasm";
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

The shape declares just what the editor touches: `Node` objects and `Arrow`
morphisms between them. It has no theory, so validation is required from the
concrete notebook passed in — hence the `ValidatableNotebook` intersection in
the prop type.

<!-- verifier:prepend-to-following -->

```tsx
const Node = defineObject({ tag: "Basic", content: "Object" });
const Arrow = defineMorphism({ tag: "Hom", content: Node.obType });

const ArrowEditorShape = defineShape({
    objects: [Node],
    morphisms: [Arrow],
});

type ArrowNotebook = Notebook<typeof ArrowEditorShape> & ValidatableNotebook;
```

The editor uses `onValidate` to re-validate whenever anything the validation
depends on changes, delivering only actual result changes. While the model is
available, each morphism row shows its endpoints and a completion list of every
object generator whose label matches the filter text; clicking a completion
resolves the id back to a typed `Node` cell and updates the morphism's `to`
endpoint.

<!-- verifier:prepend-to-following -->

```tsx
function label(model: DblModel, id: QualifiedName): string {
    return model.obGeneratorLabel(id)?.join(".") ?? "?";
}

// Global for testing
let testCurrentModel!: () => DblModel | undefined;

function MorphismEditor(props: { notebook: ArrowNotebook; text: Accessor<string> }) {
    const [validation, setValidation] = createSignal<ModelValidationResult>();
    const unsubscribe = props.notebook.onValidate(setValidation);
    onCleanup(unsubscribe);

    const model = () => {
        const result = validation();
        return result?.tag === "Ok" ? result.content : undefined;
    };
    testCurrentModel = model;

    const completions = (model: DblModel) => {
        const needle = props.text().toLowerCase();
        return model
            .obGeneratorsWithType(Node.obType)
            .filter((id) => label(model, id).toLowerCase().includes(needle));
    };

    const select = (arrow: NotebookCell<typeof Arrow>, id: QualifiedName) => {
        const target = props.notebook.get(Node, id);
        if (target.tag === "Ok") {
            arrow.update({ to: target.content });
        }
    };

    return (
        <section>
            <h1>{props.notebook.title}</h1>
            <Show when={model()} fallback={<p>Validating...</p>}>
                {(m) => (
                    <ul>
                        <For each={props.notebook.cellsOf(Arrow)}>
                            {(arrow) => (
                                <li>
                                    {arrow.label}: {arrow.from.label} -&gt;{" "}
                                    <span class="selected">{arrow.to.label}</span>
                                    <ul class="completions">
                                        <For each={completions(m())}>
                                            {(id) => (
                                                <li onClick={() => select(arrow, id)}>
                                                    {label(m(), id)}
                                                </li>
                                            )}
                                        </For>
                                    </ul>
                                </li>
                            )}
                        </For>
                    </ul>
                )}
            </Show>
        </section>
    );
}
```

Now render a `SimpleOlog` notebook with the generic component, filter the
completions, and click one. The click goes through the delegated `onClick`
handler, so the delegated event type is registered up front (top-level code
here runs before the compiled module's own `delegateEvents` call). Reading the
aspect back through its typed handle shows the repointed target.

```tsx
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";

delegateEvents(["click"]);

async function until(predicate: () => boolean) {
    while (!predicate()) {
        await new Promise((resolve) => setTimeout(resolve));
    }
}

function completionTexts(container: HTMLElement): string {
    return [...container.querySelectorAll(".completions li")]
        .map((li) => li.textContent)
        .join(", ");
}

const olog = await solidBinder.createNotebook(SimpleOlog, { title: "An olog" });
const person = olog.add(Type, { label: "person" });
const city = olog.add(Type, { label: "city" });
olog.add(Type, { label: "country" });
const livesIn = olog.add(Aspect, { label: "lives in", from: person, to: city });

const [text, setText] = createSignal("");
const container = document.createElement("div");
document.body.appendChild(container);
const dispose = render(() => <MorphismEditor notebook={olog} text={text} />, container);

await until(() => testCurrentModel() !== undefined);
console.log("all:", completionTexts(container));

setText("c");
console.log("filtered:", completionTexts(container));

const country = [...container.querySelectorAll<HTMLElement>(".completions li")].find(
    (li) => li.textContent === "country",
);
country?.click();

await until(() => livesIn.to.label === "country");
console.log("selected:", container.querySelector(".selected")?.textContent);
console.log("aspect:", livesIn.from.label, `-[${livesIn.label}]->`, livesIn.to.label);
dispose();
container.remove();
```

```
all: person, city, country
filtered: city, country
selected: country
aspect: person -[lives in]-> country
```
