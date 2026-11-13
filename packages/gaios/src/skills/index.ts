/** `llm:skill` plugins that teach the Patchwork chat computer to work with
CatColab documents.

This module is part of the package entry's static graph, which Patchwork loads
in a worker without an importmap, so it must not import anything at runtime.
Each skill's instructions and tools load behind `load()`.
 */
export const skillDescriptions = [
    {
        type: "llm:skill",
        id: "catcolab-model",
        name: "CatColab models",
        description:
            "Applies when reading, building or editing a CatColab model (catcolab-model): its theory, objects, morphisms and notes.",
        datatypes: ["catcolab-model", "catcolab-analysis"],
        async load() {
            const { skill } = await import("./model_skill");
            return skill;
        },
    },
    {
        type: "llm:skill",
        id: "catcolab-analysis",
        name: "CatColab analyses",
        description:
            "Applies when inspecting or configuring analyses of a CatColab model (catcolab-analysis): simulations, visualizations and their parameters.",
        datatypes: ["catcolab-model", "catcolab-analysis"],
        async load() {
            const { skill } = await import("./analysis_skill");
            return skill;
        },
    },
];
