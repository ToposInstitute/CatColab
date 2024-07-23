import { Accessor, createContext } from "solid-js";

import { ObId } from "catlog-wasm";
import { IndexedMap } from "../util/indexing";
import { TheoryMeta } from "../theory";

export const TheoryContext = createContext<Accessor<TheoryMeta | undefined>>();

// Bidirectional mapping between object IDs and names.
export type ObjectIndex = IndexedMap<ObId,string>;

export const ObjectIndexContext = createContext<Accessor<ObjectIndex>>();
