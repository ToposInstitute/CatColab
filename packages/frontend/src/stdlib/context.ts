import { createContext } from "solid-js";

import type { TheoryLibrary } from "./types";

/** Context for the active library of double theories. */
export const TheoryLibraryContext = createContext<TheoryLibrary>();
