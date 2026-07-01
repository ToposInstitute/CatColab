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
console.log("layout:", viz.params.layout);
```

```
analysis id: diagram
layout: graphviz-directed
```

```ts
viz.update({ direction: "horizontal" });

console.log("layout:", viz.params.layout);
console.log("direction:", viz.params.direction);
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

## Mass-action dynamics

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { MassActionDynamics } from "catcolab-analyses";
import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
import { binder } from "catcolab-documents";

const petriNet = binder.createNotebook(PetriNet, { name: "SIR" });

const susceptible = petriNet.add(Place, { name: "S" });
const infected = petriNet.add(Place, { name: "I" });

petriNet.add(Transition, { name: "infection", from: [susceptible, infected], to: [infected] });

const analysis = binder.createNotebook(PetriNet.Analysis, {
    name: "Petri net analysis",
    of: petriNet,
});

const sim = analysis.add(MassActionDynamics);
```

```ts
console.log("analysis id:", sim.type.id);
console.log("duration:", sim.params.duration);
console.log("step:", sim.params.step);
```

```
analysis id: mass-action
duration: 10
step: 1
```

<!-- verifier:prepend-to-following -->

```ts
sim.update({ duration: 3, initialValues: { [susceptible.id]: 1 } });
```

```ts
console.log("duration:", sim.params.duration);
console.log("S initial:", sim.params.initialValues[susceptible.id]);
```

```
duration: 3
S initial: 1
```

```ts
const trajectories = await sim.run();

console.log("times:", trajectories.time.join(", "));
console.log("states:", trajectories.states.map((state) => state.label).join(", "));
console.log("S samples:", trajectories.states[0]!.values.length);
```

```
times: 0, 1, 2, 3
states: S, I
S samples: 4
```

## Iterating through cells

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Visualization } from "catcolab-analyses";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { binder, RichText } from "catcolab-documents";

const model = binder.createNotebook(SimpleOlog, { name: "An Olog" });
model.add(Type, { name: "A" });

const analysis = binder.createNotebook(SimpleOlog.Analysis, {
    name: "Olog analysis",
    of: model,
});

analysis.add(RichText, { content: "We visualize the olog." });
analysis.add(Visualization);
```

```ts
import { CellKind } from "catcolab-documents";

for (const cell of analysis.cells()) {
    switch (cell.kind) {
        case CellKind.RichText:
            console.log("text:", cell.content);
            break;
        case CellKind.Analysis:
            console.log("analysis:", cell.type.id);
            break;
    }
}
```

```
text: We visualize the olog.
analysis: diagram
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
