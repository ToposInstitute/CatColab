import { ThNullableSignedCategory } from "catlog-wasm";
import type { MotifFinder } from "../types";

const thNullableSignedCategory = new ThNullableSignedCategory();

export const positiveLoops: MotifFinder = (model, options) =>
    thNullableSignedCategory.positiveLoops(model, options);

export const negativeLoops: MotifFinder = (model, options) =>
    thNullableSignedCategory.negativeLoops(model, options);

export const indeterminateLoops: MotifFinder = (model, options) =>
    thNullableSignedCategory.indeterminateLoops(model, options);
