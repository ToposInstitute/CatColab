import { ThSignedCategory } from "catlog-wasm";
import type { LinearODESimulator, LotkaVolterraSimulator } from "../types";

const thSignedCategory = new ThSignedCategory();

export const linearODE: LinearODESimulator = (model, data) =>
    thSignedCategory.linearODE(model, data);

export const lotkaVolterra: LotkaVolterraSimulator = (model, data) =>
    thSignedCategory.lotkaVolterra(model, data);
