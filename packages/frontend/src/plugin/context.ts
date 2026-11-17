import { createContext } from "solid-js";

import type { PluginRegistry } from "./registry";

/** Context for the active registry of plugins. */
export const PluginRegistryContext = createContext<PluginRegistry>();
