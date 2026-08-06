import { createContext, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { ApiBinder } from "./document_store";
import type { Api } from "./types";

/** Context for the CatColab API. */
export const ApiContext = createContext<Api>();

/** Retrieve CatColab API from application context. */
export function useApi(): Api {
    const api = useContext(ApiContext);
    invariant(api, "CatColab API should be provided as context");
    return api;
}

/** Context for the binder shared by the application. */
export const BinderContext = createContext<ApiBinder>();

/** Retrieve the shared binder from application context. */
export function useBinder(): ApiBinder {
    const binder = useContext(BinderContext);
    invariant(binder, "Binder should be provided as context");
    return binder;
}
