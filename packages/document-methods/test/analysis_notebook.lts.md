<!-- verifier:prepend-to-following -->

```ts
import { Visualization } from "catcolab-analyses";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { binder, RichText } from "catcolab-documents";

const model = binder.createNotebook(SimpleOlog, { name: "An Olog" });

const source = model.add(Type, { name: "A" });
const target = model.add(Type, { name: "B" });
```

<!-- verifier:prepend-to-following -->

```ts
const analysis = binder.createNotebook(SimpleOlog.Analysis, {
    name: "Olog analysis",
    of: model,
});
```

```ts
console.log("name:", analysis.name);
console.log("type:", analysis.analysisType);
```

```
name: Olog analysis
type: model
```

<!-- verifier:prepend-to-following -->

```ts
analysis.add(RichText, { content: "We visualize the olog." });

const viz = analysis.add(Visualization);
```

```ts
console.log("analysis id:", viz.type.id);
console.log("layout:", viz.content.layout);
```

```
analysis id: diagram
layout: graphviz-directed
```

```ts
viz.update({ direction: "horizontal" });

console.log("layout:", viz.content.layout);
console.log("direction:", viz.content.direction);
```

```
layout: graphviz-directed
direction: horizontal
```

## Running an analysis

```ts
const graph = await viz.run();

console.log("nodes:", graph.nodes.map((node) => node.label).join(", "));
console.log("edges:", graph.edges.length);
```

```
nodes: A, B
edges: 0
```

## Iterating through cells

```ts
import { CellKind } from "catcolab-documents";

for (const cell of analysis.cells()) {
    switch (cell.kind) {
        case CellKind.RichText:
            console.log("text:", cell.content);
            break;
        case CellKind.Analysis:
            console.log("analysis:", cell.type.id, "layout:", cell.content.layout);
            break;
    }
}
```

```
text: We visualize the olog.
analysis: diagram layout: graphviz-directed
```

## Type safety

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { SimpleOlog } from "catcolab-logics/simple-olog";
import { binder, defineObject, defineShape } from "catcolab-documents";

const model = binder.createNotebook(SimpleOlog, { name: "An Olog" });

// A creatable shape with a `theory` but no `coreTheory`: its notebooks cannot be
// elaborated or validated, so they have no `validate()` method.
const Sketch = defineShape({
    theory: "sketch",
    objects: [defineObject({ tag: "Basic", content: "Object" })],
});

const sketch = binder.createNotebook(Sketch, { name: "A sketch" });
```

A validatable model is accepted as `of`:

```ts
binder.createNotebook(SimpleOlog.Analysis, { name: "Olog analysis", of: model });
```

A non-validatable one is a type error:

```ts
// @ts-expect-error The `of` model must be validatable, but a notebook over a
// shape without a `coreTheory` has no `validate()`.
binder.createNotebook(SimpleOlog.Analysis, { name: "bad", of: sketch });
```
