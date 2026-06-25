# How a shape avoids endpoint bugs

The olog and Petri-net editor comparisons
([`olog_editor_comparison.lts.md`](./olog_editor_comparison.lts.md),
[`petri_net_editor_comparison.lts.md`](./petri_net_editor_comparison.lts.md))
build the same editor over the unified `Notebook` API. A notebook over a shape
that declares its cell types constrains `add` to those types and derives each
morphism's endpoints from its `MorType` (and, for a list morphism, its declared
`modality`), so wiring an endpoint with the wrong cell is a compile error rather
than a corrupt document.

The examples below take three classes of endpoint mistake and show that a shaped
notebook rejects each at compile time, before any document is written.

## Bug 1: an endpoint of the wrong object type

A schema `Mapping` goes between entities (`Entity -> Entity`); an `Attr` goes
from an entity to an attribute type (`Entity -> AttrType`).

Because `Mapping` is `Hom(Entity)`, its codomain is `ObjectCell` of the `Entity`
type. Passing an attribute cell is a compile error, caught before any document
is written.

```ts
import { binder } from "catcolab-documents";
import { AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";

const notebook = binder.createNotebook(SimpleSchema, { name: "Schema" });
const person = notebook.add(Entity, { name: "Person" });
const age = notebook.add(AttrType, { name: "Age" });

// @ts-expect-error A Mapping's codomain must be an Entity cell, not an AttrType cell.
notebook.add(Mapping, { name: "broken", from: person, to: age });
```

## Bug 2: a single object where an endpoint list is required

A Petri-net transition's endpoints are _lists_ of places, declared with a
`SymmetricList` modality on the morphism (its morphism type stays the plain
`Hom(Object)` the core theory understands). A shaped `Transition` derives
`ObjectCell[]` for each endpoint from that modality, so a single place where a
list is required is rejected at compile time.

```ts
import { binder } from "catcolab-documents";
import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";

const notebook = binder.createNotebook(PetriNet, { name: "Net" });
const a = notebook.add(Place, { name: "A" });
const c = notebook.add(Place, { name: "C" });

// @ts-expect-error A transition endpoint is an array of Place cells, not a single Place.
notebook.add(Transition, { name: "fires", from: a, to: [c] });
```

## Bug 3: a cell from another theory or another notebook

A place handle from one notebook should not be wirable into a mapping in a
different schema notebook. With a shape the place handle is `ObjectCell` of the
`Place` type (`{ tag: "Basic", content: "Object" }`), which is not assignable to
the mapping's `Entity` endpoint (`{ tag: "Basic", content: "Entity" }`), so the
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
schema.add(Mapping, { name: "tangled", from: person, to: place });
```

## Why this matters

Declaring a shape moves the endpoint contract into the type system: `add` is
constrained to the shape's cell types, and each morphism's endpoints are derived
from its `MorType` and declared `modality` (`Hom(Entity)` wants an `Entity`
cell; a `SymmetricList` `Hom` wants a list). Wrong-type, wrong-arity, and
cross-theory endpoints become
compile-time errors instead of runtime surprises, while reads recover precise
handles with `cellsOf`.
