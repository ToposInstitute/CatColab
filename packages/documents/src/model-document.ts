import { Model } from "catcolab-document-methods";
import type {
    Link,
    ModelJudgment,
    MorType,
    Ob,
    ObType,
    SpecializeModel,
} from "catcolab-document-types";
import type { DocumentOfType, DocumentView } from "./document";
import type { DocumentAdapter } from "./document-adapter";
import type { NotebookFormat } from "./notebook-core";

export type ModelDocument = DocumentOfType<"model">;
export type ModelDocumentView = DocumentView<ModelDocument>;

export interface ModelDefinition {
    readonly theory: string;
}

export const modelDocumentAdapter: DocumentAdapter<
    "model",
    ModelDefinition,
    { readonly title: string }
> = {
    documentType: "model",
    create: (definition, options) => newModelDocument(definition.theory, options.title),
    check: (definition, document) =>
        document.theory === definition.theory
            ? { tag: "Ok", content: undefined }
            : {
                  tag: "Err",
                  content: [
                      {
                          message:
                              `Cannot load document with theory "${document.theory}" ` +
                              `using a shape with theory "${definition.theory}".`,
                          path: ["theory"],
                      },
                  ],
              },
};

export const modelNotebookFormat: NotebookFormat<"model", ModelJudgment> = {
    documentType: "model",
    getNotebook: (document) => document.notebook,
    changeNotebook: (document, change) => change(document.notebook),
};

export function newModelDocument(theory: string, title: string): ModelDocument {
    const document = Model.newModelDocument({ theory });
    document.name = title;
    return document;
}

export function newObjectJudgment(obType: ObType, label: string | null): ModelJudgment {
    const judgment = Model.newObjectDecl(obType);
    judgment.name = label ?? "";
    return judgment;
}

export function newMorphismJudgment(options: {
    readonly morType: MorType;
    readonly label: string | null;
    readonly dom: Ob | null;
    readonly cod: Ob | null;
}): ModelJudgment {
    const judgment = Model.newMorphismDecl(options.morType);
    judgment.name = options.label ?? "";
    judgment.dom = options.dom;
    judgment.cod = options.cod;
    return judgment;
}

export function newInstantiationJudgment(options: {
    readonly label: string;
    readonly model: Link;
    readonly specializations: SpecializeModel[];
}): ModelJudgment {
    const judgment = Model.newInstantiatedModel(options.model);
    judgment.name = options.label;
    judgment.specializations = options.specializations;
    return judgment;
}

export function duplicateModelJudgment(content: ModelJudgment): ModelJudgment {
    return Model.duplicateModelJudgment(content);
}
