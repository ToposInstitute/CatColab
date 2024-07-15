import { Accessor, createContext } from "solid-js";

import { IndexedMap } from "../util/indexing";
import { TheoryMeta } from "../theory";
import { ObjectId } from "./types";

export const TheoryContext = createContext<Accessor<TheoryMeta | undefined>>();

// Bidirectional mapping between object IDs and names.
export type ObjectIndex = IndexedMap<ObjectId,string>;

export const ObjectIndexContext = createContext<Accessor<ObjectIndex>>();
