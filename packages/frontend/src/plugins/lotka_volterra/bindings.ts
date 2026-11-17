import { ThSignedCategory } from "catlog-wasm";
import type { LotkaVolterraSimulator } from "./types";

const thSignedCategory = new ThSignedCategory();

export const lotkaVolterra: LotkaVolterraSimulator = (model, data) =>
    thSignedCategory.lotkaVolterra(model, data);
