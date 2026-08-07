import { SimpleOlog } from "catcolab-logics/simple-olog";
import { SimpleSchema } from "catcolab-logics/simple-schema";

import type { Instance, InstanceDocument } from "catcolab-documents";
import type { Api, ApiBinder, DocRef, LiveDoc } from "../api";
import type { ModelLibrary } from "../model";

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
    instance: Instance;
};

/** Shapes whose models can have data instances. */
const instanceShapes = [SimpleOlog, SimpleSchema];

/** Look up the shape for a theory that supports data instances, if any. */
export function shapeForTheory(theory?: string) {
    return instanceShapes.find((shape) => shape.theory === theory);
}

function enlivenInstance(instance: Instance): LiveInstanceDoc {
    return {
        type: "instance",
        get liveDoc() {
            return instance.handle.liveDoc as LiveDoc<InstanceDocument>;
        },
        instance,
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

    binder.store.register({ id: refId, version: null, server: api.serverHost }, liveDoc);
    binder.store.register(modelRef, liveModel.liveDoc);

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

    return { liveInstance: enlivenInstance(instance.content), docRef };
}
