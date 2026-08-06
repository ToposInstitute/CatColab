<!-- verifier:prepend-to-following -->

```ts
import { Visualization } from "catcolab-analyses";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder, RichText } from "catcolab-documents";
const binder = createBinder();

const model = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

const source = model.add(Type, { label: "A" });
const target = model.add(Type, { label: "B" });
```

<!-- verifier:prepend-to-following -->

```ts
const analysis = await binder.createNotebook(SimpleOlog.Analysis, {
    title: "Olog analysis",
    of: model,
});
```

```ts
console.log("name:", analysis.title);
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

The params are precisely typed from the analysis def, so `params`, `update`, and
`run` are all checked against the analysis's own `Params` type. Unknown params
and wrong value types are compile errors:

```ts
// @ts-expect-error `layout` is one of the known engines, not an arbitrary string.
viz.update({ layout: "d3-force" });

// @ts-expect-error `direction` is "horizontal" | "vertical", not any string.
viz.update({ direction: "sideways" });

// @ts-expect-error There is no `zoom` param on a visualization.
viz.update({ zoom: 2 });

// @ts-expect-error There is no `zoom` param to read either.
console.log(viz.params.zoom);
```

The def's exported `Params` type is the single source of truth, so a handle's
params are assignable to it:

```ts
import type { VisualizationParams } from "catcolab-analyses";

const layout: VisualizationParams = viz.params;
console.log("engine:", layout.layout);
```

```
engine: graphviz-directed
```

## Running an analysis

`run()` resolves to a `Result` whose `Ok` `content` is precisely the analysis's
own output type. The visualization lays out the model with Graphviz and then
renders that layout to a self-contained SVG string. The renderer reproduces the
markup of the frontend's `GraphSVG` component (ported from
`packages/frontend/src/visualization`), but builds it as a string with `vhtml`,
so it runs headlessly. The `content.svg` string contains the frontend's markup: a
`<svg class="graph">` with the graph stylesheet embedded, `<g class="node">`
groups holding a `<rect>` and a label `<text>`, and `<g class="edge">` groups
holding a `<path>`:

```ts
const result = await viz.run();
if (result.tag === "Ok") {
    const { svg } = result.content;
    console.log("is svg:", svg.trimStart().startsWith("<?xml"));
    console.log("graph class:", svg.includes('class="graph"'));
    console.log("nodes:", svg.split('class="node"').length - 1);
    console.log("has A:", svg.includes(">A<"));
    console.log("has B:", svg.includes(">B<"));
}
```

```
is svg: true
graph class: true
nodes: 2
has A: true
has B: true
```

The output type is checked: unknown fields are compile errors, and the whole
`content` is assignable to the def's exported output type.

```ts
import type { VisualizationResult } from "catcolab-analyses";

const out = await viz.run();
if (out.tag === "Ok") {
    const rendered: VisualizationResult = out.content;

    // @ts-expect-error The output has `svg`, not `nodes`.
    void rendered.nodes;

    // @ts-expect-error `svg` is a string, so it has no `.length` array access.
    void rendered.svg[0]?.weight;

    console.log("svg length > 0:", rendered.svg.length > 0);
}
```

```
svg length > 0: true
```

## Mass-action dynamics

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { MassActionDynamics } from "catcolab-analyses";
import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
import { createBinder } from "catcolab-documents";
const binder = createBinder();

const petriNet = await binder.createNotebook(PetriNet, { title: "SIR" });

const susceptible = petriNet.add(Place, { label: "S" });
const infected = petriNet.add(Place, { label: "I" });

petriNet.add(Transition, { label: "infection", from: [susceptible, infected], to: [infected] });

const analysis = await binder.createNotebook(PetriNet.Analysis, {
    title: "Petri net analysis",
    of: petriNet,
});

const sim = analysis.add(MassActionDynamics);
```

```ts
console.log("analysis id:", sim.type.id);
console.log("duration:", sim.params.duration);
```

```
analysis id: mass-action
duration: 10
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

The params are catlog-wasm's full `MassActionProblemData`, so `initialValues` and
`rates` are `Record<string, number>` keyed by handle ids and `duration` is a
plain number:

```ts
// @ts-expect-error `duration` is a number, not a string.
sim.update({ duration: "long" });

// @ts-expect-error `initialValues` maps ids to numbers, not strings.
sim.update({ initialValues: { [susceptible.id]: "lots" } });

// @ts-expect-error There is no `tolerance` param on `MassActionProblemData`.
sim.update({ tolerance: 0.01 });
```

The params type is catlog-wasm's `MassActionProblemData`:

```ts
import type { MassActionProblemData } from "catlog-wasm";

const params: MassActionProblemData = sim.params;
console.log("duration:", params.duration);
```

```
duration: 3
```

The analysis returns the raw `massAction` result — the ODE `solution` (itself a
`JsResult` wrapping the solver's `time`/`states` trajectories) alongside the
`latexEquations` for the system:

```ts
const result = await sim.run();
if (result.tag === "Ok") {
    const { solution, latexEquations } = result.content;
    if (solution.tag === "Ok") {
        console.log("has times:", solution.content.time.length > 0);
        console.log("states:", [...solution.content.states.keys()].length);
    }
    console.log("equations:", latexEquations.length > 0);
}
```

```
has times: true
states: 2
equations: true
```

Like the params, the output is typed by the def and checked at the call site,
and assignable to catlog-wasm's `ODEResultWithEquations`:

```ts
import type { ODEResultWithEquations } from "catlog-wasm";

const out = await sim.run();
if (out.tag === "Ok") {
    const massResult: ODEResultWithEquations = out.content;

    // @ts-expect-error `solution` is a `JsResult`, not a plain array.
    const time: number[] = massResult.solution.time;
    void time;

    // @ts-expect-error The result exposes `solution`/`latexEquations`, not `states`.
    void massResult.states;

    if (massResult.solution.tag === "Ok") {
        console.log("final time:", Math.round(massResult.solution.content.time.at(-1) ?? 0));
    }
}
```

```
final time: 3
```

## Iterating through cells

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Visualization } from "catcolab-analyses";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder, RichText } from "catcolab-documents";
const binder = createBinder();

const model = await binder.createNotebook(SimpleOlog, { title: "An Olog" });
model.add(Type, { label: "A" });

const analysis = await binder.createNotebook(SimpleOlog.Analysis, {
    title: "Olog analysis",
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
import { createBinder, defineObject, defineShape } from "catcolab-documents";
const binder = createBinder();

const model = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

// A creatable shape with a `theory` but no `getCoreTheory`: its notebooks cannot be
// elaborated or validated, so they have no `validate()` method.
const Sketch = defineShape({
    theory: "sketch",
    objects: [defineObject({ tag: "Basic", content: "Object" })],
});

const sketch = await binder.createNotebook(Sketch, { title: "A sketch" });
```

A validatable model is accepted as `of`:

```ts
await binder.createNotebook(SimpleOlog.Analysis, { title: "Olog analysis", of: model });
```

A non-validatable one is a type error:

```ts
// @ts-expect-error The `of` model must be validatable, but a notebook over a
// shape without a `getCoreTheory` has no `validate()`.
await binder.createNotebook(SimpleOlog.Analysis, { title: "bad", of: sketch });
```
