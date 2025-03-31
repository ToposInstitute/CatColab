import { createContext, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { Api } from "./types";

/** Context for the CatColab API. */
export const ApiContext = createContext<Api>();

/** Retrieve CatColab API from application context. */
export function useApi(): Api {
    const api = useContext(ApiContext);
    invariant(api, "CatColab API should be provided as context");
    return api;
}
