/** Contexts available to formal cells in a model notebook.

@module
 */

import { type Accessor, createContext } from "solid-js";

import type { Uuid } from "catlog-wasm";
import type { Theory } from "../theory";
import type { IndexedMap } from "../util/indexing";
import type { ModelValidationResult } from "./types";

/** Context for the theory that the model is a model of.
 */
export const TheoryContext = createContext<Accessor<Theory | undefined>>();

/** Context for indexed mapping from object IDs to human-readable names.
 */
export const ObjectIndexContext = createContext<Accessor<IndexedMap<Uuid, string>>>();

/** Context for indexed mapping from morphism IDs to human-readable names.
 */
export const MorphismIndexContext = createContext<Accessor<IndexedMap<Uuid, string>>>();

/** Context for the result of validating the model.
 */
export const ModelValidationContext = createContext<Accessor<ModelValidationResult>>();
