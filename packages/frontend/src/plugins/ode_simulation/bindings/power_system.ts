import { ThPowerSystem } from "catlog-wasm";
import type { KuramotoSimulator } from "../types";

const thPowerSystem = new ThPowerSystem();

export const kuramoto: KuramotoSimulator = (model, data) => thPowerSystem.kuramoto(model, data);
