import  { AnnotationSet } from "@inkandswitch/annotations";
import { createContext, useContext } from "solid-js";

/** Context for annotations.
 *
 * When provided (e.g., by gaios), notebook cells can display diff highlights.
 * When not provided, the frontend works normally without annotations.
 */
export const AnnotationsContext = createContext<AnnotationSet>();

const EMPTY_ANNOTATIONS = new AnnotationSet();

/** Hook to access the annotations context. Returns undefined if not provided. */
export function useAnnotations(): AnnotationSet {
    return useContext(AnnotationsContext) ?? EMPTY_ANNOTATIONS;
}
