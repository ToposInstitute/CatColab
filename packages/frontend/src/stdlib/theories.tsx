import { TheoryLibrary } from "./types";

// Import all theory creators directly (no lazy loading, but better organization)
import { createTheory as createEmptyTheory } from "./theories/empty";
import { createTheory as createSimpleOlogTheory } from "./theories/simple-olog";
import { createTheory as createSimpleSchemaTheory } from "./theories/simple-schema";
import { createTheory as createRegNetTheory } from "./theories/reg-net";
import { createTheory as createCausalLoopTheory } from "./theories/casual-loop";
import { createTheory as createCausalLoopDelaysTheory } from "./theories/casual-loop-delays";
import { createTheory as createIndeterminateCausalLoopTheory } from "./theories/indeterminate-casual-loop";
import { createTheory as createUnaryDecTheory } from "./theories/unary-dec";
import { createTheory as createPrimitiveStockFlowTheory } from "./theories/primitive-stock-flow";
import { createTheory as createPetriNetTheory } from "./theories/petri-net";

/** Standard library of double theories supported by the frontend. */
export const stdTheories = new TheoryLibrary();

// Add all theories
stdTheories.add(
  {
    id: "empty",
    name: "Informal",
    description: "The empty logic, allowing only informal content",
    isDefault: true,
    group: "Base",
    help: "empty",
  },
  createEmptyTheory,
);

stdTheories.add(
  {
    id: "simple-olog",
    name: "Olog",
    description: "Ontology log, a simple conceptual model",
    group: "Knowledge and Data",
    help: "olog",
  },
  createSimpleOlogTheory,
);

stdTheories.add(
  {
    id: "simple-schema",
    name: "Schema",
    description: "Schema for a categorical database",
    group: "Knowledge and Data",
    help: "schema",
  },
  createSimpleSchemaTheory,
);

stdTheories.add(
  {
    id: "reg-net",
    name: "Regulatory network",
    description: "Biochemical species that promote or inhibit each other",
    group: "Biology",
    help: "reg-net",
  },
  createRegNetTheory,
);

stdTheories.add(
  {
    id: "causal-loop",
    name: "Causal loop diagram",
    description: "Positive and negative causal relationships",
    group: "System Dynamics",
    help: "causal-loop",
  },
  createCausalLoopTheory,
);

stdTheories.add(
  {
    id: "causal-loop-delays",
    name: "Causal loop diagram with delays",
    description: "Causal relationships: positive or negative, fast or slow",
    group: "System Dynamics",
    help: "causal-loop-delays",
  },
  createCausalLoopDelaysTheory,
);

stdTheories.add(
  {
    id: "indeterminate-causal-loop",
    name: "Causal loop diagram with indeterminates",
    description: "Positive, negative, and indeterminate causal relationships",
    group: "System Dynamics",
    help: "indeterminate-causal-loop",
  },
  createIndeterminateCausalLoopTheory,
);

stdTheories.add(
  {
    id: "unary-dec",
    name: "Discrete exterior calculus (DEC)",
    description: "DEC operators on a geometrical space",
    group: "Applied Mathematics",
    help: "unary-dec",
  },
  createUnaryDecTheory,
);

stdTheories.add(
  {
    id: "primitive-stock-flow",
    name: "Stock and flow",
    description: "Model accumulation (stocks) and change (flows)",
    group: "System Dynamics",
    help: "stock-flow",
  },
  createPrimitiveStockFlowTheory,
);

stdTheories.add(
  {
    id: "petri-net",
    name: "Petri net",
    description: "Place/transition networks",
    group: "Systems",
  },
  createPetriNetTheory,
);