import type { AnyDocumentId, Repo } from "@automerge/automerge-repo";
import { type Accessor, createMemo } from "solid-js";

import type {
    DblModelDiagram,
    DiagramJudgment,
    Document,
    ModelDiagramValidationResult,
    StableRef,
} from "catlog-wasm";
import { currentVersion, elaborateDiagram } from "catlog-wasm";
import { type Api, type LiveDoc, getLiveDocFromDocHandle } from "../api";
import type { LiveModelDocument, ModelLibrary } from "../model";
import { NotebookUtils, newNotebook } from "../notebook";

/** A document defining a diagram in a model. */
export type DiagramDocument = Document & { type: "diagram" };

/** Create an empty diagram of a model. */
export const newDiagramDocument = (modelRef: StableRef): DiagramDocument => ({
    name: "",
    type: "diagram",
    diagramIn: {
        ...modelRef,
        type: "diagram-in",
    },
    notebook: newNotebook<DiagramJudgment>(),
    version: currentVersion(),
});

/** A diagram document "live" for editing. */
export type LiveDiagramDocument = {
    /** Tag for use in tagged unions of document types. */
    type: "diagram";

    /** Live document containing the diagram data. */
    liveDoc: LiveDoc<DiagramDocument>;

    /** Live model that the diagram is in. */
    liveModel: LiveModelDocument;

    /** A memo of the formal content of the model. */
    formalJudgments: Accessor<Array<DiagramJudgment>>;

    /** A memo of the diagram elaborated in the core, though possibly invalid. */
    elaboratedDiagram: Accessor<DblModelDiagram | undefined>;

    /** A memo of the diagram elaborated and validated in the core. */
    validatedDiagram: Accessor<ValidatedDiagram | undefined>;
};

/** A validated diagram as represented in `catlog`. */
export type ValidatedDiagram =
    /** A successfully elaborated and validated diagram. */
    | {
          tag: "Valid";
          diagram: DblModelDiagram;
      }
    /** An elaborated diagram with one or more validation errors. */
    | {
          tag: "Invalid";
          diagram: DblModelDiagram;
          errors: (ModelDiagramValidationResult & { tag: "Err" })["content"];
      }
    /** A diagram that failed to even elaborate. */
    | {
          tag: "Illformed";
          error: string;
      };

function enlivenDiagramDocument(
    liveDoc: LiveDoc<DiagramDocument>,
    liveModel: LiveModelDocument,
): LiveDiagramDocument {
    const { doc } = liveDoc;

    const formalJudgments = createMemo<Array<DiagramJudgment>>(
        () => NotebookUtils.getFormalContent(doc.notebook),
        [],
    );

    const elaboratedDiagram = (): DblModelDiagram | undefined => {
        const validated = validatedDiagram();
        if (validated && validated.tag !== "Illformed") {
            return validated.diagram;
        }
    };

    const validatedDiagram = createMemo<ValidatedDiagram | undefined>(
        () => {
            const th = liveModel.theory();
            const validatedModel = liveModel.validatedModel();
            if (!(th && validatedModel?.tag === "Valid")) {
                // Abort immediately if the theory is undefined or the model is invalid.
                return undefined;
            }
            const { model } = validatedModel;
            let diagram: DblModelDiagram;
            try {
                diagram = elaborateDiagram(formalJudgments(), th.theory);
            } catch (e) {
                return { tag: "Illformed", error: String(e) };
            }
            diagram.inferMissingFrom(model);
            const result = diagram.validateIn(model);
            if (result.tag === "Ok") {
                return { tag: "Valid", diagram };
            } else {
                return { tag: "Invalid", diagram, errors: result.content };
            }
        },
        undefined,
        { equals: false },
    );

    return {
        type: "diagram",
        liveDoc,
        liveModel,
        formalJudgments,
        elaboratedDiagram,
        validatedDiagram,
    };
}

/** Create a new, empty diagram in the backend. */
export function createDiagram(api: Api, inModel: StableRef): Promise<string> {
    const init = newDiagramDocument(inModel);
    return api.createDoc(init);
}

/** Retrieve a diagram from the backend and make it "live" for editing. */
export async function getLiveDiagram(
    refId: string,
    api: Api,
    models: ModelLibrary,
): Promise<LiveDiagramDocument> {
    const liveDoc = await api.getLiveDoc<DiagramDocument>(refId, "diagram");
    const modelRefId = liveDoc.doc.diagramIn._id;

    const liveModel = await models.getLiveModelWithRefId(api, modelRefId);
    return enlivenDiagramDocument(liveDoc, liveModel);
}

/** Get a diagram from an Automerge repo and make it "live" for editing.

Prefer [`getLiveDiagram`] unless you're bypassing the official backend.
 */
export async function getLiveDiagramFromRepo(
    docId: AnyDocumentId,
    repo: Repo,
    models: ModelLibrary,
): Promise<LiveDiagramDocument> {
    const docHandle = await repo.find<DiagramDocument>(docId);
    const liveDoc = getLiveDocFromDocHandle(docHandle);
    const modelDocId = liveDoc.doc.diagramIn._id as AnyDocumentId;

    const liveModel = await models.getLiveModelWithDocId(repo, modelDocId);
    return enlivenDiagramDocument(liveDoc, liveModel);
}
