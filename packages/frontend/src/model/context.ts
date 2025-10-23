import { type Accessor, createContext } from "solid-js";

import type { LiveModelDocument } from "./document";
import type { ModelLibrary } from "./model_library";

/** Context for a library of models. */
export const ModelLibraryContext = createContext<ModelLibrary<string>>();

/** Context for the active live model. */
export const LiveModelContext = createContext<Accessor<LiveModelDocument>>();
