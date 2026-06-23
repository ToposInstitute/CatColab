<!-- verifier:prepend-to-following -->

```ts
import {
    binder,
    CellKind,
    defineMorphism,
    defineObject,
    defineShape,
    type Notebook,
} from "catcolab-documents";
```

<!-- verifier:prepend-to-following -->

```ts
import { ThCategory } from "catlog-wasm";

const Object = defineObject({ tag: "Basic", content: "Object" });
const Aspect = defineMorphism({
    tag: "Hom",
    content: { tag: "Basic", content: "Object" },
});

const Olog = defineShape({
    theory: "simple-olog",
    coreTheory: new ThCategory().theory(),
    objects: [Object],
    morphisms: [Aspect],
});

const notebook = binder.createNotebook(Olog, { name: "A generic notebook" });

// A wide view whose `cells()` yields the untyped `NotebookCell` union.
const generic: Notebook = notebook;
```

```ts
console.log("name:", notebook.name);
console.log("theory:", notebook.document.theory);
```

```
name: A generic notebook
theory: simple-olog
```

<!-- verifier:prepend-to-following -->

```ts
const source = notebook.add(Object, { name: "A" });
const target = notebook.add(Object, { name: "B" });

const arrow = notebook.add(Aspect, {
    name: "has",
    from: source,
    to: target,
});
```

<!-- verifier:prepend-to-following -->

```ts
source.update({ name: "Source" });
const sourceCopy = source.duplicate();
sourceCopy.update({ name: "Source copy" });
```

```ts
console.log("source:", source.name);
console.log("source copy:", sourceCopy.name);
```

```
source: Source
source copy: Source copy
```

```ts
for (const cell of generic.cells()) {
    switch (cell.kind) {
        case CellKind.Object:
            console.log("object:", cell.name, "type:", cell.type.obType.content);
            break;
        case CellKind.Morphism:
            console.log("morphism:", cell.name, "type tag:", cell.type.morType.tag);
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
        .map((cell) => (cell.kind === CellKind.RichText ? cell.content : cell.name))
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
console.log("tag:", result.tag);
if (result.tag === "Valid") {
    console.log("objects:", result.model.obGenerators().length);
    console.log("morphisms:", result.model.morGenerators().length);
}
```

```
tag: Valid
objects: 3
morphisms: 1
```

<!-- verifier:reset -->

```ts
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { binder, CellKind, type Notebook } from "catcolab-documents";

const typed = binder.createNotebook(SimpleOlog, { name: "An Olog" });
typed.add(Type, { name: "A" });

// A notebook over the full Olog shape is assignable to a notebook over the
// widest shape, so code that does not need the static typing can take it.
const generic: Notebook = typed;
generic.update({ name: "Renamed via generic interface" });

console.log("name:", generic.name);
console.log("objects:", generic.cells().filter((cell) => cell.kind === CellKind.Object).length);
```

```
name: Renamed via generic interface
objects: 1
```

### Validation and migration require a core theory

A shape elaborates into its `coreTheory`, so `validate()` and `migrateTo()` are
only available on a notebook whose shape declares one. A shape with a `theory`
but no `coreTheory` can still create and edit notebooks, but calling either is a
compile error. The same requirement applies to an instantiation's `model`: an
instantiation resolves its referenced model by validating it, so only a
validatable notebook (one whose shape declares a `coreTheory`) may be used.

<!-- verifier:reset -->

```ts
import {
    binder,
    defineMorphism,
    defineObject,
    defineShape,
    Instantiation,
} from "catcolab-documents";
import { ThCategory } from "catlog-wasm";

const Obj = defineObject({ tag: "Basic", content: "Object" });
const Mor = defineMorphism({ tag: "Hom", content: Obj.obType });

const NoCore = defineShape({ theory: "no-core", objects: [Obj], morphisms: [Mor] });
const WithCore = defineShape({
    theory: "with-core",
    coreTheory: new ThCategory().theory(),
    objects: [Obj],
    morphisms: [Mor],
});

const noCore = binder.createNotebook(NoCore, { name: "No core theory" });
const host = binder.createNotebook(WithCore, { name: "Host" });
const core = binder.createNotebook(WithCore, { name: "Core model" });

// @ts-expect-error A shape without a `coreTheory` cannot be validated.
await noCore.validate();

// @ts-expect-error A shape without a `coreTheory` cannot be migrated.
await noCore.migrateTo(NoCore);

// A validatable notebook is accepted as an instantiation model.
host.add(Instantiation, { name: "ok", model: core });

// @ts-expect-error An instantiation model must be validatable (its shape needs a `coreTheory`).
host.add(Instantiation, { name: "bad", model: noCore });
```
