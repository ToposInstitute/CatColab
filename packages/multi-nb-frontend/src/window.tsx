import { AnyDocumentId } from "@automerge/automerge-repo";
import { Buffer } from "./buffer";
import { useLiveDoc, useRepo } from "./use-livedoc";
import { For, JSX, Show } from "solid-js";
import { useDocuments } from "./use-documents";
import { RawNotebook } from "catlaborator";

// function BufferSelect() {
//     const buffers = useContext(BUFFERS);

//     if (buffers === undefined) {
//         return <div>Must provide buffers context</div>;
//     }

//     return (
//         <ul>
//             {
//                 /* <For each={[...buffers.buffers.keys()]}>
//                 {(name) => <li>{name}</li>}
//             </For> */
//             }
//         </ul>
//     );
// }

function newNotebook(): RawNotebook {
    return {
        title: "",
        cellContent: {},
        order: [],
    };
}

function SelectDocument(
    props: { docId?: AnyDocumentId; setDocId: (docId: AnyDocumentId) => void },
): JSX.Element {
    const documents = useDocuments();
    const repo = useRepo();

    if (!documents) {
        throw new Error("must provide documents context");
    }

    return (
        <div class="document-selector">
            <select
                value={props.docId as string}
                onInput={(ev) =>
                    props.setDocId(ev.target.value as AnyDocumentId)}
            >
                <For each={documents.value.allDocumentIds}>
                    {(id) => {
                        const liveDoc = useLiveDoc<RawNotebook>(() => id);
                        const idAsString = id.toString();
                        return (
                            <option value={idAsString}>
                                {idAsString.substring(0, 7)} --{" "}
                                {liveDoc()?.value.title}
                            </option>
                        );
                    }}
                </For>
            </select>
            <button
                onClick={() => {
                    let doc = repo.create(newNotebook());
                    documents.update(
                        "allDocumentIds",
                        documents.value.allDocumentIds.length,
                        doc.documentId,
                    );
                }}
            >
                New notebook
            </button>
        </div>
    );
}

export function Window(
    props: { docId?: AnyDocumentId; setDocId: (docId: AnyDocumentId) => void },
) {
    return (
        <div>
            <SelectDocument docId={props.docId} setDocId={props.setDocId} />
            <Show when={props.docId != "" && props.docId}>
                {(docId) => {
                    const liveDoc = useLiveDoc<RawNotebook>(docId);
                    return (
                        <Show when={liveDoc()}>
                            {(liveDoc) => <Buffer livedoc={liveDoc()} />}
                        </Show>
                    );
                }}
            </Show>
        </div>
    );
}
