import { ThSymMonoidalCategory } from "catlog-wasm";
import type { MassActionEquations, MassActionSimulator } from "../types";

const thSymMonoidalCategory = new ThSymMonoidalCategory();

export const massAction: MassActionSimulator = (model, data) =>
    thSymMonoidalCategory.massAction(model, data);

export const massActionEquations: MassActionEquations = (model, data) =>
    thSymMonoidalCategory.massActionEquations(model, data);
