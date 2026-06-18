# How a shape avoids endpoint bugs

The olog and Petri-net editor comparisons
([`olog_editor_comparison.lts.md`](./olog_editor_comparison.lts.md),
[`petri_net_editor_comparison.lts.md`](./petri_net_editor_comparison.lts.md))
build the same editor over the same unified `Notebook` API, differing only in
_what the compiler can see_. A notebook over an empty shape (one that declares
no cell types) adds cells from bare `ObType`/`MorType` values through
`addObject`/`addMorphism` and reads them back as untyped
`ObjectCell`/`MorphismCell` handles, so it cannot tell one object type from
another. A notebook over a shape that declares its cell types constrains `add`
to those types and derives each morphism's endpoints from its `MorType`, so
wiring an endpoint with the wrong cell is a compile error rather than a corrupt
document.

The examples below take the same editing actions through the empty-shape and the
shaped notebook and show, for three classes of bug, that the empty-shape version
compiles (and silently misbehaves at runtime) while the shaped version is
rejected by `tsc`.

## Bug 1: an endpoint of the wrong object type

A schema `Mapping` goes between entities (`Entity -> Entity`); an `Attr` goes
from an entity to an attribute type (`Entity -> AttrType`). With an empty-shape
notebook every object cell is the same `ObjectCell`, so pointing a mapping's
codomain at an attribute type type-checks and runs — the document silently
stores a mapping whose codomain is an attribute.

```ts
import { binder, defineShape } from "catcolab-documents";
import type { MorType, ObType } from "catcolab-document-types";

const Entity: ObType = { tag: "Basic", content: "Entity" };
const AttrType: ObType = { tag: "Basic", content: "AttrType" };
const Mapping: MorType = { tag: "Hom", content: { tag: "Basic", content: "Entity" } };

const EmptySchema = defineShape({ theory: "simple-schema", objects: {}, morphisms: {} });
const notebook = binder.createNotebook(EmptySchema, { name: "Schema" });
const person = notebook.addObject(Entity, { name: "Person" });
const age = notebook.addObject(AttrType, { name: "Age" });

// A Mapping must end on an Entity, but the empty-shape endpoint type is just
// `ObjectCell`, so the attribute cell `age` is accepted with no error.
const mapping = notebook.addMorphism(Mapping, { name: "broken", dom: person, cod: age });

const cod = mapping.cod;
console.log("codomain name:", Array.isArray(cod) ? cod.map((c) => c.name).join(", ") : cod.name);
console.log("codomain object type:", Array.isArray(cod) ? "" : cod.type.content);
```

```
codomain name: Age
codomain object type: AttrType
```

With a shape, `Mapping` is `Hom(Entity)`, so its codomain is `ObjectCell` of the
`Entity` type. Passing the attribute cell is a compile error, caught before any
document is written.

```ts
import { binder } from "catcolab-documents";
import { AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";

const notebook = binder.createNotebook(SimpleSchema, { name: "Schema" });
const person = notebook.add(Entity, { name: "Person" });
const age = notebook.add(AttrType, { name: "Age" });

// @ts-expect-error A Mapping's codomain must be an Entity cell, not an AttrType cell.
notebook.add(Mapping, { name: "broken", dom: person, cod: age });
```

## Bug 2: a single object where an endpoint list is required

A Petri-net transition's endpoints are _lists_ of places, recorded as a
`SymmetricList` modality on its morphism type. The empty-shape `addMorphism`
endpoint type is `ObjectCell | ObjectCell[]`, so a bare place is accepted in
place of a list. The stored shape follows the morphism type rather than the
argument, so the bare place is silently wrapped into a one-element list instead
of being flagged — the mistake compiles, runs, and goes unnoticed.

```ts
import { binder, defineShape } from "catcolab-documents";
import type { MorType, ObType } from "catcolab-document-types";

const Place: ObType = { tag: "Basic", content: "Object" };
const Transition: MorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "SymmetricList", obType: { tag: "Basic", content: "Object" } },
    },
};

const EmptyPetriNet = defineShape({ theory: "petri-net", objects: {}, morphisms: {} });
const notebook = binder.createNotebook(EmptyPetriNet, { name: "Net" });
const a = notebook.addObject(Place, { name: "A" });
const c = notebook.addObject(Place, { name: "C" });

// `dom` should be a list of places, but a single place type-checks just as
// readily. The endpoint shape comes from the morphism type, so the bare place
// is silently wrapped into a one-element list rather than rejected.
const transition = notebook.addMorphism(Transition, { name: "fires", dom: a, cod: [c] });

console.log("dom stored as array:", Array.isArray(transition.dom));
console.log("cod stored as array:", Array.isArray(transition.cod));
```

```
dom stored as array: true
cod stored as array: true
```

A shaped `Transition` derives `ObjectCell[]` for each endpoint from its
`SymmetricList` modality, so the single place is rejected at compile time.

```ts
import { binder } from "catcolab-documents";
import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";

const notebook = binder.createNotebook(PetriNet, { name: "Net" });
const a = notebook.add(Place, { name: "A" });
const c = notebook.add(Place, { name: "C" });

// @ts-expect-error A transition endpoint is an array of Place cells, not a single Place.
notebook.add(Transition, { name: "fires", dom: a, cod: [c] });
```

## Bug 3: a cell from another theory or another notebook

An empty-shape object handle erases both the theory and the object type, so a
place handle from one notebook can be wired into a mapping in a different schema
notebook. It compiles, but the referenced cell does not exist in the target
document, so reading the endpoint back throws at runtime — a failure that only
surfaces once the editor renders that cell.

<!-- verifier:throws -->

```ts
import { binder, defineShape } from "catcolab-documents";
import type { MorType, ObType } from "catcolab-document-types";

const Place: ObType = { tag: "Basic", content: "Object" };
const Entity: ObType = { tag: "Basic", content: "Entity" };
const Mapping: MorType = { tag: "Hom", content: { tag: "Basic", content: "Entity" } };

const EmptyPetriNet = defineShape({ theory: "petri-net", objects: {}, morphisms: {} });
const net = binder.createNotebook(EmptyPetriNet, { name: "Net" });
const place = net.addObject(Place, { name: "A place" });

const EmptySchema = defineShape({ theory: "simple-schema", objects: {}, morphisms: {} });
const schema = binder.createNotebook(EmptySchema, { name: "Schema" });
const person = schema.addObject(Entity, { name: "Person" });

// `place` belongs to a different notebook and theory, but both are just
// `ObjectCell`, so wiring it into the schema mapping type-checks.
const mapping = schema.addMorphism(Mapping, { name: "tangled", dom: person, cod: place });

// Reading the endpoint back fails: the place id is not in this document.
const cod = mapping.cod;
console.log(Array.isArray(cod) ? cod.length : cod.name);
```

```
No object cell found for endpoint
```

With a shape the place handle is `ObjectCell` of the `Place` type
(`{ tag: "Basic", content: "Object" }`), which is not assignable to the
mapping's `Entity` endpoint (`{ tag: "Basic", content: "Entity" }`), so the
cross-theory wiring is a compile error.

```ts
import { binder } from "catcolab-documents";
import { PetriNet, Place } from "catcolab-logics/petri-net";
import { Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";

const net = binder.createNotebook(PetriNet, { name: "Net" });
const place = net.add(Place, { name: "A place" });

const schema = binder.createNotebook(SimpleSchema, { name: "Schema" });
const person = schema.add(Entity, { name: "Person" });

// @ts-expect-error `place` is a Place cell from another theory; a Mapping endpoint needs an Entity cell.
schema.add(Mapping, { name: "tangled", dom: person, cod: place });
```

## Why this matters

In each case the same `Notebook` API is used; only the shape differs. A
empty-shape notebook keeps the endpoint contract at runtime: nothing checks that
a `dom` or `cod` holds the right kind of object, so wrong-type, wrong-arity, and
dangling endpoints all type-check and fail only when the cell is read. Declaring
a shape moves that contract into the type system: `add` is constrained to the
shape's cell types, and each morphism's endpoints are derived from its `MorType`
(`Hom(Entity)` wants an `Entity` cell; a `SymmetricList` `Hom` wants a list).
The mistakes above stop being runtime surprises and become compile-time errors,
while reads still go through the untyped `cells()` and recover precise handles
with `byObjectType`/`byMorphismType`.
