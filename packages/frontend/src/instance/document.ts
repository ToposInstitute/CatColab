import type { AnyDocumentId, Repo } from "@automerge/automerge-repo";
import { type Accessor, createMemo } from "solid-js";

import type { InstanceDocument } from "catcolab-document-methods";
import { Instance, Nb } from "catcolab-document-methods";
import type { InstanceJudgment, StableRef, Uuid } from "catcolab-document-types";
import { type Api, type DocRef, findAndMigrate, type LiveDoc, makeLiveDoc } from "../api";
import type { LiveModelDoc, ModelLibrary } from "../model";

/** A instance document "live" for editing. */
export type LiveInstanceDoc = {
    /** Tag for use in tagged unions of document types. */
    type: "instance";

    /** Live document containing the instance data. */
    liveDoc: LiveDoc<InstanceDocument>;

    /** Live model that the instance is in. */
    liveModel: LiveModelDoc;

    /** A memo of the formal content of the model. */
    formalJudgments: Accessor<Array<InstanceJudgment>>;
};

export function enlivenInstanceDocument(
    liveDoc: LiveDoc<InstanceDocument>,
    liveModel: LiveModelDoc,
): LiveInstanceDoc {
    const { doc } = liveDoc;

    const formalJudgments = createMemo<Array<InstanceJudgment>>(() =>
        Nb.getFormalContent(doc.notebook),
    );

    return {
        type: "instance",
        liveDoc,
        liveModel,
        formalJudgments,
    };
}

/** Create a new, empty instance in the backend. */
export function createInstance(api: Api, inModel: StableRef): Promise<string> {
    const init = Instance.newInstanceDocument(inModel);
    return api.createDoc(init);
}

export type LiveInstanceDocWithRef = {
    liveInstance: LiveInstanceDoc;
    docRef: DocRef;
};

/** Retrieve a instance from the backend and make it "live" for editing. */
export async function getLiveInstance(
    refId: Uuid,
    api: Api,
    models: ModelLibrary<Uuid>,
): Promise<LiveInstanceDocWithRef> {
    const { liveDoc, docRef } = await api.getLiveDoc<InstanceDocument>(refId, "instance");
    const modelRefId = liveDoc.doc.instanceIn._id;

    const liveModel = await models.getLiveModel(modelRefId);
    const liveInstance = enlivenInstanceDocument(liveDoc, liveModel);
    return { liveInstance, docRef };
}

/** Get a instance from an Automerge repo and make it "live" for editing.

Prefer [`getLiveInstance`] unless you're bypassing the official backend.
 */
export async function getLiveInstanceFromRepo(
    docId: AnyDocumentId,
    repo: Repo,
    models: ModelLibrary<AnyDocumentId>,
): Promise<LiveInstanceDoc> {
    const docHandle = await findAndMigrate(repo, docId);
    const liveDoc = makeLiveDoc<InstanceDocument>(docHandle, "instance");
    const modelDocId = liveDoc.doc.instanceIn._id as AnyDocumentId;

    const liveModel = await models.getLiveModel(modelDocId);
    return enlivenInstanceDocument(liveDoc, liveModel);
}
