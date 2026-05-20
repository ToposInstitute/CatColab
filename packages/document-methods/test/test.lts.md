We import the logic from our package.

```ts
import { SimpleOlog } from "catcolab-document-methods";
```

Using this we create our notebook.

```ts
const notebook = SimpleOlog.create({ name: "An Olog" });
```

We can add rich text cells to our notebook.

```ts
const intro = notebook.richText({ content: "We define a simple olog." });
```

We can create objects and morphisms in the notebook.

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

```ts
notebook.update({name: "A simple Olog example"})

intro.update(
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

```ts
arrow.update({
    name: "has as example",
});
```

Invalid shapes should by type errors:

```ts
arrow.update({
    dom: [source],
});
// Error:


const arrow2 = notebook.morphism(Aspect, {
name: "bad"
dom: [source, target]
cod: [target, source]
})
// Error:
```

But adapt to the underlying logic:

```ts
import { PetriNet } from "catcolab-document-methods";

const notebook = PetriNet.create({ name: "Example Petri-net" });

const Place = PetriNet.objectTypes.Place;

const a = notebook.object(Place, { name: "A" });

const b = notebook.object(Place, { name: "B" });

const c = notebook.object(Place, { name: "C" });

notebook.morphism(PetriNet.morphismTypes.Transition, {
    name: "t1",
    dom: [a, b],
    cod: [c],
});
```
