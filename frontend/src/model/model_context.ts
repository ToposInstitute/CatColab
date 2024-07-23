import { type Accessor, createContext } from "solid-js";

import type { ObId } from "catlog-wasm";
import type { TheoryMeta } from "../theory";
import type { IndexedMap } from "../util/indexing";

export const TheoryContext = createContext<Accessor<TheoryMeta | undefined>>();

// Bidirectional mapping between object IDs and names.
export type ObjectIndex = IndexedMap<ObId, string>;

export const ObjectIndexContext = createContext<Accessor<ObjectIndex>>();
