import { ThSignedCategory } from "catlog-wasm";
import type { LinearODESimulator } from "./types";

const thSignedCategory = new ThSignedCategory();

export const linearODE: LinearODESimulator = (model, data) =>
    thSignedCategory.linearODE(model, data);
