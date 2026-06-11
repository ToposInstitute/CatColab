import { type Accessor, createContext } from "solid-js";

import type { DiagramLibrary } from "./diagram_library";
import type { LiveDiagramDoc } from "./document";

/** Context for a library of diagrams. */
export const DiagramLibraryContext = createContext<DiagramLibrary<string>>();

/** Context for a live diagram in a model. */
export const LiveDiagramContext = createContext<Accessor<LiveDiagramDoc>>();
