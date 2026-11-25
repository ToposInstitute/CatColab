import { ThCategoryLinks } from "catlog-wasm";
import type { MassActionEquations, MassActionSimulator } from "../types";

const thCategoryLinks = new ThCategoryLinks();

export const massAction: MassActionSimulator = (model, data) =>
    thCategoryLinks.massAction(model, data);

export const massActionEquations: MassActionEquations = (model, data) =>
    thCategoryLinks.massActionEquations(model, data);
