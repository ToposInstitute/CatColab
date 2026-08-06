# A basic object editor for ologs and Petri nets

This example shows a small object editor written once and reused across logics.
The component is not written against any particular logic: it defines the shapes
it works with — one with a single object type `{ tag: "Basic", content:
"Object" }`, one with `{ tag: "Basic", content: "Entity" }`, both with no
morphisms — and types its notebook prop by their union. The shape match is
structural, and a notebook matching _any_ member of the union is accepted:

- `SimpleOlog`'s `Type` and `PetriNet`'s `Place` are both basic objects of type
  `Object`, so olog and Petri-net notebooks match the `Object` member,
- `SimpleSchema` declares `Entity` (alongside `AttrType`), a superset of the
  `Entity` member's objects, so a schema notebook is assignable too.

Cells the shapes do not declare — olog aspects, Petri-net transitions, schema
attributes — are never selected by `cellsOf`, yet they share state with the
edited objects: renaming a place through the editor is immediately visible
through a typed transition handle.

<!-- verifier:prepend-to-following -->

```tsx
import {
    createBinder,
    defineObject,
    defineShape,
    type DocumentStore,
    type Notebook,
} from "catcolab-documents";
import { For } from "solid-js";
import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { delegateEvents, render } from "solid-js/web";

import type { Document } from "catcolab-document-types";

type SolidStoreHandle = {
    draftDoc: Document;
    docView: Document;
    setDocView: SetStoreFunction<Document>;
    listeners: Set<() => void>;
};

const solidStoreIds = new WeakMap<SolidStoreHandle, string>();
const solidStoreIdFor = (handle: SolidStoreHandle): string => {
    let id = solidStoreIds.get(handle);
    if (!id) {
        id = crypto.randomUUID();
        solidStoreIds.set(handle, id);
    }
    return id;
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
    getDocumentRef: (handle) => ({ id: solidStoreIdFor(handle), version: null, server: "" }),
    getHandle: async () => ({
        tag: "Err" as const,
        content: [{ message: "This store cannot resolve references." }],
    }),
};

const solidBinder = createBinder(solidStore);
```

The editor itself. The shape names the cell types the component may see, and
the notebook prop is typed by it, so any notebook with a structurally matching
object type — and only such a notebook — can be passed in. It renders one
rename input per basic object and an add button. Nothing here mentions ologs or
Petri nets. The shape has no `theory`, so it can describe notebooks but not
originate them; creating the documents stays with the concrete logics below.

<!-- verifier:prepend-to-following -->

```tsx
const BasicObject = defineObject({ tag: "Basic", content: "Object" });

const BasicObjectShape = defineShape({
    objects: [BasicObject],
});

const EntityObject = defineObject({ tag: "Basic", content: "Entity" });

const EntityObjectShape = defineShape({
    objects: [EntityObject],
});

function ObjectEditor(props: {
    notebook: Notebook<typeof BasicObjectShape | typeof EntityObjectShape>;
}) {
    const addObject = () => {
        if (props.notebook.supports(BasicObject)) {
            props.notebook.add(BasicObject, { label: "new object" });
        } else if (props.notebook.supports(EntityObject)) {
            props.notebook.add(EntityObject, { label: "new entity" });
        }
    };

    return (
        <section>
            <h1>{props.notebook.title}</h1>
            <ul>
                <For
                    each={[
                        ...props.notebook.cellsOf(BasicObject),
                        ...props.notebook.cellsOf(EntityObject),
                    ]}
                >
                    {(object) => (
                        <li>
                            <input
                                aria-label={`rename ${object.label}`}
                                value={object.label}
                                onInput={(event) =>
                                    object.update({ label: event.currentTarget.value })
                                }
                            />
                        </li>
                    )}
                </For>
            </ul>
            <button onClick={addObject}>Add</button>
        </section>
    );
}
```

A few helpers drive the rendered editor through the DOM, the way a user would:
typing into a rename input and clicking the add button.

<!-- verifier:prepend-to-following -->

```tsx
function names(container: HTMLElement): string {
    return [...container.querySelectorAll("input")].map((input) => input.value).join(", ");
}

function renameThrough(container: HTMLElement, from: string, to: string) {
    const input = container.querySelector<HTMLInputElement>(`[aria-label="rename ${from}"]`);
    if (!input) {
        throw new Error(`No rename input for ${from}.`);
    }
    input.value = to;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}
```

## Editing an olog

The editor lists the olog's types and renames one. The aspect between them is
untouched by the editor, but reading its endpoints back through the typed
handle shows the rename, because both views read the same cell.

```tsx
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";

const olog = await solidBinder.createNotebook(SimpleOlog, { title: "An olog" });
const person = olog.add(Type, { label: "person" });
const city = olog.add(Type, { label: "city" });
const livesIn = olog.add(Aspect, { label: "lives in", from: person, to: city });

const container = document.createElement("div");
document.body.appendChild(container);
const dispose = render(() => <ObjectEditor notebook={olog} />, container);

console.log(names(container));

renameThrough(container, "person", "inhabitant");
container.querySelector("button")?.click();
console.log(names(container));

console.log("aspect:", livesIn.from.label, `-[${livesIn.label}]->`, livesIn.to.label);

dispose();
container.remove();
```

```
person, city
inhabitant, city, new object
aspect: inhabitant -[lives in]-> city
```

## Editing a Petri net

The same component, unchanged, edits the places of a Petri net. The transition
is never rendered, but its endpoints resolve to the renamed place cells.

```tsx
import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";

const net = await solidBinder.createNotebook(PetriNet, { title: "Reaction network" });
const substrate = net.add(Place, { label: "substrate" });
const product = net.add(Place, { label: "product" });
const converts = net.add(Transition, { label: "converts", from: [substrate], to: [product] });

const container = document.createElement("div");
document.body.appendChild(container);
const dispose = render(() => <ObjectEditor notebook={net} />, container);

console.log(names(container));

renameThrough(container, "substrate", "reactant");
console.log(names(container));

console.log(
    "transition:",
    converts.from.map((place) => place.label).join(" + "),
    `-[${converts.label}]->`,
    converts.to.map((place) => place.label).join(" + "),
);

dispose();
container.remove();
```

```
substrate, product
reactant, product
transition: reactant -[converts]-> product
```

## Editing a schema notebook

The same component edits a schema's entities through its `Entity` member shape.
The editor renders only the cells its shapes declare: the `string` attribute
type and the `full name` attribute are invisible to it, so the entity is the
single rename input. Renaming the entity and clicking add go through the
`EntityObject` branch — the notebook does not support `BasicObject`, which
`supports` discovers at runtime — and the attribute's endpoints read back the
rename.

```tsx
import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";

const schema = await solidBinder.createNotebook(SimpleSchema, { title: "A schema" });
const employee = schema.add(Entity, { label: "employee" });
const str = schema.add(AttrType, { label: "string" });
const fullName = schema.add(Attr, { label: "full name", from: employee, to: str });

const container = document.createElement("div");
document.body.appendChild(container);
const dispose = render(() => <ObjectEditor notebook={schema} />, container);

console.log(names(container));

renameThrough(container, "employee", "person");
container.querySelector("button")?.click();
console.log(names(container));

console.log("attr:", fullName.from.label, `-[${fullName.label}]->`, fullName.to.label);

dispose();
container.remove();
```

```
employee
person, new entity
attr: person -[full name]-> string
```
