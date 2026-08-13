<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder, RichText } from "catcolab-documents";
const binder = createBinder();

const model = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

const A = model.add(Type, { label: "A" });
const B = model.add(Type, { label: "B" });
const has = model.add(Aspect, { label: "has", from: A, to: B });
```

<!-- verifier:prepend-to-following -->

```ts
const diagram = await binder.createNotebook(SimpleOlog.Diagram, {
    title: "Olog diagram",
    in: model,
});
```

```ts
console.log("name:", diagram.title);
console.log("theory:", diagram.theory);
```

```
name: Olog diagram
theory: simple-olog
```

## Adding cells over the model

<!-- verifier:prepend-to-following -->

```ts
diagram.add(RichText, { content: "We picture two instances of the olog." });

const x = diagram.add(SimpleOlog.Diagram.Individual, { label: "x", over: A });
const y = diagram.add(SimpleOlog.Diagram.Individual, { label: "y", over: B });
```

```ts
console.log("over:", x.over.label);
console.log("type:", x.type.obType.content);
```

```
over: A
type: Object
```

<!-- verifier:prepend-to-following -->

```ts
const f = diagram.add(SimpleOlog.Diagram.Aspect, { from: x, to: y, over: has });
```

```ts
console.log("over:", f.over.label);
console.log("from:", f.from.label);
console.log("to:", f.to.label);
```

```
over: has
from: x
to: y
```

## Validating a diagram

```ts
const result = await diagram.validate();
console.log("tag:", result.tag);
```

```
tag: Valid
```

```ts
const result = await diagram.validate();
if (result.tag === "Valid") {
    console.log("objects:", result.diagram.obGenerators().length);
    console.log("morphisms:", result.diagram.morGenerators().length);
}
```

```
objects: 2
morphisms: 1
```

```ts
import type { DiagramValidationResult } from "catcolab-documents";

function describe(result: DiagramValidationResult): string {
    switch (result.tag) {
        case "Valid":
            return `valid diagram with ${result.diagram.obGenerators().length} objects`;
        case "Invalid":
            return `invalid diagram with ${result.errors.length} errors`;
        case "Illformed":
            return `ill-formed: ${result.error}`;
    }
}

console.log(describe(await diagram.validate()));
```

```
valid diagram with 2 objects
```

## Iterating through cells

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder, RichText } from "catcolab-documents";
const binder = createBinder();

const model = await binder.createNotebook(SimpleOlog, { title: "An Olog" });
const A = model.add(Type, { label: "A" });
const B = model.add(Type, { label: "B" });
const has = model.add(Aspect, { label: "has", from: A, to: B });

const diagram = await binder.createNotebook(SimpleOlog.Diagram, {
    title: "Olog diagram",
    in: model,
});

diagram.add(RichText, { content: "We picture an instance." });
const x = diagram.add(SimpleOlog.Diagram.Individual, { label: "x", over: A });
const y = diagram.add(SimpleOlog.Diagram.Individual, { label: "y", over: B });
diagram.add(SimpleOlog.Diagram.Aspect, { from: x, to: y, over: has });
```

```ts
import { CellKind } from "catcolab-documents";

for (const cell of diagram.cells()) {
    switch (cell.kind) {
        case CellKind.RichText:
            console.log("text:", cell.content);
            break;
        case CellKind.Object:
            console.log("individual:", cell.label, "over:", cell.over.label);
            break;
        case CellKind.Morphism:
            console.log(
                "aspect over:",
                cell.over.label,
                "from:",
                cell.from.label,
                "to:",
                cell.to.label,
            );
            break;
    }
}
```

```
text: We picture an instance.
individual: x over: A
individual: y over: B
aspect over: has from: x to: y
```

## Type safety

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder, defineObject, defineShape } from "catcolab-documents";
const binder = createBinder();

const model = await binder.createNotebook(SimpleOlog, { title: "An Olog" });
const A = model.add(Type, { label: "A" });
const B = model.add(Type, { label: "B" });
const has = model.add(Aspect, { label: "has", from: A, to: B });

// A creatable shape with a `theory` but no `getCoreTheory`: its notebooks cannot be
// elaborated or validated, so a diagram cannot be drawn in one.
const Sketch = defineShape({
    theory: "sketch",
    objects: [defineObject({ tag: "Basic", content: "Object" })],
});

const sketch = await binder.createNotebook(Sketch, { title: "A sketch" });
```

```ts
const diagram = await binder.createNotebook(SimpleOlog.Diagram, {
    title: "Olog diagram",
    in: model,
});
```

```ts
// @ts-expect-error The `in` model must be validatable, but a notebook over a
// shape without a `getCoreTheory` has no `validate()`.
await binder.createNotebook(SimpleOlog.Diagram, { title: "bad", in: sketch });
```

```ts
const diagram = await binder.createNotebook(SimpleOlog.Diagram, {
    title: "Olog diagram",
    in: model,
});

// @ts-expect-error `over` for an Individual must be a model object, not a morphism.
diagram.add(SimpleOlog.Diagram.Individual, { label: "bad", over: has });
```

```ts
const diagram = await binder.createNotebook(SimpleOlog.Diagram, {
    title: "Olog diagram",
    in: model,
});

const x = diagram.add(SimpleOlog.Diagram.Individual, { label: "x", over: A });
const y = diagram.add(SimpleOlog.Diagram.Individual, { label: "y", over: B });

// @ts-expect-error Arrays are not valid endpoints in a simple olog diagram.
diagram.add(SimpleOlog.Diagram.Aspect, { from: [x], to: y, over: has });
```

A shape only derives a `.Diagram` when it declares `supportsInstances`.
`PetriNet` is over a modal (symmetric-monoidal) theory, for which diagrams are
not implemented, so it omits the flag and has no `.Diagram`.

```ts
import { PetriNet } from "catcolab-logics/petri-net";

// @ts-expect-error `PetriNet` does not support instances, so it has no `.Diagram`.
PetriNet.Diagram;
```

Likewise `Sketch` declares a `theory` but not `supportsInstances`, so it too has
no `.Diagram`.

```ts
// @ts-expect-error `Sketch` does not support instances, so it has no `.Diagram`.
Sketch.Diagram;
```
