import * as catlog from "catlog-wasm";
import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

export function createTheory(meta: TheoryMeta): Theory {
  const thDelayedSignedCategory = new catlog.ThDelayableSignedCategory();

  return new Theory({
    ...meta,
    theory: thDelayedSignedCategory.theory(),
    onlyFreeModels: true,
    modelTypes: [
      {
        tag: "ObType",
        obType: { tag: "Basic", content: "Object" },
        name: "Variable",
        shortcut: ["V"],
        description: "Variable quantity",
      },
      {
        tag: "MorType",
        morType: {
          tag: "Hom",
          content: { tag: "Basic", content: "Object" },
        },
        name: "Positive link",
        shortcut: ["P"],
        description: "Fast-acting positive influence",
        arrowStyle: "plus",
        preferUnnamed: true,
      },
      {
        tag: "MorType",
        morType: { tag: "Basic", content: "Negative" },
        name: "Negative link",
        shortcut: ["N"],
        description: "Fast-acting negative influence",
        arrowStyle: "minus",
        preferUnnamed: true,
      },
      {
        tag: "MorType",
        morType: { tag: "Basic", content: "PositiveSlow" },
        name: "Delayed positive link",
        description: "Slow-acting positive influence",
        arrowStyle: "plusCaesura",
        preferUnnamed: true,
      },
      {
        tag: "MorType",
        morType: { tag: "Basic", content: "NegativeSlow" },
        name: "Delayed negative link",
        description: "Slow-acting negative influence",
        arrowStyle: "minusCaesura",
        preferUnnamed: true,
      },
    ],
    modelAnalyses: [
      analyses.configureModelGraph({
        id: "diagram",
        name: "Visualization",
        description: "Visualize the causal loop diagram",
      }),
      analyses.configureSubmodelsAnalysis({
        id: "negative-loops",
        name: "Balancing loops",
        description: "Find the fast-acting balancing loops",
        findSubmodels(model, options) {
          return thDelayedSignedCategory.negativeLoops(model, options);
        },
      }),
      analyses.configureSubmodelsAnalysis({
        id: "positive-loops",
        name: "Reinforcing loops",
        description: "Find the fast-acting reinforcing loops",
        findSubmodels(model, options) {
          return thDelayedSignedCategory.positiveLoops(model, options);
        },
      }),
      analyses.configureSubmodelsAnalysis({
        id: "delayed-negative-loops",
        name: "Delayed balancing loops",
        description: "Find the slow-acting balancing loops",
        findSubmodels(model, options) {
          return thDelayedSignedCategory.delayedNegativeLoops(model, options);
        },
      }),
      analyses.configureSubmodelsAnalysis({
        id: "delayed-positive-loops",
        name: "Delayed reinforcing loops",
        description: "Find the slow-acting reinforcing loops",
        findSubmodels(model, options) {
          return thDelayedSignedCategory.delayedPositiveLoops(model, options);
        },
      }),
    ],
  });
}