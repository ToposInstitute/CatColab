import { type Accessor, createContext } from "solid-js";

import type { InvalidDiscreteDblModel, Uuid } from "catlog-wasm";
import type { TheoryMeta } from "../theory";
import type { IndexedMap } from "../util/indexing";

// The theory that the model is a model of.
export const TheoryContext = createContext<Accessor<TheoryMeta | undefined>>();

// Bidirectional mapping between object IDs and names.
export const ObjectIndexContext = createContext<Accessor<IndexedMap<Uuid, string>>>();

export const ModelErrorsContext =
    createContext<Accessor<Map<Uuid, InvalidDiscreteDblModel<Uuid>[]>>>();
