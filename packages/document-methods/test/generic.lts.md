<!-- verifier:prepend-to-following -->

```ts
import type { MorType, ObType } from "catcolab-document-types";
import { binder, CellKind } from "catcolab-documents";
```

<!-- verifier:prepend-to-following -->

```ts
const notebook = binder.createGenericNotebook("simple-olog", { name: "A generic notebook" });
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
for (const cell of notebook.cells()) {
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
console.log(notebook.cells().length);

sourceCopy.delete();
arrow.moveTo(0);

console.log(
    "order:",
    notebook
        .cells()
        .map((cell) => (cell.kind === CellKind.RichText ? cell.content : cell.name))
        .join(", "),
);
console.log(notebook.cells().length);
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
import { binder, CellKind, type GenericNotebook } from "catcolab-documents";

const typed = binder.createNotebook(SimpleOlog, { name: "An Olog" });
typed.add(Type, { name: "A" });

const generic: GenericNotebook = typed;
generic.update({ name: "Renamed via generic interface" });

console.log("name:", generic.name);
console.log("objects:", generic.cells().filter((cell) => cell.kind === CellKind.Object).length);
```

```
name: Renamed via generic interface
objects: 1
```
