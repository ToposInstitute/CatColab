import { Accessor, createContext } from "solid-js";

import { IndexedMap } from "../util/indexed_map";
import { ObjectId } from "./types";

export type ObjectNameMap = IndexedMap<ObjectId,string>;

export const ObjectNameMapContext = createContext<Accessor<ObjectNameMap>>();
