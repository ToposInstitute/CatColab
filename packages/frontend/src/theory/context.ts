import { createContext } from "solid-js";

import type { TheoryLibrary } from "./theory_library";

/** Context for the active library of double theories. */
export const TheoryLibraryContext = createContext<TheoryLibrary>();
