import { type Accessor, createMemo } from "solid-js";
import invariant from "tiny-invariant";

import type {
    DblModelDiagram,
    DiagramJudgment,
    Document,
    ModelDiagramValidationResult,
    Uuid,
} from "catlog-wasm";
import { currentVersion, elaborateDiagram } from "catlog-wasm";
import { type Api, type LiveDoc, type StableRef, getLiveDoc } from "../api";
import { type LiveModelDocument, getLiveModel } from "../model";
import { NotebookUtils, newNotebook } from "../notebook";
import type { TheoryLibrary } from "../stdlib";
import { type IdToNameMap, indexMap } from "../util/indexing";
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
    objectIndex: Accessor<IdToNameMap>;

    /** A memo of the diagram constructed and validated in the core. */
    validatedDiagram: Accessor<ValidatedDiagram | undefined>;
};

/** A validated diagram as represented in `catlog`. */
export type ValidatedDiagram = {
    diagram: DblModelDiagram;
    result: ModelDiagramValidationResult;
};

function enlivenDiagramDocument(
    refId: string,
    liveDoc: LiveDoc<DiagramDocument>,
    liveModel: LiveModelDocument,
): LiveDiagramDocument {
    const { doc } = liveDoc;

    const formalJudgments = createMemo<Array<DiagramJudgment>>(
        () =>
            doc.notebook.cellOrder
                .map((cellId) => NotebookUtils.getCellById(doc.notebook, cellId))
                .filter((cell) => cell.tag === "formal")
                .map((cell) => cell.content),
        [],
    );

    const objectIndex = createMemo<IdToNameMap>(() => {
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

    const validatedDiagram = createMemo<ValidatedDiagram | undefined>(
        () => {
            const th = liveModel.theory();
            const validatedModel = liveModel.validatedModel();
            if (!(th && validatedModel?.result.tag === "Ok")) {
                // Abort immediately if the model itself is invalid.
                return undefined;
            }
            const { model } = validatedModel;
            const diagram = elaborateDiagram(doc, th.theory);
            diagram.inferMissingFrom(model);
            const result = diagram.validateIn(model);
            return { diagram, result };
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
