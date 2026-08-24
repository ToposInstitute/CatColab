import type { Document } from "catcolab-document-types";
import {
    createBinder,
    type Instance,
    type InstanceDocument,
    type LLMConversation,
    type LLMConversationAttachment,
    modelNotebookFromStore,
    type ModelDocument,
    type Notebook,
    type DocumentStore,
    type Shape,
} from "catcolab-documents";
import type { ContextExecScope } from "../inference/context_exec";

const API_PROMPT = `The document bindings expose the CatColab document API. A schema binding has \`title\`, \`cells()\`, \`cellsOf(type)\`, \`add(type, values)\`, \`update(patch)\`, and \`validate()\`. An instance binding has \`title\`, \`tables()\`, \`get(path)\`, row editing methods, \`update(patch)\`, and \`validate()\`. These APIs mutate in-memory working copies; changes are applied to the user's documents only after every document validates.`;

export type LLMConversationExecutionScope = {
    bindings: ContextExecScope;
    systemPromptSuffix: string;
    validate(): Promise<ReadonlyArray<string>>;
    commit(): void;
};

export async function createLLMConversationExecutionScope<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(
    conversation: LLMConversation<Attachment, Handle>,
    store: DocumentStore<Handle>,
): Promise<LLMConversationExecutionScope> {
    const attachment = conversation.attachment;
    let sourceSchema: Notebook<Shape, ModelDocument, Handle>;
    let sourceInstance: Instance<Handle, Shape> | undefined;

    if (isNotebook(attachment)) {
        sourceSchema = attachment;
    } else {
        sourceInstance = attachment;
        const schemaHandle = await resolveHandle(store, sourceInstance.document.instanceOf);
        const schemaDocument = store.getDocumentView(schemaHandle);
        if (schemaDocument.type !== "model") {
            throw new Error("The instance schema is not a model document.");
        }
        sourceSchema = modelNotebookFromStore(sourceInstance.shape, store, schemaHandle);
    }

    if (!sourceSchema.shape.theory) {
        throw new Error("The document shape does not identify its theory.");
    }
    const shape = sourceSchema.shape as Shape & { readonly theory: string };
    const schemaHandle = sourceSchema.handle;
    const sourceInstanceHandle = sourceInstance?.handle;
    const copyBinder = createBinder();
    const copySchema = await copyBinder.createNotebook(shape, {
        title: sourceSchema.title,
    });

    let copyInstance: Instance<Document, typeof shape> | undefined;
    if (sourceInstance) {
        const created = await copyBinder.createInstance(copySchema, {
            title: sourceInstance.title,
        });
        if (created.tag === "Err") {
            throw new Error(formatIssues(created.content).join("\n"));
        }
        copyInstance = created.content;
    }

    replaceDocument(copyBinder.store, copySchema.handle, sourceSchema.dump());
    if (sourceInstance && copyInstance) {
        replaceDocument(copyBinder.store, copyInstance.handle, sourceInstance.dump(), [
            "instanceOf",
        ]);
    }

    const usedBindings = new Set<string>();
    const schemaBinding = uniqueBinding(sourceSchema.title, "schema", usedBindings);
    const mutableBindings: Record<
        string,
        Notebook<typeof shape, ModelDocument, Document> | Instance<Document, typeof shape>
    > = { [schemaBinding]: copySchema };
    const validators: Array<() => Promise<string[]>> = [
        async () => {
            const result = await copySchema.validate();
            if (result.tag === "Err") {
                return formatIssues(result.content).map((issue) => `${schemaBinding}: ${issue}`);
            }
            result.content.free();
            return [];
        },
    ];
    const commits: Array<() => void> = [
        () => {
            replaceDocument(store, schemaHandle, copySchema.dump());
        },
    ];

    const descriptions = [
        `\`${schemaBinding}\` is the schema ${JSON.stringify(copySchema.title)}.`,
    ];
    if (sourceInstanceHandle !== undefined && copyInstance) {
        const instanceBinding = uniqueBinding(copyInstance.title, "instance", usedBindings);
        mutableBindings[instanceBinding] = copyInstance;
        validators.push(async () => {
            const result = await copyInstance.validate();
            return result.tag === "Err"
                ? formatIssues(result.content).map((issue) => `${instanceBinding}: ${issue}`)
                : [];
        });
        commits.push(() => {
            replaceDocument(store, sourceInstanceHandle, copyInstance.dump(), ["instanceOf"]);
        });
        descriptions.push(
            `\`${instanceBinding}\` is the instance ${JSON.stringify(copyInstance.title)} of \`${schemaBinding}\`.`,
        );
    }
    const bindings = Object.freeze(mutableBindings);

    return {
        bindings,
        systemPromptSuffix: `${API_PROMPT}\n\nThe following documents are in scope:\n${descriptions.join("\n")}`,
        async validate() {
            const problems: string[] = [];
            for (const validate of validators) {
                problems.push(...(await validate()));
            }
            return problems;
        },
        commit() {
            for (const commit of commits) {
                commit();
            }
        },
    };
}

function isNotebook<Handle>(
    attachment: LLMConversationAttachment<Shape, Handle>,
): attachment is Notebook<Shape, ModelDocument, Handle> {
    return attachment.document.type === "model";
}

async function resolveHandle<Handle>(
    store: DocumentStore<Handle>,
    ref: { _id: string; _version: string | null; _server: string },
): Promise<Handle> {
    const result = await store.getHandle({
        id: ref._id,
        version: ref._version,
        server: ref._server,
    });
    if (result.tag === "Err") {
        throw new Error(formatIssues(result.content).join("\n"));
    }
    return result.content;
}

function replaceDocument<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    replacement: Document,
    preservedKeys: ReadonlyArray<keyof InstanceDocument> = [],
): void {
    store.changeDocument(handle, (document) => {
        const mutable = document as unknown as Record<string, unknown>;
        const preserved = Object.fromEntries(
            preservedKeys.map((key) => [key, mutable[key as string]]),
        );
        for (const key of Object.keys(mutable)) {
            delete mutable[key];
        }
        Object.assign(mutable, replacement, preserved);
    });
}

function uniqueBinding(title: string, fallback: string, used: Set<string>): string {
    const stem = title
        .normalize("NFKD")
        .replace(/[^A-Za-z0-9_$]+/g, "_")
        .replace(/^_+|_+$/g, "");
    const base = `document_${stem || fallback}`;
    let binding = base;
    for (let suffix = 2; used.has(binding); suffix += 1) {
        binding = `${base}_${suffix}`;
    }
    used.add(binding);
    return binding;
}

function formatIssues(
    issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<unknown> }>,
): string[] {
    return issues.map((issue) => {
        if (!issue.path?.length) {
            return issue.message;
        }
        const path = issue.path
            .map((segment) =>
                typeof segment === "object" && segment !== null && "key" in segment
                    ? String(segment.key)
                    : String(segment),
            )
            .join(".");
        return `${issue.message} (at ${path})`;
    });
}
