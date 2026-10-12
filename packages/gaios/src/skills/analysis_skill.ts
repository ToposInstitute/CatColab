import type { DocHandle } from "@automerge/automerge-repo";

import type { AnalysisDoc } from "../analysis_datatype";
import {
    arrayArg,
    type CatColabDocs,
    findCatColabDocs,
    loadTheory,
    stringArg,
} from "./catcolab_docs";
import { type AnalysisOp, applyAnalysisOps, describeAnalysis } from "./catcolab_ops";
import type { LlmSkillModule, LlmSkillToolCtx } from "./skill_types";

export const skill: LlmSkillModule = {
    instructions: `A \`catcolab-analysis\` document is a notebook of analyses of a CatColab model: visualizations, simulations and other computations, shown next to the model. Which analyses exist depends on the model's theory.

Use \`catcolab_read_analysis\` before editing and \`catcolab_edit_analysis\` for every change, rather than automerge_op: analysis configuration is keyed by the model's internal IDs, and these tools translate to and from names for you. Both tools take the url of the analysis *or* its model, and default to the focused document. Change the model itself with the catcolab-model skill.

- \`add-analysis\` appends an analysis by the id \`catcolab_read_analysis\` lists, with default settings.
- \`set-params\` updates one cell, chosen by its 1-based position or analysis id. \`params\` is merged into the configuration shown by \`catcolab_read_analysis\`: in maps keyed by objects or morphisms (such as \`initialValues\` or \`rates\`), use their names as keys; other fields are set as given.
- After adding objects or morphisms to the model, give them values in the simulation too; missing entries count as 0.

Mass-action simulation (\`mass-action\`), in Balanced mode: a flow or transition \`f: A → B\` with rate \`r\` moves \`r · A · (each linked stock)\` per time unit out of \`A\` and into \`B\`. Rates and initial values must be ≥ 0, and \`duration\` is in the model's time unit. Pick parameters by reasoning about the resulting ODE, and explain that reasoning to the user:
- A target at time T ("headcount 50 after 12 months"): set \`duration\` to T and choose rates that reach the target.
- An equilibrium ("a steady water level with rain and two pumps"): set inflow equal to outflow at the desired level, e.g. \`r_rain · Cloud = 2 · r_pump · W\`.
- A flow is always proportional to its source, so model a near-constant inflow as a large source stock with a small rate, which barely depletes over the simulated duration.`,

    tools: [
        {
            name: "catcolab_read_analysis",
            description:
                "Summarize a CatColab analysis: the analyses available for its model's theory, and each cell's configuration with model entities by name.",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description:
                            "automerge: URL of the analysis or its model (default: focused doc)",
                    },
                },
            },
        },
        {
            name: "catcolab_edit_analysis",
            description:
                "Edit a CatColab analysis in one change, applying ops in order. Returns what changed and the updated summary.",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description:
                            "automerge: URL of the analysis or its model (default: focused doc)",
                    },
                    ops: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                op: {
                                    type: "string",
                                    enum: ["add-analysis", "set-params", "remove-analysis"],
                                },
                                kind: { type: "string", description: "add-analysis: analysis id" },
                                cell: {
                                    description:
                                        "set-params/remove-analysis: 1-based cell position, or analysis id",
                                },
                                params: {
                                    type: "object",
                                    description:
                                        'set-params: fields to merge, e.g. {"duration": 12, "initialValues": {"Headcount": 20}, "rates": {"hiring": 0.1}}',
                                },
                            },
                            required: ["op"],
                        },
                    },
                },
                required: ["ops"],
            },
        },
    ],

    async runTool(name, args, ctx) {
        switch (name) {
            case "catcolab_read_analysis":
                return readAnalysis(args, ctx);
            case "catcolab_edit_analysis":
                return editAnalysis(args, ctx);
            default:
                throw new Error(`Unknown tool ${name}`);
        }
    },
};

async function readAnalysis(args: unknown, ctx: LlmSkillToolCtx): Promise<string> {
    const docs = await findCatColabDocs(ctx, stringArg(args, "url"));
    const { analysis, theory } = await requireAnalysis(docs);
    const summary = describeAnalysis(analysis.doc(), docs.model.doc(), theory);
    return `${summary}\n\nAnalysis URL: ${analysis.url}\nModel URL: ${docs.model.url}`;
}

async function editAnalysis(args: unknown, ctx: LlmSkillToolCtx): Promise<string> {
    const docs = await findCatColabDocs(ctx, stringArg(args, "url"));
    const { analysis, theory } = await requireAnalysis(docs);
    const model = docs.model.doc();

    const log: string[] = [];
    analysis.change((doc) => {
        log.push(...applyAnalysisOps(doc, model, theory, arrayArg<AnalysisOp>(args, "ops")));
    });

    const summary = describeAnalysis(analysis.doc(), model, theory);
    return `${log.length > 0 ? log.join("\n") : "(no changes)"}\n\n${summary}`;
}

async function requireAnalysis(docs: CatColabDocs) {
    const analysis: DocHandle<AnalysisDoc> | undefined = docs.analysis;
    if (!analysis) {
        throw new Error(
            "This model has no analysis yet. It's created the first time the model is opened in Patchwork.",
        );
    }
    const theoryId = docs.model.doc().theory;
    const theory = await loadTheory(theoryId);
    if (!theory) {
        throw new Error(`The model's theory "${theoryId}" is unknown; set a theory first.`);
    }
    return { analysis, theory };
}
