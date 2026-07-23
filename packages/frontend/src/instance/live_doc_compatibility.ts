import type { Instance, InstanceDocument } from "catcolab-documents";
import type { Api, ApiBinder, ApiDocumentHandle, DocRef, LiveDoc } from "../api";
import type { LiveModelDoc, ModelLibrary } from "../model";
import { instanceShapes, shapeForTheory as shapeForTheoryIn } from "../model/shapes";

type SupportedInstanceShape = (typeof instanceShapes)[number];

/** An instance loaded through a frontend document binder. */
export type ApiInstance = Instance<ApiDocumentHandle, SupportedInstanceShape>;

/** An instance document "live" for compatibility with existing container components.

A facade over the catcolab-documents {@link Instance} API that structurally matches
the other `Live*Doc` types, so that generic UI (toolbar, sidebar, breadcrumbs,
document head, permissions) can consume it uniformly. The instance itself
remains the source of truth: `liveDoc` is derived from its document handle.
 */
export type LiveInstanceDoc = {
    /** Tag for use in tagged unions of document types. */
    type: "instance";

    /** Live document containing the instance data. */
    liveDoc: LiveDoc<InstanceDocument>;

    /** The catcolab-documents instance object, consumed by new components. */
    instance: ApiInstance;

    /** Canonical live schema document used by document chrome. */
    modelLiveDoc: LiveModelDoc["liveDoc"];
};

/** Look up the shape for a theory that supports data instances, if any. */
export function shapeForTheory(theory?: string) {
    return shapeForTheoryIn(instanceShapes, theory);
}

function enlivenInstance(
    instance: ApiInstance,
    liveDoc: LiveDoc<InstanceDocument>,
    modelLiveDoc: LiveModelDoc["liveDoc"],
): LiveInstanceDoc {
    return {
        type: "instance",
        liveDoc,
        instance,
        modelLiveDoc,
    };
}

export async function getLiveInstance(
    refId: string,
    api: Api,
    models: ModelLibrary<string>,
    binder: ApiBinder,
): Promise<{ liveInstance: LiveInstanceDoc; docRef: DocRef }> {
    const { liveDoc, docRef } = await api.getLiveDoc<InstanceDocument>(refId, "instance");
    const modelRef = {
        id: liveDoc.doc.instanceOf._id,
        version: liveDoc.doc.instanceOf._version,
        server: liveDoc.doc.instanceOf._server,
    };
    if (modelRef.version !== null || modelRef.server !== api.serverHost) {
        throw new Error("Data instances require a live model on the current server.");
    }
    const liveModel = await models.getLiveModel(liveDoc.doc.instanceOf._id);

    const shape = shapeForTheory(liveModel.liveDoc.doc.theory);
    if (!shape) {
        throw new Error(
            `Data instances are not supported for theory "${liveModel.liveDoc.doc.theory}".`,
        );
    }
    const model = await binder.loadNotebookFromRef(shape, modelRef);
    if (model.tag === "Err") {
        throw new Error(model.content.map((issue) => issue.message).join("\n"));
    }
    const instance = await binder.loadInstanceFromRef(model.content, {
        id: refId,
        version: null,
        server: api.serverHost,
    });
    if (instance.tag === "Err") {
        throw new Error(instance.content.map((issue) => issue.message).join("\n"));
    }

    return {
        liveInstance: enlivenInstance(instance.content, liveDoc, liveModel.liveDoc),
        docRef,
    };
}
