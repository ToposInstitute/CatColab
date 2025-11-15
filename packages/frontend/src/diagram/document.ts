import type { AnyDocumentId, Repo } from "@automerge/automerge-repo";
import { type Accessor, createMemo } from "solid-js";

import type {
    DblModelDiagram,
    DiagramJudgment,
    Document,
    ModelDiagramValidationResult,
    StableRef,
    Uuid,
} from "catlog-wasm";
import { currentVersion, elaborateDiagram } from "catlog-wasm";
import { type Api, type DocRef, findAndMigrate, type LiveDoc, makeLiveDoc } from "../api";
import type { LiveModelDoc, ModelLibrary } from "../model";
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
export type LiveDiagramDoc = {
    /** Tag for use in tagged unions of document types. */
    type: "diagram";

    /** Live document containing the diagram data. */
    liveDoc: LiveDoc<DiagramDocument>;

    /** Live model that the diagram is in. */
    liveModel: LiveModelDoc;

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

export function enlivenDiagramDocument(
    liveDoc: LiveDoc<DiagramDocument>,
    liveModel: LiveModelDoc,
): LiveDiagramDoc {
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

export type LiveDiagramDocWithRef = {
    liveDiagram: LiveDiagramDoc;
    docRef: DocRef;
};

/** Retrieve a diagram from the backend and make it "live" for editing. */
export async function getLiveDiagram(
    refId: Uuid,
    api: Api,
    models: ModelLibrary<Uuid>,
): Promise<LiveDiagramDocWithRef> {
    const { liveDoc, docRef } = await api.getLiveDoc<DiagramDocument>(refId, "diagram");
    const modelRefId = liveDoc.doc.diagramIn._id;

    const liveModel = await models.getLiveModel(modelRefId);
    const liveDiagram = enlivenDiagramDocument(liveDoc, liveModel);
    return { liveDiagram, docRef };
}

/** Get a diagram from an Automerge repo and make it "live" for editing.

Prefer [`getLiveDiagram`] unless you're bypassing the official backend.
 */
export async function getLiveDiagramFromRepo(
    docId: AnyDocumentId,
    repo: Repo,
    models: ModelLibrary<AnyDocumentId>,
): Promise<LiveDiagramDoc> {
    const docHandle = await findAndMigrate<DiagramDocument>(repo, docId, "diagram");
    const liveDoc = makeLiveDoc(docHandle);
    const modelDocId = liveDoc.doc.diagramIn._id as AnyDocumentId;

    const liveModel = await models.getLiveModel(modelDocId);
    return enlivenDiagramDocument(liveDoc, liveModel);
}
