import * as catlog from "catlog-wasm";
import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

export function createTheory(meta: TheoryMeta): Theory {
  const thNullableSignedCategory = new catlog.ThNullableSignedCategory();
  return new Theory({
    ...meta,
    theory: thNullableSignedCategory.theory(),
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
        description: "Variables change in the same direction",
        shortcut: ["P"],
        arrowStyle: "plus",
        preferUnnamed: true,
      },
      {
        tag: "MorType",
        morType: { tag: "Basic", content: "Negative" },
        name: "Negative link",
        shortcut: ["N"],
        description: "Variables change in the opposite direction",
        arrowStyle: "minus",
        preferUnnamed: true,
      },
      {
        tag: "MorType",
        morType: { tag: "Basic", content: "Zero" },
        name: "Indeterminate link",
        description: "The direction that variables change is indeterminate",
        shortcut: ["Z"],
        arrowStyle: "indeterminate",
        preferUnnamed: true,
      },
    ],
    modelAnalyses: [
      analyses.configureModelGraph({
        id: "diagram",
        name: "Visualization",
        description: "Visualize the causal loop diagram",
      }),
    ],
  });
}