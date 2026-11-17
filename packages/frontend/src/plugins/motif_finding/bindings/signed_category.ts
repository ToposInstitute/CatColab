import { ThSignedCategory } from "catlog-wasm";
import type { MotifFinder } from "../types";

const thSignedCategory = new ThSignedCategory();

export const positiveLoops: MotifFinder = (model, options) =>
    thSignedCategory.positiveLoops(model, options);

export const negativeLoops: MotifFinder = (model, options) =>
    thSignedCategory.negativeLoops(model, options);
