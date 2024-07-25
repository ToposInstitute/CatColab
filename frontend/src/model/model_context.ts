import { type Accessor, createContext } from "solid-js";

import type { InvalidDiscreteDblModel, ObId, Uuid } from "catlog-wasm";
import type { TheoryMeta } from "../theory";
import type { IndexedMap } from "../util/indexing";

export const TheoryContext = createContext<Accessor<TheoryMeta | undefined>>();

type ObjectIndex = IndexedMap<ObId, string>;

// Bidirectional mapping between object IDs and names.
export const ObjectIndexContext = createContext<Accessor<ObjectIndex>>();

type ModelErrors = Map<Uuid, InvalidDiscreteDblModel<Uuid>>;

export const ModelErrorsContext = createContext<Accessor<ModelErrors>>();
