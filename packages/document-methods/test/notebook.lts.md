A new package for our built-in logics `catcolab-logics`. In the future people may create their own logics. The logics need to play nice with `catcolab-document-methods`.

<!-- verifier:prepend-to-following -->

```ts
import { SimpleOlog } from "catcolab-logics";
import { ModelNotebook } from "catcolab-document-methods/future";
```

Using this we create our notebook.

<!-- verifier:prepend-to-following -->

```ts
const notebook = ModelNotebook.create(SimpleOlog, { name: "An Olog" });
```

We can add rich text cells to our notebook.

<!-- verifier:prepend-to-following -->

```ts
const intro = notebook.richText({ content: "We define a simple olog." });
```

We can create objects and morphisms in the notebook.

<!-- verifier:prepend-to-following -->

```ts
const Type = SimpleOlog.objectTypes.Type;
const Aspect = SimpleOlog.morphismTypes.Aspect;

const source = notebook.object(Type, {
    name: "A",
});

const target = notebook.object(Type, {
    name: "B",
});

const arrow = notebook.morphism(Aspect, {
    name: "has",
    dom: source,
    cod: target,
});
```

We can update any item.

<!-- verifier:prepend-to-following -->

```ts
notebook.update({ name: "A simple Olog example" });

intro.update({
    content: "We define a simple olog with two objects and one arrow.",
});

source.update({
    name: "Source",
});

arrow.update({
    name: "has as",
    dom: source,
    cod: target,
});
```

We can also do partial updates.

<!-- verifier:prepend-to-following -->

```ts
arrow.update({
    name: "has as example",
});
```

Invalid shapes should be type errors:

```ts
// @ts-expect-error Arrays are not valid endpoints in a simple olog.
arrow.update({
    dom: [source],
});

notebook.morphism(Aspect, {
    name: "bad",
    // @ts-expect-error Arrays are not valid endpoints in a simple olog.
    dom: [source, target],
    cod: target,
});
```

But adapt to the underlying logic:

<!-- verifier:reset -->

```ts
import { PetriNet } from "catcolab-logics";
import { ModelNotebook } from "catcolab-document-methods/future";

const notebook = ModelNotebook.create(PetriNet, { name: "Example Petri-net" });

const Place = PetriNet.objectTypes.Place;
const Transition = PetriNet.morphismTypes.Transition;

const a = notebook.object(Place, { name: "A" });

const b = notebook.object(Place, { name: "B" });

const c = notebook.object(Place, { name: "C" });

notebook.morphism(Transition, {
    name: "t1",
    dom: [a, b],
    cod: [c],
});

notebook.morphism(Transition, {
    name: "bad",
    // @ts-expect-error Petri net transitions require arrays of places.
    dom: a,
    cod: [c],
});
```
