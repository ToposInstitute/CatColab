<!-- verifier:prepend-to-following -->

```ts
import {
    createBinder,
    CellKind,
    defineMorphism,
    defineObject,
    defineShape,
    type Notebook,
} from "catcolab-documents";
const binder = createBinder();
```

<!-- verifier:prepend-to-following -->

```ts
const Object = defineObject({ tag: "Basic", content: "Object" });
const Aspect = defineMorphism({
    tag: "Hom",
    content: { tag: "Basic", content: "Object" },
});

const Olog = defineShape({
    theory: "simple-olog",
    getCoreTheory: async () => {
        const { ThCategory } = await import("catlog-wasm");
        return new ThCategory().theory();
    },
    objects: [Object],
    morphisms: [Aspect],
});

const notebook = await binder.createNotebook(Olog, { title: "A generic notebook" });

// A wide view whose `cells()` yields the untyped `NotebookCell` union.
const generic: Notebook = notebook;
```

```ts
console.log("name:", notebook.title);
console.log("theory:", notebook.document.theory);
```

```
name: A generic notebook
theory: simple-olog
```

<!-- verifier:prepend-to-following -->

```ts
const source = notebook.add(Object, { label: "A" });
const target = notebook.add(Object, { label: "B" });

const arrow = notebook.add(Aspect, {
    label: "has",
    from: source,
    to: target,
});
```

<!-- verifier:prepend-to-following -->

```ts
source.update({ label: "Source" });
const sourceCopy = source.duplicate();
sourceCopy.update({ label: "Source copy" });
```

```ts
console.log("source:", source.label);
console.log("source copy:", sourceCopy.label);
```

```
source: Source
source copy: Source copy
```

```ts
for (const cell of generic.cells()) {
    switch (cell.kind) {
        case CellKind.Object:
            console.log("object:", cell.label, "type:", cell.type.obType.content);
            break;
        case CellKind.Morphism:
            console.log("morphism:", cell.label, "type tag:", cell.type.morType.tag);
            break;
    }
}
```

```
object: Source type: Object
object: B type: Object
morphism: has type tag: Hom
object: Source copy type: Object
```

```ts
console.log(generic.cells().length);

sourceCopy.delete();
arrow.moveTo(0);

console.log(
    "order:",
    generic
        .cells()
        .map((cell) => (cell.kind === CellKind.RichText ? cell.content : cell.label))
        .join(", "),
);
console.log(generic.cells().length);
```

```
4
order: has, Source, B
3
```

```ts
const result = await notebook.validate();
console.log("valid:", result.tag === "Ok");
if (result.tag === "Ok") {
    console.log("objects:", result.content.obGenerators().length);
    console.log("morphisms:", result.content.morGenerators().length);
}
```

```
valid: true
objects: 3
morphisms: 1
```

<!-- verifier:reset -->

```ts
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder, CellKind, type Notebook } from "catcolab-documents";
const binder = createBinder();

const typed = await binder.createNotebook(SimpleOlog, { title: "An Olog" });
typed.add(Type, { label: "A" });

// A notebook over the full Olog shape is assignable to a notebook over the
// widest shape, so code that does not need the static typing can take it.
const generic: Notebook = typed;
generic.update({ title: "Renamed via generic interface" });

console.log("name:", generic.title);
console.log("objects:", generic.cells().filter((cell) => cell.kind === CellKind.Object).length);
```

```
name: Renamed via generic interface
objects: 1
```

### Validation and migration require a core theory

A shape elaborates into its `getCoreTheory`, so `validate()` and `migrateTo()` are
only available on a notebook whose shape declares one. A shape with a `theory`
but no `getCoreTheory` can still create and edit notebooks, but calling either is a
compile error. The same requirement applies to an instantiation's `model`: an
instantiation resolves its referenced model by validating it, so only a
validatable notebook (one whose shape declares a `getCoreTheory`) may be used.

<!-- verifier:reset -->

```ts
import {
    createBinder,
    defineMorphism,
    defineObject,
    defineShape,
    Instantiation,
} from "catcolab-documents";
const binder = createBinder();

const Obj = defineObject({ tag: "Basic", content: "Object" });
const Mor = defineMorphism({ tag: "Hom", content: Obj.obType });

const NoCore = defineShape({ theory: "no-core", objects: [Obj], morphisms: [Mor] });
const WithCore = defineShape({
    theory: "with-core",
    getCoreTheory: async () => {
        const { ThCategory } = await import("catlog-wasm");
        return new ThCategory().theory();
    },
    objects: [Obj],
    morphisms: [Mor],
});

const noCore = await binder.createNotebook(NoCore, { title: "No core theory" });
const host = await binder.createNotebook(WithCore, { title: "Host" });
const core = await binder.createNotebook(WithCore, { title: "Core model" });

// @ts-expect-error A shape without a `getCoreTheory` cannot be validated.
await noCore.validate();

// @ts-expect-error A shape without a `getCoreTheory` cannot be migrated.
await noCore.migrateTo(NoCore);

// A validatable notebook is accepted as an instantiation model.
host.add(Instantiation, { label: "ok", model: core });

// @ts-expect-error An instantiation model must be validatable (its shape needs a `getCoreTheory`).
host.add(Instantiation, { label: "bad", model: noCore });

// @ts-expect-error An instantiation model must be a notebook, not a link.
host.add(Instantiation, { label: "linked", model: { _id: "x", _version: null, _server: "" } });
```
