import { type Accessor, createMemo } from "solid-js";
import invariant from "tiny-invariant";

import type { JsonValue } from "catcolab-api";
import type { DblModelDiagram, ModelDiagramValidationResult, Uuid } from "catlog-wasm";
import { type Api, type ExternRef, type LiveDoc, getLiveDoc } from "../api";
import type { IdToNameMap } from "../components";
import { type LiveModelDocument, getLiveModel } from "../model";
import { type Notebook, newNotebook } from "../notebook";
import type { TheoryLibrary } from "../stdlib";
import { indexMap } from "../util/indexing";
import { type DiagramJudgment, catlogDiagram } from "./types";

/** A document defining a diagram in a model. */
export type DiagramDocument = {
    type: "diagram";

    /** User-defined name of diagram. */
    name: string;

    /** Reference to the model that the diagram is in. */
    modelRef: ExternRef<"model">;

    /** Content of the diagram. */
    notebook: Notebook<DiagramJudgment>;
};

/** Create an empty diagram of a model. */
export const newDiagramDocument = (modelRefId: string): DiagramDocument => ({
    name: "",
    type: "diagram",
    modelRef: {
        tag: "extern-ref",
        refId: modelRefId,
        taxon: "model",
    },
    notebook: newNotebook(),
});

/** A diagram document "live" for editing.
 */
export type LiveDiagramDocument = {
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

    const formalJudgments = createMemo<Array<DiagramJudgment>>(() => {
        return doc.notebook.cells
            .filter((cell) => cell.tag === "formal")
            .map((cell) => cell.content);
    }, []);

    const objectIndex = createMemo<IdToNameMap>(() => {
        const judgments = formalJudgments();
        const map = new Map<Uuid, string | number>();
        for (const judgment of judgments) {
            if (judgment.tag === "object") {
                map.set(judgment.id, judgment.name);
            }
        }

        let nanon = 1;
        for (const judgment of judgments) {
            if (judgment.tag === "morphism") {
                const { dom, cod } = judgment;
                if (dom?.tag === "Basic" && !map.has(dom.content)) {
                    map.set(dom.content, nanon++);
                }
                if (cod?.tag === "Basic" && !map.has(cod.content)) {
                    map.set(cod.content, nanon++);
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
            const diagram = catlogDiagram(th.theory, formalJudgments());
            const result = diagram.validate_in(validatedModel.model);
            return { diagram, result };
        },
        undefined,
        { equals: false },
    );

    return { refId, liveDoc, liveModel, formalJudgments, objectIndex, validatedDiagram };
}

/** Create a new diagram in the backend. */
export async function createDiagram(modelRefId: string, api: Api): Promise<string> {
    const init = newDiagramDocument(modelRefId);

    const result = await api.rpc.new_ref.mutate({
        content: init as JsonValue,
        permissions: {
            anyone: "Read",
        },
    });
    invariant(result.tag === "Ok", "Failed to create a new diagram");

    return result.content;
}

/** Retrieve a diagram from the backend and make it "live" for editing. */
export async function getLiveDiagram(
    refId: string,
    api: Api,
    theories: TheoryLibrary,
): Promise<LiveDiagramDocument> {
    const liveDoc = await getLiveDoc<DiagramDocument>(api, refId);
    const { doc } = liveDoc;
    invariant(doc.type === "diagram", () => `Expected diagram, got type: ${doc.type}`);

    const liveModel = await getLiveModel(doc.modelRef.refId, api, theories);

    return enlivenDiagramDocument(refId, liveDoc, liveModel);
}
