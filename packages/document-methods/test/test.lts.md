We import the logic value and notebook API from separate packages.

<!-- verifier:prepend-to-following -->

```ts
import { SimpleOlog } from "catcolab-logics";
import { ModelNotebook } from "catcolab-document-methods/future";
```

Using this we create our notebook.

<!-- verifier:prepend-to-following -->

```ts
const notebook = ModelNotebook.create({ name: "An Olog", logic: SimpleOlog });
```

We can add rich text cells to our notebook.

<!-- verifier:prepend-to-following -->

```ts
const intro = notebook.richText({ content: "We define a simple olog." });
```

We can create objects and morphisms in the notebook.

<!-- verifier:prepend-to-following -->

```ts
const source = notebook.object({
    name: "A",
});

const target = notebook.object({
    name: "B",
});

const arrow = notebook.morphism({
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

const arrow2 = notebook.morphism({
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

const notebook = ModelNotebook.create({ name: "Example Petri-net", logic: PetriNet });

const a = notebook.object({ name: "A" });

const b = notebook.object({ name: "B" });

const c = notebook.object({ name: "C" });

notebook.morphism({
    name: "t1",
    dom: [a, b],
    cod: [c],
});

notebook.morphism({
    name: "bad",
    // @ts-expect-error Petri net transitions require arrays of places.
    dom: a,
    cod: [c],
});
```
