import { type Accessor, createMemo } from "solid-js";
import invariant from "tiny-invariant";

import type {
    DblModelDiagram,
    DiagramJudgment,
    Document,
    LabelSegment,
    ModelDiagramValidationResult,
    Uuid,
} from "catlog-wasm";
import { currentVersion, elaborateDiagram } from "catlog-wasm";
import { type Api, type LiveDoc, type StableRef, getLiveDoc } from "../api";
import { type LiveModelDocument, getLiveModel } from "../model";
import { NotebookUtils, newNotebook } from "../notebook";
import type { TheoryLibrary } from "../stdlib";
import { type IndexedMap, indexMap } from "../util/indexing";
import type { InterfaceToType } from "../util/types";

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
    notebook: newNotebook(),
    version: currentVersion(),
});

/** A diagram document "live" for editing.
 */
export type LiveDiagramDocument = {
    /** discriminator for use in union types */
    type: "diagram";

    /** The ref for which this is a live document. */
    refId: string;

    /** Live document containing the diagram data. */
    liveDoc: LiveDoc<DiagramDocument>;

    /** Live model that the diagram is in. */
    liveModel: LiveModelDocument;

    /** A memo of the formal content of the model. */
    formalJudgments: Accessor<Array<DiagramJudgment>>;

    /** A memo of the indexed map from object ID to name. */
    objectIndex: Accessor<IndexedMap<Uuid, LabelSegment>>;

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
    refId: string,
    liveDoc: LiveDoc<DiagramDocument>,
    liveModel: LiveModelDocument,
): LiveDiagramDocument {
    const { doc } = liveDoc;

    const formalJudgments = createMemo<Array<DiagramJudgment>>(
        () => NotebookUtils.getFormalContent(doc.notebook),
        [],
    );

    const objectIndex = createMemo<IndexedMap<Uuid, LabelSegment>>(() => {
        const judgments = formalJudgments();
        const map = new Map<Uuid, string | number>();

        for (const judgment of judgments) {
            if (judgment.tag === "object") {
                map.set(judgment.id, judgment.name);
            }
        }

        let nanon = 0;
        for (const judgment of judgments) {
            if (judgment.tag === "morphism") {
                const { dom, cod } = judgment;
                if (dom?.tag === "Basic" && !map.has(dom.content)) {
                    map.set(dom.content, ++nanon);
                }
                if (cod?.tag === "Basic" && !map.has(cod.content)) {
                    map.set(cod.content, ++nanon);
                }
            }
        }

        return indexMap(map);
    }, indexMap(new Map()));

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
        refId,
        liveDoc,
        liveModel,
        formalJudgments,
        objectIndex,
        elaboratedDiagram,
        validatedDiagram,
    };
}

/** Create a new, empty diagram in the backend. */
export function createDiagram(api: Api, inModel: StableRef): Promise<string> {
    const init = newDiagramDocument(inModel);
    return createDiagramFromDocument(api, init);
}

/** Create a new diagram in the backend from initial data. */
export async function createDiagramFromDocument(api: Api, init: DiagramDocument): Promise<string> {
    const result = await api.rpc.new_ref.mutate(init as InterfaceToType<DiagramDocument>);
    invariant(result.tag === "Ok", "Failed to create a new diagram");
    return result.content;
}

/** Retrieve a diagram from the backend and make it "live" for editing. */
export async function getLiveDiagram(
    refId: string,
    api: Api,
    theories: TheoryLibrary,
): Promise<LiveDiagramDocument> {
    const liveDoc = await getLiveDoc<DiagramDocument>(api, refId, "diagram");
    const { doc } = liveDoc;

    const liveModel = await getLiveModel(doc.diagramIn._id, api, theories);

    return enlivenDiagramDocument(refId, liveDoc, liveModel);
}
