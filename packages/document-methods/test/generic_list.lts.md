# A function written against a list shape

<!-- verifier:prepend-to-following -->

```ts
import { binder, defineShape, type Notebook } from "catcolab-documents";

import { MorType, ObType } from "catcolab-document-types";

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
    //@ts-expect-error We can't use 
    notebook.add(ListMor, { name: "L2", dom: [a, b], cod: [e] });
}
```


## A structurally compatible notebook is accepted

<!-- verifier:prepend-to-following -->

```ts
import { PetriNet } from "catcolab-logics/petri-net";

const petriNet = binder.createNotebook(PetriNet, { name: "example" });

addListMorphism({ notebook: petriNet });
```

## A structurally incompatible notebook should be rejected

```ts
import { SimpleOlog } from "catcolab-logics/simple-olog";

const simpleOlog = binder.createNotebook(SimpleOlog, { name: "example" });

// @ts-expect-error A SimpleOlog notebook lacks the list-valued morphisms ListShape requires.
addListMorphism({ notebook: simpleOlog });
```
