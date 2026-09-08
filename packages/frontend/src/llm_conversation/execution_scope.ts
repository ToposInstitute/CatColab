import { cellTypesForTheory } from "catcolab-logics/cell-types";

import type { LinkType } from "catcolab-document-types";
import {
    type Binder,
    createBinder,
    type DocumentStore,
    type LLMConversation,
    type Shape,
    type SupportedDocument,
    type Transaction,
} from "catcolab-documents";
import type { ContextExecScope } from "../inference/context_exec";
import { resolveSupportedDocument } from "./document_resolution";
import { type ScopedDocument, uniqueBinding, validateDraft } from "./scoped_document";

type ScopeEntry<Handle> =
    | { kind: "dependency"; link: LinkType; handle: Handle }
    | { kind: "attachment"; handle: Handle }
    | { kind: "dependent"; link: LinkType; handle: Handle };

export type LLMConversationExecutionScope = {
    bindings: ContextExecScope;
    systemPromptSuffix: string;
    validate(): Promise<ReadonlyArray<string>>;
    commit(): void;
    abort(): void;
};

export async function createLLMConversationExecutionScope<
    Handle,
    Version,
    Attachment extends SupportedDocument<Shape, Handle, Version>,
>(
    conversation: LLMConversation<Attachment, Handle>,
    store: DocumentStore<Handle, Version>,
): Promise<LLMConversationExecutionScope> {
    const binder = createBinder(store);
    const { documents, theories, tx } = await createScopedDocuments(conversation, binder);

    // Every theory in scope brings its cell types with it: both as bindings
    // for the code the LLM runs and as a description of what the `add` method
    // of the notebook documents accepts.
    const vocabularies = theories
        .map((theory) => cellTypesForTheory(theory))
        .filter((cellTypes) => cellTypes !== undefined);
    const vocabularyDescriptions = vocabularies.map(
        (cellTypes) =>
            `The cell types of the notebook documents, for use with their \`add\` method, are: ${Object.keys(
                cellTypes,
            )
                .map((name) => `\`${name}\``)
                .join(", ")}.`,
    );

    const descriptions = documents.map((document) => document.description);
    return {
        bindings: Object.freeze({
            ...Object.fromEntries(documents.map(({ binding, value }) => [binding, value])),
            ...Object.assign({}, ...vocabularies),
        }),
        systemPromptSuffix: [
            `The following documents are in scope:\n${descriptions.join("\n")}`,
            ...vocabularyDescriptions,
        ].join("\n\n"),
        async validate() {
            const problems: string[] = [];
            for (const document of documents) {
                problems.push(...(await document.validate()));
            }
            return problems;
        },
        commit() {
            void tx.commit();
        },
        abort() {
            tx.abort();
        },
    };
}

async function createScopedDocuments<
    Handle,
    Version,
    Attachment extends SupportedDocument<Shape, Handle, Version>,
>(
    conversation: LLMConversation<Attachment, Handle>,
    binder: Binder<Handle, Version>,
): Promise<{
    documents: ReadonlyArray<ScopedDocument>;
    theories: ReadonlyArray<string>;
    tx: Transaction<Handle, Version>;
}> {
    const store = binder.store;
    const origin = conversation.attachment;

    const [dependsOn, usedBy] = await Promise.all([
        store.listDependsOn(origin.handle),
        store.listUsedBy(origin.handle),
    ]);

    // Stage the origin together with every document it depends on and every
    // document that depends on it. The running conversation is the one
    // exception: we don't put it into the scope.
    const conversationRefId = store.getDocumentRef(conversation.handle).id;
    const entries: Array<ScopeEntry<Handle>> = [];
    for (const [link, handles] of Object.entries(dependsOn) as Array<
        [LinkType, ReadonlyArray<Handle>]
    >) {
        for (const handle of handles) {
            entries.push({ kind: "dependency", link, handle });
        }
    }
    entries.push({ kind: "attachment", handle: origin.handle });
    for (const [link, handles] of Object.entries(usedBy) as Array<
        [LinkType, ReadonlyArray<Handle>]
    >) {
        for (const handle of handles) {
            if (store.getDocumentRef(handle).id === conversationRefId) {
                continue;
            }
            entries.push({ kind: "dependent", link, handle });
        }
    }

    // Resolve the entries into API objects and stage their drafts in a single
    // transaction. The origin is an API object already; the linked documents
    // resolve through the store, and those that resolve to no API object are
    // omitted.
    const staged: Record<string, SupportedDocument<Shape, Handle, Version>> = {};
    const dependencies: Array<{ link: LinkType; key: string }> = [];
    const dependents: Array<{ link: LinkType; key: string }> = [];
    let attachmentKey: string | undefined;
    for (const [index, entry] of entries.entries()) {
        const document =
            entry.kind === "attachment"
                ? origin
                : (await resolveSupportedDocument(store, entry.handle))?.document;
        if (document === undefined) {
            continue;
        }
        const key = `document${index}`;
        staged[key] = document;
        switch (entry.kind) {
            case "dependency":
                dependencies.push({ link: entry.link, key });
                break;
            case "attachment":
                attachmentKey = key;
                break;
            case "dependent":
                dependents.push({ link: entry.link, key });
                break;
        }
    }
    if (attachmentKey === undefined) {
        throw new Error("The attached document is not in the scope.");
    }
    const { tx, draftDocs } = await binder.beginTransaction(staged);

    // Name the staged documents in the order they are presented: repeated
    // titles get distinct bindings, and the descriptions below refer to
    // other documents by these names.
    const usedBindings = new Set<string>();
    const bindingOfKey = new Map<string, string>();
    for (const key of [
        attachmentKey,
        ...dependencies.map((dependency) => dependency.key),
        ...dependents.map((dependent) => dependent.key),
    ]) {
        bindingOfKey.set(key, uniqueBinding(draftDocs[key]!.title, usedBindings));
    }

    /** The sentence introducing a staged document. */
    const introduces = (key: string, kind: "attached document" | "document") =>
        `\`${bindingOfKey.get(key)}\` is the ${kind} ${JSON.stringify(draftDocs[key]!.title)}.`;

    /** The clause describing one outgoing link of a document. */
    const pointsTo = (name: LinkType, target: string) =>
        ` Its \`${name}\` link points to \`${target}\`.`;

    /** The execution-scope representation of a staged draft. */
    const scopedDocument = (key: string, description: string): ScopedDocument => ({
        binding: bindingOfKey.get(key)!,
        value: draftDocs[key]!,
        description,
        validate: () => validateDraft(draftDocs[key]!, bindingOfKey.get(key)!),
    });

    // Write one sentence per staged document: the attached document describes
    // the links out to its dependencies, and each dependent describes the link
    // through which it points at the attached document.
    const attachedDocument = scopedDocument(
        attachmentKey,
        introduces(attachmentKey, "attached document") +
            dependencies.map(({ link, key }) => pointsTo(link, bindingOfKey.get(key)!)).join(""),
    );
    const dependencyDocuments = dependencies.map(({ key }) =>
        scopedDocument(key, introduces(key, "document")),
    );
    const dependentDocuments = dependents.map(({ link, key }) =>
        scopedDocument(
            key,
            introduces(key, "document") + pointsTo(link, bindingOfKey.get(attachmentKey)!),
        ),
    );

    // Every notebook in scope contributes its theory's cell types.
    const theoriesWithRepetitions: string[] = [];
    for (const draft of Object.values(draftDocs)) {
        if ("shape" in draft && draft.shape.theory !== undefined) {
            theoriesWithRepetitions.push(draft.shape.theory);
        }
    }
    const theories = [...new Set(theoriesWithRepetitions)];

    return {
        documents: [attachedDocument, ...dependencyDocuments, ...dependentDocuments],
        theories,
        tx,
    };
}
