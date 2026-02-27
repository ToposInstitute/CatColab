import { TheoryLibrary } from "../theory";

/** Standard library of double theories supported by the frontend. */
export const stdTheories = new TheoryLibrary();

stdTheories.add(
    {
        id: "empty",
        name: "Informal",
        description: "The empty logic, allowing only informal content",
        iconLetters: ["I", "n"],
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
        iconLetters: ["O", "l"],
        group: "Knowledge and Data",
    },
    async () => (await import("./theories/simple-olog")).default,
);

stdTheories.add(
    {
        id: "simple-schema",
        name: "Schema",
        description: "Schema for a categorical database",
        iconLetters: ["S", "c"],
        group: "Knowledge and Data",
    },
    async () => (await import("./theories/simple-schema")).default,
);

stdTheories.add(
    {
        id: "petri-net",
        name: "Petri net",
        description: "Place/transition networks",
        iconLetters: ["P", "n"],
        group: "Systems",
    },
    async () => (await import("./theories/petri-net")).default,
);

stdTheories.add(
    {
        id: "causal-loop",
        name: "Causal loop diagram",
        description: "Positive and negative causal relationships",
        iconLetters: ["C", "l"],
        group: "System Dynamics",
    },
    async () => (await import("./theories/causal-loop")).default,
);

stdTheories.add(
    {
        id: "causal-loop-delays",
        name: "Causal loop diagram with delays",
        description: "Causal relationships: positive or negative, fast or slow",
        iconLetters: ["C", "d"],
        group: "System Dynamics",
    },
    async () => (await import("./theories/causal-loop-delays")).default,
);

stdTheories.add(
    {
        id: "indeterminate-causal-loop",
        name: "Causal loop diagram with indeterminates",
        description: "Positive, negative, and indeterminate causal relationships",
        iconLetters: ["C", "i"],
        group: "System Dynamics",
    },
    async () => (await import("./theories/indeterminate-causal-loop")).default,
);

stdTheories.add(
    {
        id: "primitive-stock-flow",
        name: "Stock and flow",
        description: "Accumulation (stocks) and change (flows)",
        iconLetters: ["S", "F"],
        group: "System Dynamics",
    },
    async () => (await import("./theories/primitive-stock-flow")).default,
);

stdTheories.add(
    {
        id: "primitive-signed-stock-flow",
        name: "Stock and flow with signed links",
        description: "Accumulation (stocks) and change (flows), with signed links",
        iconLetters: ["S", "F"],
        group: "System Dynamics",
    },
    async () => (await import("./theories/primitive-signed-stock-flow")).default,
);

stdTheories.add(
    {
        id: "reg-net",
        name: "Regulatory network",
        description: "Biochemical species that promote or inhibit each other",
        iconLetters: ["R", "n"],
        group: "Biology",
    },
    async () => (await import("./theories/reg-net")).default,
);

stdTheories.add(
    {
        id: "dec",
        name: "Discrete exterior calculus (DEC)",
        description: "DEC operators on a geometrical space",
        iconLetters: ["D", "c"],
        group: "Experimental",
    },
    async () => (await import("./theories/dec")).default,
);

stdTheories.add(
    {
        id: "power-system",
        name: "Power system",
        description: "Power systems in the style of PyPSA",
        iconLetters: ["P", "s"],
        group: "Experimental",
    },
    async () => (await import("./theories/power-system")).default,
);
