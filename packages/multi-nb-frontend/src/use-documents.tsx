import { AnyDocumentId } from "@automerge/automerge-repo";
import { createContext, JSX, useContext } from "solid-js";
import { SetStoreFunction } from "solid-js/store";

export type DocumentStore = {
    allDocumentIds: AnyDocumentId[];
};

export type Documents = {
    value: DocumentStore;
    update: SetStoreFunction<DocumentStore>;
};

const DOCUMENTS_CONTEXT = createContext<Documents>();

export function DocumentsProvider(
    props: { documents: Documents; children?: JSX.Element },
): JSX.Element {
    return (
        <DOCUMENTS_CONTEXT.Provider value={props.documents}>
            {props.children}
        </DOCUMENTS_CONTEXT.Provider>
    );
}

export function useDocuments(): Documents | undefined {
    return useContext(DOCUMENTS_CONTEXT);
}
