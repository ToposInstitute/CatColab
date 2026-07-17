import { type Resource, createContext, useContext } from "solid-js";
import invariant from "tiny-invariant";

/** Resolved value of the inference key resource.

`Unavailable` is a normal state---the backend has no inference configured
(HTTP 503, `InferenceUnavailable`)---and is distinct from an error, which
surfaces on the resource's `error` property rather than as a value.
 */
export type InferenceKeyResult = { tag: "Ready"; key: string } | { tag: "Unavailable" };

/** Context for the authenticated user's inference key resource. */
export const InferenceKeyContext = createContext<Resource<InferenceKeyResult>>();

/** Retrieve the inference key resource from application context. */
export function useInferenceKey(): Resource<InferenceKeyResult> {
    const key = useContext(InferenceKeyContext);
    invariant(key !== undefined, "Inference key should be provided as context");
    return key;
}
