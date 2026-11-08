import { ThPolynomialODE } from "catlog-wasm";
import type { PolynomialODEEquations, PolynomialODESimulator } from "../types";

const thPolynomialODE = new ThPolynomialODE();

export const polynomialODESimulation: PolynomialODESimulator = (model, data) =>
    thPolynomialODE.polynomialODESimulation(model, data);

export const polynomialODEEquations: PolynomialODEEquations = (model, data) =>
    thPolynomialODE.polynomialODEEquations(model, data);
