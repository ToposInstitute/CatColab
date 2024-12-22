import { type Accessor, createContext } from "solid-js";

import type { LiveDiagramDocument } from "./document";

/** Context for a live diagram in a model. */
export const LiveDiagramContext = createContext<Accessor<LiveDiagramDocument>>();
