<!-- verifier:prepend-to-following -->

```ts
import { binder, CellKind, defineShape, type Notebook } from "catcolab-documents";
```

<!-- verifier:prepend-to-following -->

```ts
const Object = { tag: "Basic", content: "Object" } as const;
const Aspect = { tag: "Hom", content: { tag: "Basic", content: "Object" } } as const;

const Olog = defineShape({
    theory: "simple-olog",
    objects: { Object },
    morphisms: { Aspect },
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
