import type { Document } from "catcolab-document-types";
import type { DocumentOfType } from "./document";
import type { Result } from "./result";
import type { DocumentRef, DocumentStore } from "./store";

export interface DocumentAdapter<Type extends Document["type"], Definition, Options> {
    readonly documentType: Type;
    create(definition: Definition, options: Options): DocumentOfType<Type>;
    check(definition: Definition, document: DocumentOfType<Type>): Result<undefined>;
}

export async function createWithAdapter<Handle, Type extends Document["type"], Def, Options, API>(
    store: DocumentStore<Handle>,
    adapter: DocumentAdapter<Type, Def, Options>,
    definition: Def,
    options: Options,
    attach: (handle: Handle, definition: Def) => API,
): Promise<API> {
    const handle = await store.createHandle(adapter.create(definition, options));
    return attach(handle, definition);
}

export async function loadWithAdapter<Handle, Type extends Document["type"], Def, Options, API>(
    store: DocumentStore<Handle>,
    adapter: DocumentAdapter<Type, Def, Options>,
    definition: Def,
    document: Document,
    attach: (handle: Handle, definition: Def) => API,
): Promise<Result<API>> {
    if (document.type !== adapter.documentType) {
        return documentTypeMismatch(adapter.documentType, document.type);
    }
    const typedDocument = document as DocumentOfType<Type>;
    const checked = adapter.check(definition, typedDocument);
    if (checked.tag === "Err") {
        return checked;
    }
    const handle = await store.createHandle(typedDocument);
    return { tag: "Ok", content: attach(handle, definition) };
}

export async function loadRefWithAdapter<Handle, Type extends Document["type"], Def, Options, API>(
    store: DocumentStore<Handle>,
    adapter: DocumentAdapter<Type, Def, Options>,
    definition: Def,
    ref: DocumentRef,
    attach: (handle: Handle, definition: Def) => API,
): Promise<Result<API>> {
    const resolved = await store.getHandle(ref);
    if (resolved.tag === "Err") {
        return resolved;
    }
    const document = store.getDocumentView(resolved.content);
    if (document.type !== adapter.documentType) {
        return documentTypeMismatch(adapter.documentType, document.type);
    }
    const checked = adapter.check(definition, document as DocumentOfType<Type>);
    if (checked.tag === "Err") {
        return checked;
    }
    return { tag: "Ok", content: attach(resolved.content, definition) };
}

function documentTypeMismatch(expected: string, actual: string): Result<never> {
    return {
        tag: "Err",
        content: [
            {
                message: `Cannot load a document of type "${actual}" as "${expected}".`,
                path: ["type"],
            },
        ],
    };
}
