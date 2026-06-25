# A function written against a list shape

<!-- verifier:prepend-to-following -->

```ts
import { defineMorphism, defineObject, defineShape, type Notebook } from "catcolab-documents";

const BasicObj = defineObject({ tag: "Basic", content: "Object" });

// The `tensor` operation turns a list of objects into the single object an
// endpoint connects, so declaring it on the domain and codomain is what makes a
// morphism's endpoints list-like.
const tensor = { apply: { tag: "Basic", content: "tensor" } } as const;

const SymmetricListMor = defineMorphism(
    { tag: "Hom", content: BasicObj.obType },
    { modality: "SymmetricList", domain: tensor, codomain: tensor },
);

const ListMor = defineMorphism(
    { tag: "Hom", content: BasicObj.obType },
    { modality: "List", domain: tensor, codomain: tensor },
);

const CocartesianListMor = defineMorphism(
    { tag: "Hom", content: BasicObj.obType },
    { modality: "CocartesianList", domain: tensor, codomain: tensor },
);

const CartesianListMor = defineMorphism(
    { tag: "Hom", content: BasicObj.obType },
    { modality: "CartesianList", domain: tensor, codomain: tensor },
);

const AdditiveListMor = defineMorphism(
    { tag: "Hom", content: BasicObj.obType },
    { modality: "AdditiveList", domain: tensor, codomain: tensor },
);

const ListShape = defineShape({
    objects: [BasicObj],
    morphisms: [ListMor],
});

const SymmetricListShape = defineShape({
    objects: [BasicObj],
    morphisms: [SymmetricListMor],
});

const CocartesianListShape = defineShape({
    objects: [BasicObj],
    morphisms: [CocartesianListMor],
});

const CartesianListShape = defineShape({
    objects: [BasicObj],
    morphisms: [CartesianListMor],
});

const AdditiveListShape = defineShape({
    objects: [BasicObj],
    morphisms: [AdditiveListMor],
});
```

<!-- verifier:prepend-to-following -->

`addListMorphism` works on any notebook that supports any of the morphisms our
list shapes support. When implementing a generic consumer like this we need to
narrow down what object and morphism types the notebook actually supports by
using `notebook.supports`.

```ts
type NotebookOfLists = Notebook<
    | typeof ListShape
    | typeof SymmetricListShape
    | typeof CocartesianListShape
    | typeof CartesianListShape
    | typeof AdditiveListShape,
    unknown
>;

function addListMorphism(notebook: NotebookOfLists) {
    const a = notebook.add(BasicObj, { name: "A" });
    const b = notebook.add(BasicObj, { name: "B" });
    const c = notebook.add(BasicObj, { name: "C" });

    if (notebook.supports(ListMor)) {
        notebook.add(ListMor, { name: "L", from: [a, b], to: [c] });
    } else if (notebook.supports(SymmetricListMor)) {
        console.log("Adding SymmetricListMor!");
        notebook.add(SymmetricListMor, { name: "L", from: [a, b], to: [c] });
    } else if (notebook.supports(CocartesianListMor)) {
        notebook.add(CocartesianListMor, { name: "L", from: [a, b], to: [c] });
    } else if (notebook.supports(CartesianListMor)) {
        notebook.add(CartesianListMor, { name: "L", from: [a, b], to: [c] });
    } else if (notebook.supports(AdditiveListMor)) {
        notebook.add(AdditiveListMor, { name: "L", from: [a, b], to: [c] });
    } else {
        // If the code type checked this should be unreachable.
        throw new Error("Did not find any supported List morphism in the notebook.");
    }
}
```

```ts
function badAddListMorphism(notebook: NotebookOfLists) {
    const a = notebook.add(BasicObj, { name: "A" });
    const b = notebook.add(BasicObj, { name: "B" });
    const c = notebook.add(BasicObj, { name: "C" });

    //@ts-expect-error Not all variants support adding a `ListMor`. You need to narrow the type using the `supports` method.
    notebook.add(ListMor, { name: "L", from: [a, b], to: [c] });
}
```

## A structurally compatible notebook is accepted and the appropriate morphism is added.

<!-- verifier:prepend-to-following -->

```ts
import { binder } from "catcolab-documents";
import { PetriNet } from "catcolab-logics/petri-net";

const petriNet = binder.createNotebook(PetriNet, { name: "example" });

addListMorphism(petriNet);
```

```
Adding SymmetricListMor!
```

```ts
const entityObType = defineObject({ tag: "Basic", content: "Entity" });
const EntityObjectShape = defineShape({
    theory: "entity-objects",
    objects: [entityObType, BasicObj],
    morphisms: [ListMor],
});

const entityObjects = binder.createNotebook(EntityObjectShape, { name: "example" });

addListMorphism(entityObjects);
```

## A structurally incompatible notebook should be rejected

```ts
import { SimpleOlog } from "catcolab-logics/simple-olog";

const simpleOlog = binder.createNotebook(SimpleOlog, { name: "example" });

// @ts-expect-error A SimpleOlog notebook lacks the list-valued morphisms ListShape requires.
addListMorphism(simpleOlog);
```

```ts
const JustObjectShape = defineShape({
    theory: "just-objects",
    objects: [BasicObj],
});

const justObjects = binder.createNotebook(JustObjectShape, { name: "example" });

// @ts-expect-error We have no morphisms in `JustObjectShape`.
addListMorphism(justObjects);
```

```ts
const JustMorphismShape = defineShape({
    theory: "just-morphisms",
    morphisms: [ListMor],
});

const justMorphisms = binder.createNotebook(JustMorphismShape, { name: "example" });

// @ts-expect-error We have no objects in `JustMorphismShape`.
addListMorphism(justMorphisms);
```

```ts
const entityObType = defineObject({ tag: "Basic", content: "Entity" });

const entityListMorType = defineMorphism(
    { tag: "Hom", content: entityObType.obType },
    { modality: "List", domain: tensor, codomain: tensor },
);

const MultiObjectListShape = defineShape({
    objects: [BasicObj, entityObType],
    morphisms: [ListMor, entityListMorType],
});

function badAddListMorphism2(notebook: Notebook<typeof MultiObjectListShape, unknown>) {
    const a = notebook.add(BasicObj, { name: "A" });
    const b = notebook.add(BasicObj, { name: "B" });
    const e = notebook.add(entityObType, { name: "E" });

    notebook.add(ListMor, { name: "L1", from: [a, b], to: [b] });
    //@ts-expect-error We can't use an EntityObj with a ListMor
    notebook.add(ListMor, { name: "L2", from: [a, b], to: [e] });
}
```

```ts
const entityObType = defineObject({ tag: "Basic", content: "Entity" });

const entityListMorType = defineMorphism(
    { tag: "Hom", content: entityObType.obType },
    { modality: "List", domain: tensor, codomain: tensor },
);

const EntityObjectListShape = defineShape({
    objects: [entityObType],
    morphisms: [entityListMorType],
});

type NotebookOfListsWithEntity = Notebook<
    | typeof ListShape
    | typeof SymmetricListShape
    | typeof CocartesianListShape
    | typeof CartesianListShape
    | typeof AdditiveListShape
    | typeof EntityObjectListShape,
    unknown
>;

const EntityObj = entityObType;

function goodAddObject(notebook: NotebookOfListsWithEntity) {
    if (notebook.supports(BasicObj)) {
        notebook.add(BasicObj, { name: "A" });
    }

    if (notebook.supports(EntityObj)) {
        notebook.add(EntityObj, { name: "E" });
    }
}

const BothObjectsShape = defineShape({
    objects: [BasicObj, entityObType],
});

function goodAddObject2(notebook: NotebookOfListsWithEntity) {
    if (notebook.supports(BothObjectsShape)) {
        notebook.add(BasicObj, { name: "A" });
        notebook.add(EntityObj, { name: "E" });
    }
}

type JustEntityObjectListShape = Notebook<typeof EntityObjectListShape, unknown>;

function goodAddObject3(notebook: JustEntityObjectListShape) {
    notebook.add(EntityObj, { name: "E" });
}

function badAddObject(notebook: NotebookOfListsWithEntity) {
    //@ts-expect-error We can't add a BasicObj without narrowing the notebook type because EntityObjectListShape does not support BasicObj.
    notebook.add(BasicObj, { name: "A" });

    //@ts-expect-error We can't add a EntityObj without narrowing the notebook type because not all notebooks support EntityObj.
    notebook.add(EntityObj, { name: "E" });
}

function badAddObject2(notebook: Notebook<typeof BothObjectsShape, unknown>) {
    const a = notebook.add(BasicObj, { name: "A" });
    const b = notebook.add(BasicObj, { name: "B" });

    //@ts-expect-error BothObjectsShape can never support CocartesianListMor.
    if (notebook.supports(CocartesianListMor)) {
        //@ts-expect-error BothObjectsShape does not support CocartesianListMor.
        notebook.add(CocartesianListMor, { name: "L", from: [a, b], to: [b] });
    }
}
```
