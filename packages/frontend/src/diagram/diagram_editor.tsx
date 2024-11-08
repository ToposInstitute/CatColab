import { useParams } from "@solidjs/router";
import { createResource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { RepoContext, RpcContext, getLiveDoc } from "../api";
import { type ModelDocument, enlivenModelDocument } from "../model";
import { TheoryLibraryContext } from "../stdlib";
import { type DiagramDocument, type LiveDiagramDocument, enlivenDiagramDocument } from "./document";

export default function DiagramPage() {
    const params = useParams();
    const refId = params.ref;
    invariant(refId, "Must provide document ref as parameter to diagram page");

    const rpc = useContext(RpcContext);
    const repo = useContext(RepoContext);
    const theories = useContext(TheoryLibraryContext);
    invariant(rpc && repo && theories, "Missing context for diagram page");

    const [_liveDoc] = createResource<LiveDiagramDocument>(async () => {
        const liveDoc = await getLiveDoc<DiagramDocument>(rpc, repo, refId);
        const { doc } = liveDoc;
        invariant(doc.type === "diagram", () => `Expected diagram, got type: ${doc.type}`);

        const modelReactiveDoc = await getLiveDoc<ModelDocument>(rpc, repo, doc.modelRef.refId);
        const liveModel = enlivenModelDocument(doc.modelRef.refId, modelReactiveDoc, theories);

        return enlivenDiagramDocument(refId, liveDoc, liveModel);
    });
}
