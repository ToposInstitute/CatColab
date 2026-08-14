import type { FormalCell, ModelDocument } from "catcolab-document-methods";
import type { ModelJudgment, Notebook } from "catcolab-document-types";
import type { DblModel, DblTheory, InvalidDblModel } from "catlog-wasm";
import type { Issue, Result } from "../result";

function formalCellForGenerator(
    notebook: Notebook<ModelJudgment>,
    generatorId: string,
): FormalCell<ModelJudgment> | undefined {
    for (const cellId of notebook.cellOrder) {
        const cell = notebook.cellContents[cellId];
        if (cell?.tag === "formal" && "id" in cell.content && cell.content.id === generatorId) {
            return cell;
        }
    }
    return undefined;
}

function generatorName(notebook: Notebook<ModelJudgment>, generatorId: string): string {
    const cell = formalCellForGenerator(notebook, generatorId);
    if (!cell || !cell.content.name) {
        return generatorId;
    }
    return cell.content.name;
}

function generatorPath(
    notebook: Notebook<ModelJudgment>,
    generatorId: string,
    property?: string,
): PropertyKey[] | undefined {
    const cell = formalCellForGenerator(notebook, generatorId);
    if (!cell) {
        return undefined;
    }
    const path: PropertyKey[] = ["notebook", "cellContents", cell.id, "content"];
    if (property) {
        path.push(property);
    }
    return path;
}

function invalidModelIssue(notebook: Notebook<ModelJudgment>, error: InvalidDblModel): Issue {
    switch (error.tag) {
        case "Dom":
            return {
                message: `Morphism \`${generatorName(notebook, error.content)}\` has no domain`,
                path: generatorPath(notebook, error.content, "dom"),
            };
        case "Cod":
            return {
                message: `Morphism \`${generatorName(notebook, error.content)}\` has no codomain`,
                path: generatorPath(notebook, error.content, "cod"),
            };
        case "ObType":
            return {
                message: `Object \`${generatorName(notebook, error.content)}\` has an invalid type`,
                path: generatorPath(notebook, error.content, "obType"),
            };
        case "MorType":
            return {
                message: `Morphism \`${generatorName(notebook, error.content)}\` has an invalid type`,
                path: generatorPath(notebook, error.content, "morType"),
            };
        case "DomType":
            return {
                message: `Morphism \`${generatorName(notebook, error.content)}\` has a mistyped domain`,
                path: generatorPath(notebook, error.content, "dom"),
            };
        case "CodType":
            return {
                message: `Morphism \`${generatorName(notebook, error.content)}\` has a mistyped codomain`,
                path: generatorPath(notebook, error.content, "cod"),
            };
        case "Eqn":
            return {
                message: "An equation in the model is invalid",
            };
        case "UnsupportedFeature":
            return {
                message: `The model uses an unsupported feature: ${error.content.tag}`,
            };
        case "InvalidLink":
            return {
                message: `Instantiation \`${generatorName(notebook, error.content)}\` is invalid`,
                path: generatorPath(notebook, error.content),
            };
    }
}

/** Elaborate and validate a model document against its core theory. */
export async function validateModelDocument(
    document: Readonly<ModelDocument>,
    theory: DblTheory,
    refId: string,
): Promise<Result<DblModel>> {
    const { DblModelMap, elaborateModel } = await import("catlog-wasm");
    const instantiatedModels = new DblModelMap();
    let model: DblModel;
    try {
        model = elaborateModel(document.notebook, instantiatedModels, theory, refId);
    } catch (error) {
        return {
            tag: "Err",
            content: [{ message: `Failed to elaborate model: ${String(error)}` }],
        };
    } finally {
        instantiatedModels.free();
    }

    const validation = model.validate();
    if (validation.tag === "Err") {
        return {
            tag: "Err",
            content: validation.content.map((error) => invalidModelIssue(document.notebook, error)),
        };
    }
    return { tag: "Ok", content: model };
}
