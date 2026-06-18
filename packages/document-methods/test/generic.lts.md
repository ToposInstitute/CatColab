<!-- verifier:prepend-to-following -->

```ts
import type { MorType, ObType } from "catcolab-document-types";
import { binder, CellKind, defineShape, type Notebook } from "catcolab-documents";
```

A shape that declares no object or morphism types still carries a `theory`, so it
is creatable; cells are then added from bare `ObType`/`MorType` values through
`addObject`/`addMorphism`. Since the shape declares no types, `cells()` over it
yields only rich-text handles; to read the bare-added cells back as untyped
object and morphism handles, view the notebook through the generic `Notebook`
interface, whose `cells()` is the widest union.

<!-- verifier:prepend-to-following -->

```ts
const EmptyOlog = defineShape({ theory: "simple-olog", objects: {}, morphisms: {} });
const notebook = binder.createNotebook(EmptyOlog, { name: "A generic notebook" });

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
const Object: ObType = { tag: "Basic", content: "Object" };
const Aspect: MorType = { tag: "Hom", content: { tag: "Basic", content: "Object" } };

const source = notebook.addObject(Object, { name: "A" });
const target = notebook.addObject(Object, { name: "B" });

const arrow = notebook.addMorphism(Aspect, {
    name: "has",
    dom: source,
    cod: target,
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
            console.log("object:", cell.name, "type:", cell.type.content);
            break;
        case CellKind.Morphism:
            console.log("morphism:", cell.name, "type tag:", cell.type.tag);
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
import { ThCategory } from "catlog-wasm";

const result = notebook.validate(new ThCategory().theory());
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
