import { type Accessor, createContext } from "solid-js";

import type { LiveInstanceDoc } from "./document";

/** Context for a live diagram in a model. */
export const LiveInstanceContext = createContext<Accessor<LiveInstanceDoc>>();
