import { type Accessor, createContext } from "solid-js";

import type { LiveModelDocument } from "./document";

/** Context for a live model. */
export const LiveModelContext = createContext<Accessor<LiveModelDocument>>();
