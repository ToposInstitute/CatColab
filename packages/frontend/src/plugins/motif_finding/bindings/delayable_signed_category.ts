import { ThDelayableSignedCategory } from "catlog-wasm";
import type { MotifFinder } from "../types";

const thDelayableSignedCategory = new ThDelayableSignedCategory();

export const positiveLoops: MotifFinder = (model, options) =>
    thDelayableSignedCategory.positiveLoops(model, options);

export const negativeLoops: MotifFinder = (model, options) =>
    thDelayableSignedCategory.negativeLoops(model, options);

export const delayedPositiveLoops: MotifFinder = (model, options) =>
    thDelayableSignedCategory.delayedPositiveLoops(model, options);

export const delayedNegativeLoops: MotifFinder = (model, options) =>
    thDelayableSignedCategory.delayedNegativeLoops(model, options);
