import { ThCategorySignedLinks } from "catlog-wasm";
import type { MassActionEquations, MassActionSimulator } from "../types";

const thCategorySignedLinks = new ThCategorySignedLinks();

export const massAction: MassActionSimulator = (model, data) =>
    thCategorySignedLinks.massAction(model, data);

export const massActionEquations: MassActionEquations = (model, data) =>
    thCategorySignedLinks.massActionEquations(model, data);
