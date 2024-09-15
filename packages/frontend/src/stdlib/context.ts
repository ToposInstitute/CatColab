import { createContext } from "solid-js";

import type { TheoryLibrary } from "./types";

/** Context containing the active library of theories. */
export const TheoryLibraryContext = createContext<TheoryLibrary>();
