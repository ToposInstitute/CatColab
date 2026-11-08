import { ThSignedPolynomialODE } from "catlog-wasm";
import type { PolynomialODEEquations, PolynomialODESimulator } from "../types";

const thSignedPolynomialODE = new ThSignedPolynomialODE();

export const polynomialODESimulation: PolynomialODESimulator = (model, data) =>
    thSignedPolynomialODE.polynomialODESimulation(model, data);

export const polynomialODEEquations: PolynomialODEEquations = (model, data) =>
    thSignedPolynomialODE.polynomialODEEquations(model, data);
