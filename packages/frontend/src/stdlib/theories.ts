import { TheoryLibrary } from "./types";

/** Standard library of double theories supported by the frontend. */
export const stdTheories = new TheoryLibrary();

stdTheories.add(
    {
        id: "empty",
        name: "Informal",
        description: "The empty logic, allowing only informal content",
        isDefault: true,
        group: "Base",
    },
    async () => (await import("./theories/empty")).default,
);

stdTheories.add(
    {
        id: "simple-olog",
        name: "Olog",
        description: "Ontology log, a simple conceptual model",
        group: "Knowledge and Data",
    },
    async () => (await import("./theories/simple-olog")).default,
);

stdTheories.add(
    {
        id: "simple-schema",
        name: "Schema",
        description: "Schema for a categorical database",
        group: "Knowledge and Data",
    },
    async () => (await import("./theories/simple-schema")).default,
);

stdTheories.add(
    {
        id: "petri-net",
        name: "Petri net",
        description: "Place/transition networks",
        group: "Systems",
    },
    async () => (await import("./theories/petri-net")).default,
);

stdTheories.add(
    {
        id: "causal-loop",
        name: "Causal loop diagram",
        description: "Positive and negative causal relationships",
        group: "System Dynamics",
    },
    async () => (await import("./theories/causal-loop")).default,
);

stdTheories.add(
    {
        id: "causal-loop-delays",
        name: "Causal loop diagram with delays",
        description: "Causal relationships: positive or negative, fast or slow",
        group: "System Dynamics",
    },
    async () => (await import("./theories/causal-loop-delays")).default,
);

stdTheories.add(
    {
        id: "indeterminate-causal-loop",
        name: "Causal loop diagram with indeterminates",
        description: "Positive, negative, and indeterminate causal relationships",
        group: "System Dynamics",
    },
    async () => (await import("./theories/indeterminate-causal-loop")).default,
);

stdTheories.add(
    {
        id: "extended-causal-loop",
        name: "Extended causal loop diagram",
        description: "Causal relationships: positive or negative, with explicit degree and delay",
        group: "System Dynamics",
    },
    async () => (await import("./theories/extended-causal-loop")).default,
);

stdTheories.add(
    {
        id: "primitive-stock-flow",
        name: "Stock and flow",
        description: "Model accumulation (stocks) and change (flows)",
        group: "System Dynamics",
    },
    async () => (await import("./theories/primitive-stock-flow")).default,
);

stdTheories.add(
    {
        id: "reg-net",
        name: "Regulatory network",
        description: "Biochemical species that promote or inhibit each other",
        group: "Biology",
    },
    async () => (await import("./theories/reg-net")).default,
);

stdTheories.add(
    {
        id: "unary-dec",
        name: "Discrete exterior calculus (DEC)",
        description: "DEC operators on a geometrical space",
        group: "Applied Mathematics",
    },
    async () => (await import("./theories/unary-dec")).default,
);
