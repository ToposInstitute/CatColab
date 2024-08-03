import { type Accessor, createContext } from "solid-js";

import type { InvalidDiscreteDblModel, Uuid } from "catlog-wasm";
import type { TheoryMeta } from "../theory";
import type { IndexedMap } from "../util/indexing";

/** The theory that the model is a model of.
 */
export const TheoryContext = createContext<Accessor<TheoryMeta | undefined>>();

/** Indexed mapping from object IDs to human-readable names.
 */
export const ObjectIndexContext = createContext<Accessor<IndexedMap<Uuid, string>>>();

/** Indexed mapping from morphism IDs to human-readable names.
 */
export const MorphismIndexContext = createContext<Accessor<IndexedMap<Uuid, string>>>();

export const ModelErrorsContext =
    createContext<Accessor<Map<Uuid, InvalidDiscreteDblModel<Uuid>[]>>>();
