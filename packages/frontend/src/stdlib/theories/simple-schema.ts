import * as catlog from "catlog-wasm";
import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

import styles from "../styles.module.css";
import svgStyles from "../svg_styles.module.css";
import textStyles from "../text_styles.module.css";

export function createTheory(meta: TheoryMeta): Theory {
  const thSchema = new catlog.ThSchema();
  return new Theory({
    ...meta,
    theory: thSchema.theory(),
    modelTypes: [
      {
        tag: "ObType",
        obType: { tag: "Basic", content: "Entity" },
        name: "Entity",
        description: "Type of entity or thing",
        shortcut: ["O"],
        cssClasses: [styles.box],
        svgClasses: [svgStyles.box],
        textClasses: [textStyles.code],
      },
      {
        tag: "MorType",
        morType: {
          tag: "Hom",
          content: { tag: "Basic", content: "Entity" },
        },
        name: "Mapping",
        description: "Many-to-one relation between entities",
        shortcut: ["M"],
        textClasses: [textStyles.code],
      },
      {
        tag: "MorType",
        morType: { tag: "Basic", content: "Attr" },
        name: "Attribute",
        description: "Data attribute of an entity",
        shortcut: ["A"],
        textClasses: [textStyles.code],
      },
      {
        tag: "ObType",
        obType: { tag: "Basic", content: "AttrType" },
        name: "Attribute type",
        description: "Data type for an attribute",
        textClasses: [textStyles.code],
      },
      {
        tag: "MorType",
        morType: {
          tag: "Hom",
          content: { tag: "Basic", content: "AttrType" },
        },
        name: "Operation",
        description: "Operation on data types for attributes",
        textClasses: [textStyles.code],
      },
    ],
    instanceTypes: [
      {
        tag: "ObType",
        obType: { tag: "Basic", content: "Entity" },
        name: "Individual",
        description: "Individual entity of a certain type",
        shortcut: ["I"],
      },
      {
        tag: "MorType",
        morType: {
          tag: "Hom",
          content: { tag: "Basic", content: "Entity" },
        },
        name: "Maps to",
        description: "One individual mapped to another",
        shortcut: ["M"],
      },
      {
        tag: "MorType",
        morType: { tag: "Basic", content: "Attr" },
        name: "Attribute",
        description: "Data attribute of an individual",
        shortcut: ["A"],
      },
      {
        tag: "ObType",
        obType: { tag: "Basic", content: "AttrType" },
        name: "Attribute variable",
        description: "Variable that can be bound to attribute values",
      },
    ],
    modelAnalyses: [
      analyses.configureModelGraph({
        id: "diagram",
        name: "Visualization",
        description: "Visualize the schema as a graph",
      }),
    ],
    diagramAnalyses: [
      analyses.configureDiagramGraph({
        id: "graph",
        name: "Visualization",
        description: "Visualize the instance as a graph",
      }),
    ],
  });
}