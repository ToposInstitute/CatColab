import { Nb } from "catcolab-document-methods";
import { arrayArg, findCatColabDocs, loadTheory, stringArg, theoryList } from "./catcolab_docs";
import { applyModelOps, describeModel, type ModelOp } from "./catcolab_ops";
import type { LlmSkillModule, LlmSkillToolCtx } from "./skill_types";

export const skill: LlmSkillModule = {
    instructions: `CatColab models are notebooks of typed objects and morphisms in a *theory* — a logic such as stock and flow, Petri nets, causal loops or ologs. In Patchwork, a \`catcolab-model\` document is shown side by side with its paired \`catcolab-analysis\` document.

Always use \`catcolab_read_model\` before editing and \`catcolab_edit_model\` for every change. Don't edit the notebook with automerge_op or edit_doc: cells need paired UUIDs and typed references that these tools build for you. Both tools take the url of the model *or* its analysis, and default to the focused document.

- A new model starts with the \`empty\` theory, which has no types. Pick a theory first by passing \`theory\` to \`catcolab_edit_model\`. A theory can only be switched while the model has no objects or morphisms, or to a theory that includes the current one; otherwise ask the user to use the theory picker in the model's header.
- Refer to types by the names \`catcolab_read_model\` lists (for example "Stock", "Flow", "Link").
- Refer to objects and morphisms by name. Unnamed ones (stock-flow links are unnamed by convention) are referred to as \`id:<uuid>\`, as shown in the read output.
- A morphism's \`from\` and \`to\` must match its type's ends as listed by \`catcolab_read_model\`. Usually that is the name of an object; when an end is itself a morphism type (a stock-flow Link points at a Flow), name the morphism; when it is a list (the inputs or outputs of a Petri-net transition), pass an array of names.
- \`remove\` also removes every morphism left pointing at what was removed.
- Ops run in order as one change, so later ops can refer to things earlier ones created. If any op fails, nothing is changed.
- Use notes (\`add-note\`) for assumptions and units, for example "Time unit: months".

Theories:
${theoryList()}`,

    tools: [
        {
            name: "catcolab_read_model",
            description:
                "Summarize a CatColab model: its theory, the object and morphism types it can use, and its contents by name.",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description:
                            "automerge: URL of the model or its analysis (default: focused doc)",
                    },
                },
            },
        },
        {
            name: "catcolab_edit_model",
            description:
                "Edit a CatColab model in one change: optionally rename it and set its theory, then apply ops in order. Returns what changed and the updated model summary.",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description:
                            "automerge: URL of the model or its analysis (default: focused doc)",
                    },
                    name: { type: "string", description: "new title for the model" },
                    theory: {
                        type: "string",
                        description: "theory id to switch to, before the ops run",
                    },
                    ops: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                op: {
                                    type: "string",
                                    enum: [
                                        "add-object",
                                        "add-morphism",
                                        "add-note",
                                        "rename",
                                        "remove",
                                    ],
                                },
                                name: {
                                    type: "string",
                                    description:
                                        "add-object/add-morphism: name of the new entity (optional for morphisms); rename: new name",
                                },
                                type: {
                                    type: "string",
                                    description:
                                        "add-object/add-morphism: type name from catcolab_read_model",
                                },
                                from: {
                                    description:
                                        "add-morphism: domain — a name, or an array of names for list ends",
                                },
                                to: {
                                    description:
                                        "add-morphism: codomain — a name, or an array of names for list ends",
                                },
                                text: { type: "string", description: "add-note: the note's text" },
                                target: {
                                    type: "string",
                                    description: "rename/remove: name or id:<uuid> of the entity",
                                },
                            },
                            required: ["op"],
                        },
                    },
                },
            },
        },
    ],

    async runTool(name, args, ctx) {
        switch (name) {
            case "catcolab_read_model":
                return readModel(args, ctx);
            case "catcolab_edit_model":
                return editModel(args, ctx);
            default:
                throw new Error(`Unknown tool ${name}`);
        }
    },
};

async function readModel(args: unknown, ctx: LlmSkillToolCtx): Promise<string> {
    const { model } = await findCatColabDocs(ctx, stringArg(args, "url"));
    const doc = model.doc();
    return `${describeModel(doc, await loadTheory(doc.theory))}\n\nModel URL: ${model.url}`;
}

async function editModel(args: unknown, ctx: LlmSkillToolCtx): Promise<string> {
    const { model } = await findCatColabDocs(ctx, stringArg(args, "url"));
    const before = model.doc();
    const currentTheory = await loadTheory(before.theory);

    const theoryId = stringArg(args, "theory");
    const theory = theoryId ? await loadTheory(theoryId) : currentTheory;
    if (theoryId && !theory) {
        throw new Error(`Unknown theory "${theoryId}".`);
    }
    if (
        theoryId &&
        theoryId !== before.theory &&
        Nb.hasFormalCells(before.notebook) &&
        !currentTheory?.inclusions.includes(theoryId)
    ) {
        throw new Error(
            `Can't switch from ${before.theory} to ${theoryId} while the model has contents; ask the user to use the theory picker, which migrates the model.`,
        );
    }

    const ops = arrayArg<ModelOp>(args, "ops");
    if (ops.length > 0 && !theory) {
        throw new Error(`The model's theory "${before.theory}" is unknown; set a theory first.`);
    }

    const log: string[] = [];
    model.change((doc) => {
        const name = stringArg(args, "name");
        if (name) {
            doc.name = name;
            log.push(`renamed model to "${name}"`);
        }
        if (theoryId && theoryId !== doc.theory) {
            doc.theory = theoryId;
            delete doc.editorVariant;
            log.push(`switched theory to ${theoryId}`);
        }
        if (theory) {
            log.push(...applyModelOps(doc, theory, ops));
        }
    });

    const summary = describeModel(model.doc(), theory);
    return `${log.length > 0 ? log.join("\n") : "(no changes)"}\n\n${summary}`;
}
