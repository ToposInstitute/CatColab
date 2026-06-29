<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { binder, RichText } from "catcolab-documents";

const model = binder.createNotebook(SimpleOlog, { name: "An Olog" });

const A = model.add(Type, { name: "A" });
const B = model.add(Type, { name: "B" });
const has = model.add(Aspect, { name: "has", from: A, to: B });
```

<!-- verifier:prepend-to-following -->

```ts
const diagram = binder.createNotebook(SimpleOlog.Diagram, {
    name: "Olog diagram",
    in: model,
});
```

```ts
console.log("name:", diagram.name);
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

const x = diagram.add(SimpleOlog.Diagram.Individual, { name: "x", over: A });
const y = diagram.add(SimpleOlog.Diagram.Individual, { name: "y", over: B });
```

```ts
console.log("over:", x.over.name);
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
console.log("over:", f.over.name);
console.log("from:", f.from.name);
console.log("to:", f.to.name);
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
import { binder, RichText } from "catcolab-documents";

const model = binder.createNotebook(SimpleOlog, { name: "An Olog" });
const A = model.add(Type, { name: "A" });
const B = model.add(Type, { name: "B" });
const has = model.add(Aspect, { name: "has", from: A, to: B });

const diagram = binder.createNotebook(SimpleOlog.Diagram, {
    name: "Olog diagram",
    in: model,
});

diagram.add(RichText, { content: "We picture an instance." });
const x = diagram.add(SimpleOlog.Diagram.Individual, { name: "x", over: A });
const y = diagram.add(SimpleOlog.Diagram.Individual, { name: "y", over: B });
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
            console.log("individual:", cell.name, "over:", cell.over.name);
            break;
        case CellKind.Morphism:
            console.log(
                "aspect over:",
                cell.over.name,
                "from:",
                cell.from.name,
                "to:",
                cell.to.name,
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
import { binder, defineObject, defineShape } from "catcolab-documents";

const model = binder.createNotebook(SimpleOlog, { name: "An Olog" });
const A = model.add(Type, { name: "A" });
const B = model.add(Type, { name: "B" });
const has = model.add(Aspect, { name: "has", from: A, to: B });

// A creatable shape with a `theory` but no `coreTheory`: its notebooks cannot be
// elaborated or validated, so a diagram cannot be drawn in one.
const Sketch = defineShape({
    theory: "sketch",
    objects: [defineObject({ tag: "Basic", content: "Object" })],
});

const sketch = binder.createNotebook(Sketch, { name: "A sketch" });
```

```ts
const diagram = binder.createNotebook(SimpleOlog.Diagram, {
    name: "Olog diagram",
    in: model,
});
```

```ts
// @ts-expect-error The `in` model must be validatable, but a notebook over a
// shape without a `coreTheory` has no `validate()`.
binder.createNotebook(SimpleOlog.Diagram, { name: "bad", in: sketch });
```

```ts
const diagram = binder.createNotebook(SimpleOlog.Diagram, {
    name: "Olog diagram",
    in: model,
});

// @ts-expect-error `over` for an Individual must be a model object, not a morphism.
diagram.add(SimpleOlog.Diagram.Individual, { name: "bad", over: has });
```

```ts
const diagram = binder.createNotebook(SimpleOlog.Diagram, {
    name: "Olog diagram",
    in: model,
});

const x = diagram.add(SimpleOlog.Diagram.Individual, { name: "x", over: A });
const y = diagram.add(SimpleOlog.Diagram.Individual, { name: "y", over: B });

// @ts-expect-error Arrays are not valid endpoints in a simple olog diagram.
diagram.add(SimpleOlog.Diagram.Aspect, { from: [x], to: y, over: has });
```
