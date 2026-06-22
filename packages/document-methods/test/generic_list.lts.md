# A function written against a list shape

<!-- verifier:prepend-to-following -->

```ts
import { defineShape, type Notebook } from "catcolab-documents";
import type { MorType, ObType } from "catcolab-document-types";

const basicObjType = { tag: "Basic", content: "Object" } as const satisfies ObType;
const symmetricListMorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "SymmetricList", obType: basicObjType },
    },
} as const satisfies MorType;

const listMorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "List", obType: basicObjType },
    },
} as const satisfies MorType;

const cocartesianListMorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "CocartesianList", obType: basicObjType },
    },
} as const satisfies MorType;

const cartesianListMorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "CartesianList", obType: basicObjType },
    },
} as const satisfies MorType;

const additiveListMorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "AdditiveList", obType: basicObjType },
    },
} as const satisfies MorType;

const ListShape = defineShape({
    objects: {
        BasicObj: basicObjType,
    },
    morphisms: {
        ListMor: listMorType,
    },
});

const SymmetricListShape = defineShape({
    objects: {
        BasicObj: basicObjType,
    },
    morphisms: {
        SymmetricListMor: symmetricListMorType,
    },
});

const CocartesianListShape = defineShape({
    objects: {
        BasicObj: basicObjType,
    },
    morphisms: {
        CocartesianListMor: cocartesianListMorType,
    },
});

const CartesianListShape = defineShape({
    objects: {
        BasicObj: basicObjType,
    },
    morphisms: {
        CartesianListMor: cartesianListMorType,
    },
});

const AdditiveListShape = defineShape({
    objects: {
        BasicObj: basicObjType,
    },
    morphisms: {
        AdditiveListMor: additiveListMorType,
    },
});

const BasicObj = ListShape.objects.BasicObj;
const ListMor = ListShape.morphisms.ListMor;
const SymmetricListMor = SymmetricListShape.morphisms.SymmetricListMor;
const CocartesianListMor = CocartesianListShape.morphisms.CocartesianListMor;
const CartesianListMor = CartesianListShape.morphisms.CartesianListMor;
const AdditiveListMor = AdditiveListShape.morphisms.AdditiveListMor;
```

<!-- verifier:prepend-to-following -->

`addListMorphism` works on any notebook that supports any of the objects or morphisms `ListShape` supports. When implementing a generic consumer like this it is our responsibility to narrow down what object and morphism types the notebook actually supports before adding them by using `notebook.supports`.

```ts
type SupportedNotebook = Notebook<
    | typeof ListShape
    | typeof SymmetricListShape
    | typeof CocartesianListShape
    | typeof CartesianListShape
    | typeof AdditiveListShape,
    unknown
>;

function addListMorphism(props: { notebook: SupportedNotebook }) {
    const { notebook } = props;

    const a = notebook.add(BasicObj, { name: "A" });
    const b = notebook.add(BasicObj, { name: "B" });
    const c = notebook.add(BasicObj, { name: "C" });

    if (notebook.supports(ListMor)) {
        notebook.add(ListMor, { name: "L", dom: [a, b], cod: [c] });
    } else if (notebook.supports(SymmetricListMor)) {
        console.log("Adding SymmetricListMor!");
        notebook.add(SymmetricListMor, { name: "L", dom: [a, b], cod: [c] });
    } else if (notebook.supports(CocartesianListMor)) {
        notebook.add(CocartesianListMor, { name: "L", dom: [a, b], cod: [c] });
    } else if (notebook.supports(CartesianListMor)) {
        notebook.add(CartesianListMor, { name: "L", dom: [a, b], cod: [c] });
    } else if (notebook.supports(AdditiveListMor)) {
        notebook.add(AdditiveListMor, { name: "L", dom: [a, b], cod: [c] });
    } else {
        // If the code type checked this should be unreachable.
        throw new Error("Did not find any supported List morphism in the notebook.");
    }
}
```

```ts
function badAddListMorphism(props: { notebook: SupportedNotebook }) {
    const { notebook } = props;

    const a = notebook.add(BasicObj, { name: "A" });
    const b = notebook.add(BasicObj, { name: "B" });
    const c = notebook.add(BasicObj, { name: "C" });

    //@ts-expect-error Not all variants support adding a `ListMor`. You need to narrow the type using the `supports` method.
    notebook.add(ListMor, { name: "L", dom: [a, b], cod: [c] });
}
```

```ts
const entityObType = { tag: "Basic", content: "Entity" } as const satisfies ObType;

const entityListMorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "List", obType: entityObType },
    },
} as const satisfies MorType;

const MultiObjectListShape = defineShape({
    objects: {
        BasicObj: basicObjType,
        EntityObj: entityObType,
    },
    morphisms: {
        ListMor: listMorType,
        EntityListMor: entityListMorType,
    },
});

function badAddListMorphism2(props: { notebook: Notebook<typeof MultiObjectListShape, unknown> }) {
    const { notebook } = props;

    const a = notebook.add(BasicObj, { name: "A" });
    const b = notebook.add(BasicObj, { name: "B" });
    const e = notebook.add(MultiObjectListShape.objects.EntityObj, { name: "E" });

    notebook.add(ListMor, { name: "L1", dom: [a, b], cod: [b] });
    //@ts-expect-error We can't use an EntityObj with a ListMor
    notebook.add(ListMor, { name: "L2", dom: [a, b], cod: [e] });
}
```

```ts
const entityObType = { tag: "Basic", content: "Entity" } as const satisfies ObType;

const entityListMorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "List", obType: entityObType },
    },
} as const satisfies MorType;

const EntityObjectListShape = defineShape({
    objects: {
        EntityObj: entityObType,
    },
    morphisms: {
        EntityListMor: entityListMorType,
    },
});

type SupportedNotebookWithEntity = Notebook<
    | typeof ListShape
    | typeof SymmetricListShape
    | typeof CocartesianListShape
    | typeof CartesianListShape
    | typeof AdditiveListShape
    | typeof EntityObjectListShape,
    unknown
>;

const EntityObj = EntityObjectListShape.objects.EntityObj;

function goodAddObject(notebook: SupportedNotebookWithEntity) {
    if (notebook.supports(BasicObj)) {
        notebook.add(BasicObj, { name: "A" });
    }

    if (notebook.supports(EntityObj)) {
        notebook.add(EntityObj, { name: "E" });
    }
}

const BothObjectsShape = defineShape({
    objects: {
        BasicObj: basicObjType,
        EntityObj: entityObType,
    },
});

function goodAddObject2(notebook: SupportedNotebookWithEntity) {
    if (notebook.supportsShape(BothObjectsShape)) {
        notebook.add(BasicObj, { name: "A" });
        notebook.add(EntityObj, { name: "E" });
    }
}

function badAddObject(notebook: SupportedNotebookWithEntity) {
    //@ts-expect-error We can't add a BasicObj without narrowing the notebook type because EntityObjectListShape does not support BasicObj.
    notebook.add(BasicObj, { name: "A" });

    //@ts-expect-error We can't add a EntityObj without narrowing the notebook type because not all notebooks support EntityObj.
    notebook.add(EntityObj, { name: "E" });
}

type JustEntityObjectListShape = Notebook<typeof EntityObjectListShape, unknown>;

function addEntityObject(notebook: JustEntityObjectListShape) {
    notebook.add(EntityObj, { name: "E" });
}
```

## A structurally compatible notebook is accepted and the appropriate morphism is added.

<!-- verifier:prepend-to-following -->

```ts
import { binder } from "catcolab-documents";
import { PetriNet } from "catcolab-logics/petri-net";

const petriNet = binder.createNotebook(PetriNet, { name: "example" });

addListMorphism({ notebook: petriNet });
```

```
Adding SymmetricListMor!
```

## A structurally incompatible notebook should be rejected

```ts
import { SimpleOlog } from "catcolab-logics/simple-olog";

const simpleOlog = binder.createNotebook(SimpleOlog, { name: "example" });

// @ts-expect-error A SimpleOlog notebook lacks the list-valued morphisms ListShape requires.
addListMorphism({ notebook: simpleOlog });
```
