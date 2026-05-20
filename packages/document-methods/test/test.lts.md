We import the logic from our package.

<!-- verifier:prepend-to-following -->

```ts
import { SimpleOlog } from "catcolab-document-methods/future";
```

Using this we create our notebook.

<!-- verifier:prepend-to-following -->

```ts
const notebook = SimpleOlog.create({ name: "An Olog" });
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

<!-- verifier:prepend-to-following -->

We can update any item.

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

Invalid shapes should by type errors:

```ts
arrow.update({
    dom: [source],
//  ~~~ Type 'ObjectCell<ObjectType<"Type">>[]' is not assignable to type 'SimpleOlogObject'. Property 'update' is missing in type 'ObjectCell<ObjectType<"Type">>[]' but required in type 'Update<{ name: string; }>'.
});


const arrow2 = notebook.morphism(Aspect, {
    name: "bad",
    dom: [source, target],
//  ~~~ Type 'ObjectCell<ObjectType<"Type">>[]' is missing the following properties from type 'ObjectCell<ObjectType<"Type">>': id, type, update
    cod: [target, source],
//  ~~~ Type 'ObjectCell<ObjectType<"Type">>[]' is missing the following properties from type 'ObjectCell<ObjectType<"Type">>': id, type, update
});
```

But adapt to the underlying logic:

<!-- verifier:reset -->

```ts
import { PetriNet } from "catcolab-document-methods/future";

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
