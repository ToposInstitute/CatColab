# A function written against a list shape

A shape declares the object and morphism types a notebook is built from. A
function can be written against a particular shape — here a shape whose
morphisms all carry a list modality — and accept any notebook whose shape is
structurally compatible with it.

`ListShape` names one object and five morphisms, each a `Hom` over a list-style
modality (`List`, `SymmetricList`, `CocartesianList`, `CartesianList`,
`AdditiveList`). The shared structure is that every endpoint is a _list_ of
basic objects.

<!-- verifier:prepend-to-following -->

```ts
import { binder, defineShape, type Notebook } from "catcolab-documents";

import { MorType, ObType } from "catcolab-document-types";

const BasicObject = { tag: "Basic", content: "Object" } as const satisfies ObType;
const SymmetricList = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "SymmetricList", obType: BasicObject },
    },
} as const satisfies MorType;

const List = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "List", obType: BasicObject },
    },
} as const satisfies MorType;

const CocartesianList = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "CocartesianList", obType: BasicObject },
    },
} as const satisfies MorType;

const CartesianList = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "CartesianList", obType: BasicObject },
    },
} as const satisfies MorType;

const AdditiveList = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "AdditiveList", obType: BasicObject },
    },
} as const satisfies MorType;

const ListShape = defineShape({
    objects: {
        BasicObject,
    },
    morphisms: {
        List,
        SymmetricList,
        CocartesianList,
        CartesianList,
        AdditiveList,
    },
});
```

`addListMorphism` is written against `Notebook<typeof ListShape, unknown>`: it
adds three basic objects and wires a `List` morphism whose `dom` and `cod` are
lists of object cells.

<!-- verifier:prepend-to-following -->

```ts
function addListMorphism(props: { notebook: Notebook<typeof ListShape, unknown> }) {
    const { notebook } = props;
    const a = notebook.add(ListShape.objects.BasicObject, { name: "A" });
    const b = notebook.add(ListShape.objects.BasicObject, { name: "B" });
    const c = notebook.add(ListShape.objects.BasicObject, { name: "C" });
    notebook.add(ListShape.morphisms.List, { name: "L", dom: [a, b], cod: [c] });
}
```

## A structurally compatible notebook is accepted

A Petri-net notebook has a `Place` object (a basic object) and a `Transition`
morphism that is a `Hom` over a `SymmetricList` modality — list-valued
endpoints over basic objects. That structure is compatible with `ListShape`, so
the Petri-net notebook is accepted.

<!-- verifier:prepend-to-following -->

```ts
import { PetriNet } from "catcolab-logics/petri-net";

const petriNet = binder.createNotebook(PetriNet, { name: "example" });

addListMorphism({ notebook: petriNet });
```

## A structurally incompatible notebook should be rejected

A `SimpleOlog` notebook has a `Type` object and a single `Aspect` morphism,
which is a plain `Hom` over a basic object — its endpoints are single cells,
not lists. It does not provide the list-valued morphisms `addListMorphism`
relies on, so passing it ought to be a compile error.

```ts
import { SimpleOlog } from "catcolab-logics/simple-olog";

const simpleOlog = binder.createNotebook(SimpleOlog, { name: "example" });

// @ts-expect-error A SimpleOlog notebook lacks the list-valued morphisms ListShape requires.
addListMorphism({ notebook: simpleOlog });
```
