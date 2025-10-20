import { useNavigate } from "@solidjs/router";
import type { RefStub, RelatedRefStub } from "catcolab-api";
import FilePlus from "lucide-solid/icons/file-plus";
import { useContext } from "solid-js";
import { For } from "solid-js";
import { Show } from "solid-js";
import { createResource } from "solid-js";
import invariant from "tiny-invariant";
import { Api, getLiveDoc, LiveDoc, useApi } from "../api";
import { createModel, enlivenModelDocument, getLiveModel, ModelDocument } from "../model";
import { TheoryLibrary, TheoryLibraryContext } from "../stdlib";
import { DocumentTypeIcon } from "../util/document_type_icon";
import { DocumentMenu } from "./document_menu";
import { AppMenu } from "./menubar";
import { type AnyLiveDocument, type AnyLiveDocumentType, documentRefId } from "./utils";
import { DiagramDocument, enlivenDiagramDocument, getLiveDiagram } from "../diagram";
import { AnalysisDocument, DiagramAnalysisDocument, ModelAnalysisDocument } from "../analysis";
import { assertExhaustive } from "../util/assert_exhaustive";
import { Link } from "catlog-wasm";

export function DocumentSidebar(props: {
    liveDocument: AnyLiveDocument;
}) {
    return (
        <>
            <AppMenu />
            <RelatedDocuments liveDocument={props.liveDocument} />
            <NewModelItem />
        </>
    );
}

export async function getAnyLiveDocument(
    refId: string,
    api: Api,
    theories: TheoryLibrary,
): Promise<AnyLiveDocument> {
    const liveDoc = await getLiveDoc(api, refId);
    switch (liveDoc.doc.type) {
        case "model":
            return enlivenModelDocument(liveDoc as LiveDoc<ModelDocument>, theories);
        case "diagram":
            const modelRefId = liveDoc.doc.diagramIn._id;

            const liveModel = await getLiveModel(modelRefId, api, theories);
            return enlivenDiagramDocument(liveDoc as LiveDoc<DiagramDocument>, liveModel);
        case "analysis":
            const liveAnalysisDoc = await getLiveDoc<AnalysisDocument>(api, refId, "analysis");
            const { doc } = liveAnalysisDoc;

            // XXX: TypeScript cannot narrow types in nested tagged unions.
            if (doc.analysisType === "model") {
                const liveModel = await getLiveModel(doc.analysisOf._id, api, theories);
                return {
                    type: "analysis",
                    analysisType: "model",
                    liveDoc: liveDoc as LiveDoc<ModelAnalysisDocument>,
                    liveModel,
                };
            } else if (doc.analysisType === "diagram") {
                const liveDiagram = await getLiveDiagram(doc.analysisOf._id, api, theories);
                return {
                    type: "analysis",
                    analysisType: "diagram",
                    liveDoc: liveDoc as LiveDoc<DiagramAnalysisDocument>,
                    liveDiagram,
                };
            }
            throw new Error(`Unknown analysis type: ${doc.analysisType}`);

        default:
            assertExhaustive(liveDoc.doc);
    }
}

export async function getLinkedLiveDocument(api: Api, theories: TheoryLibrary, link: Link) {
    return getAnyLiveDocument(link._id, api, theories);
}

async function getLiveDocumentRoot(
    liveDocument: AnyLiveDocument,
    api: Api,
    theories: TheoryLibrary,
): Promise<AnyLiveDocument> {
    let parentLink: Link;
    switch (liveDocument.type) {
        case "diagram":
            parentLink = liveDocument.liveDoc.doc.diagramIn;
            break;
        case "analysis":
            parentLink = liveDocument.liveDoc.doc.analysisOf;
            break;
        default:
            return liveDocument;
    }

    const parentDoc = await getLinkedLiveDocument(api, theories, parentLink);
    return getLiveDocumentRoot(parentDoc, api, theories);
}

function test(liveDocument: AnyLiveDocument) {}

function RelatedDocuments(props: {
    liveDocument: AnyLiveDocument;
}) {
    const api = useApi();
    const [data] = createResource(
        () => documentRefId(props.liveDocument),
        async (refId) => {
            const results = await api.rpc.get_related_ref_stubs.query(refId);

            if (results.tag !== "Ok") {
                throw "couldn't load related documents!";
            }

            return results.content;
        },
    );

    return (
        <Show when={data()} fallback={<div>Loading related items...</div>}>
            {(tree) => (
                <div class="related-tree">
                    <DocumentsTreeNode
                        isDescendantOfActiveDocument={false}
                        parentRefId={null}
                        node={tree()}
                        indent={1}
                        currentLiveDoc={props.liveDocument}
                    />
                </div>
            )}
        </Show>
    );
}

function DocumentsTreeNode(props: {
    node: RelatedRefStub;
    indent: number;
    parentRefId: string | null;
    isDescendantOfActiveDocument: boolean;
    currentLiveDoc: AnyLiveDocument;
}) {
    const isDescendant = () => {
        if (props.isDescendantOfActiveDocument) {
            return true;
        }

        if (props.node.stub.refId === documentRefId(props.currentLiveDoc)) {
            return true;
        }

        return false;
    };

    return (
        <>
            <DocumentsTreeLeaf
                stub={props.node.stub}
                indent={props.indent}
                currentLiveDoc={props.currentLiveDoc}
                parentRefId={props.parentRefId}
                isDescendantOfActiveDocument={props.isDescendantOfActiveDocument}
            />
            <For each={props.node.children}>
                {(child) => (
                    <DocumentsTreeNode
                        node={child}
                        indent={props.indent + 1}
                        parentRefId={props.node.stub.refId}
                        currentLiveDoc={props.currentLiveDoc}
                        isDescendantOfActiveDocument={isDescendant()}
                    />
                )}
            </For>
        </>
    );
}

function DocumentsTreeLeaf(props: {
    stub: RefStub;
    parentRefId: string | null;
    indent: number;
    currentLiveDoc: AnyLiveDocument;
    isDescendantOfActiveDocument: boolean;
}) {
    const navigate = useNavigate();
    const currentRefId = () => documentRefId(props.currentLiveDoc);

    const handleClick = () => {
        navigate(
            `/${props.currentLiveDoc.type}/${currentRefId()}/${props.stub.typeName}/${props.stub.refId}`,
        );
    };

    return (
        <div
            onClick={handleClick}
            class="related-document"
            classList={{
                active: props.stub.refId === currentRefId(),
                descendant: props.isDescendantOfActiveDocument,
            }}
            style={{ "padding-left": `${props.indent * 16}px` }}
        >
            <DocumentTypeIcon documentType={props.stub.typeName as AnyLiveDocumentType} />
            <div class="document-name">
                {(props.stub.refId === currentRefId()
                    ? props.currentLiveDoc.liveDoc.doc.name
                    : props.stub.name) || "Untitled"}
            </div>
            <div class="document-actions">
                <DocumentMenu stub={props.stub} parentRefId={props.parentRefId} />
            </div>
        </div>
    );
}

// Re-implementation from page/menubar.tsx that works outside of a kobalte menu.
function NewModelItem() {
    const api = useApi();
    const navigate = useNavigate();

    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Theory library must be provided as context");

    const onNewModel = async () => {
        const newRef = await createModel(api, theories.defaultTheoryMetadata().id);
        navigate(`/model/${newRef}`);
    };

    return (
        <div onClick={onNewModel}>
            <FilePlus />
            New Model
        </div>
    );
}
