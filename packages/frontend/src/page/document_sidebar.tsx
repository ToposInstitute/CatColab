import { useNavigate } from "@solidjs/router";
import type { RefStub, RelatedRefStub } from "catcolab-api";
import FilePlus from "lucide-solid/icons/file-plus";
import { useContext } from "solid-js";
import { For } from "solid-js";
import { Show } from "solid-js";
import { createResource } from "solid-js";
import invariant from "tiny-invariant";
import { useApi } from "../api";
import { createModel } from "../model";
import { TheoryLibraryContext } from "../stdlib";
import { DocumentTypeIcon } from "../util/document_type_icon";
import { DocumentMenu } from "./document_menu";
import { AppMenu } from "./menubar";
import { type AnyLiveDocument, type AnyLiveDocumentType, documentRefId } from "./utils";

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
