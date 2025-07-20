import * as catlog from "catlog-wasm";
import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

import styles from "../styles.module.css";
import svgStyles from "../svg_styles.module.css";

export function createTheory(meta: TheoryMeta): Theory {
  const thCategoryLinks = new catlog.ThCategoryLinks();
  return new Theory({
    ...meta,
    theory: thCategoryLinks.theory(),
    onlyFreeModels: true,
    modelTypes: [
      {
        tag: "ObType",
        obType: { tag: "Basic", content: "Object" },
        name: "Stock",
        description: "Thing with an amount",
        shortcut: ["S"],
        cssClasses: [styles.box],
        svgClasses: [svgStyles.box],
      },
      {
        tag: "MorType",
        morType: {
          tag: "Hom",
          content: { tag: "Basic", content: "Object" },
        },
        name: "Flow",
        description: "Flow from one stock to another",
        shortcut: ["F"],
        arrowStyle: "double",
      },
      {
        tag: "MorType",
        morType: { tag: "Basic", content: "Link" },
        name: "Link",
        description: "Influence of a stock on a flow",
        preferUnnamed: true,
        shortcut: ["L"],
      },
    ],
    modelAnalyses: [
      analyses.configureStockFlowDiagram({
        id: "diagram",
        name: "Visualization",
        description: "Visualize the stock and flow diagram",
      }),
      analyses.configureMassAction({
        simulate(model, data) {
          return thCategoryLinks.massAction(model, data);
        },
        isTransition(mor) {
          return mor.morType.tag === "Hom";
        },
      }),
    ],
  });
}