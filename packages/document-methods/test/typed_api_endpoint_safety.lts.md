# How the typed API avoids endpoint bugs

The olog and Petri-net editor comparisons
([`olog_editor_comparison.lts.md`](./olog_editor_comparison.lts.md),
[`petri_net_editor_comparison.lts.md`](./petri_net_editor_comparison.lts.md))
show three tiers of API that produce identical editors and identical output. The
tiers diverge only in _what mistakes the compiler can see_. The reduced frontend
hand-encodes endpoints as raw `Ob` values and the generic API exposes them as
unbranded `GenericObjectCell` handles, so neither can tell one object type from
another. The typed logic API brands each cell with its declared type, so wiring
an endpoint with the wrong cell is a compile error rather than a corrupt
document.

The examples below take the same editing actions through the generic and typed
APIs and show, for three classes of bug, that the generic version compiles (and
silently misbehaves at runtime) while the typed version is rejected by `tsc`.

## Bug 1: an endpoint of the wrong object type

A schema `Mapping` goes between entities (`Entity -> Entity`); an `Attr` goes
from an entity to an attribute type (`Entity -> AttrType`). With the generic API,
every object cell is the same `GenericObjectCell`, so pointing a mapping's
codomain at an attribute type type-checks and runs — the document silently
stores a mapping whose codomain is an attribute.

```ts
import { binder } from "catcolab-documents";
import type { MorType, ObType } from "catcolab-document-types";

const Entity: ObType = { tag: "Basic", content: "Entity" };
const AttrType: ObType = { tag: "Basic", content: "AttrType" };
const Mapping: MorType = { tag: "Hom", content: { tag: "Basic", content: "Entity" } };

const notebook = binder.createGenericNotebook("simple-schema", { name: "Schema" });
const person = notebook.addObject(Entity, { name: "Person" });
const age = notebook.addObject(AttrType, { name: "Age" });

// A Mapping must end on an Entity, but the generic endpoint type is just
// `GenericObjectCell`, so the attribute cell `age` is accepted with no error.
const mapping = notebook.addMorphism(Mapping, { name: "broken", dom: person, cod: age });

console.log("codomain name:", mapping.cod.name);
console.log("codomain object type:", mapping.cod.type.content);
```

```
codomain name: Age
codomain object type: AttrType
```

With the typed logic, `Mapping`'s codomain is `ObjectCell<EntityType>`. Passing
the attribute cell is a compile error, caught before any document is written.

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

A Petri-net transition's endpoints are _lists_ of places, which the transition's
morphism type records as a `SymmetricList` modality. The generic `addMorphism`
endpoint type is `GenericObjectCell | GenericObjectCell[]`, so a bare place is
accepted in place of a list. The stored shape follows the morphism type rather
than the argument, so the bare place is silently wrapped into a one-element list
instead of being flagged — the mistake compiles, runs, and goes unnoticed.

```ts
import { binder } from "catcolab-documents";
import type { MorType, ObType } from "catcolab-document-types";

const Place: ObType = { tag: "Basic", content: "Object" };
const Transition: MorType = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "SymmetricList", obType: { tag: "Basic", content: "Object" } },
    },
};

const notebook = binder.createGenericNotebook("petri-net", { name: "Net" });
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

The typed `Transition` requires `ObjectCell<PlaceType>[]` for each endpoint, so
the single place is rejected at compile time.

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

Because the generic handle erases both the theory and the declared type, a place
handle from one notebook can be wired into a mapping in a different schema
notebook. It compiles, but the referenced cell does not exist in the target
document, so reading the endpoint back throws at runtime — a failure that only
surfaces once the editor renders that cell.

<!-- verifier:throws -->

```ts
import { binder } from "catcolab-documents";
import type { MorType, ObType } from "catcolab-document-types";

const Place: ObType = { tag: "Basic", content: "Object" };
const Entity: ObType = { tag: "Basic", content: "Entity" };
const Mapping: MorType = { tag: "Hom", content: { tag: "Basic", content: "Entity" } };

const net = binder.createGenericNotebook("petri-net", { name: "Net" });
const place = net.addObject(Place, { name: "A place" });

const schema = binder.createGenericNotebook("simple-schema", { name: "Schema" });
const person = schema.addObject(Entity, { name: "Person" });

// `place` belongs to a different notebook and theory, but both are just
// `GenericObjectCell`, so wiring it into the schema mapping type-checks.
const mapping = schema.addMorphism(Mapping, { name: "tangled", dom: person, cod: place });

// Reading the endpoint back fails: the place id is not in this document.
console.log(mapping.cod.name);
```

```
No object cell found for endpoint
```

The typed API tags the place handle as `ObjectCell<ObjectType<"Place">>`, which
is not assignable to the mapping's `ObjectCell<EntityType>` endpoint, so the
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

In each case the bug is the same one the reduced frontend is exposed to: the
endpoint contract lives only in hand-written encode/decode helpers
(`encodePlaceIds`/`placeIds` in the Petri-net comparison), so nothing checks that
a `dom` or `cod` actually holds the right kind of object. The generic API keeps
that contract at runtime. The typed logic moves it into the type system: object
and morphism cells are branded with their declared type names, endpoint
arguments are constrained by the morphism type, and `update`'s `ValidateFields`
produces targeted messages such as `Expected object cell of type "Entity", got
"AttrType".`. The mistakes above stop being runtime surprises and become
compile-time errors.
