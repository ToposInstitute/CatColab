import type { ModelJudgment } from "catcolab-document-types";
import {
    DblModelMap,
    elaborateModel,
    ThCategory,
    type DblModel,
    type DblTheory,
    type ModelNotebook,
} from "catlog-wasm";
import { getModelDocumentView } from "./model-document";
import type { Result } from "./result";
import type { DocumentRef, DocumentStore } from "./store";

let simpleOlogTheory: DblTheory | undefined;
let simpleOlogTheoryOwner: ThCategory | undefined;

function theoryFor(theory: string): DblTheory {
    if (theory !== "simple-olog") {
        throw new Error(`No core theory is registered for "${theory}".`);
    }
    if (!simpleOlogTheory) {
        simpleOlogTheoryOwner = new ThCategory();
        simpleOlogTheory = simpleOlogTheoryOwner.theory();
    }
    return simpleOlogTheory;
}

export async function validateDocument<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
): Promise<Result<DblModel>> {
    try {
        const document = getModelDocumentView(store, handle);
        const ref = store.getDocumentRef(handle);
        const model = await elaborate(store, ref, theoryFor(document.theory), []);
        const result = model.validate();
        if (result.tag === "Err") {
            model.free();
            return {
                tag: "Err",
                content: result.content.map((error) => ({ message: JSON.stringify(error) })),
            };
        }
        return { tag: "Ok", content: model };
    } catch (error) {
        return {
            tag: "Err",
            content: [{ message: error instanceof Error ? error.message : String(error) }],
        };
    }
}

interface ResolutionEntry {
    readonly key: string;
    readonly name: string;
}

function refKey(ref: DocumentRef): string {
    return `${ref.server ?? ""}\u0000${ref.id}\u0000${ref.version ?? ""}`;
}

async function elaborate<Handle>(
    store: DocumentStore<Handle>,
    ref: DocumentRef,
    theory: DblTheory,
    stack: readonly ResolutionEntry[],
): Promise<DblModel> {
    const key = refKey(ref);
    const cycleStart = stack.findIndex((entry) => entry.key === key);
    if (cycleStart >= 0) {
        const cycle = [...stack.slice(cycleStart), stack[cycleStart]!]
            .map((entry) => `"${entry.name}"`)
            .join(" → ");
        throw new Error(
            `Instantiation cycle detected: ${cycle}. ` +
                "A notebook cannot instantiate itself, directly or indirectly. " +
                "To fix, remove one of the instantiations in this chain.",
        );
    }

    const resolved = await store.getHandle(ref);
    if (resolved.tag === "Err") {
        throw new Error(resolved.content.map((issue) => issue.message).join("; "));
    }
    const handle = resolved.content;
    const document = store.copyValue(handle, getModelDocumentView(store, handle));
    const nextStack = [...stack, { key, name: document.name }];
    const instantiated = new DblModelMap();
    const instantiatedRefs = new Set<string>();
    try {
        for (const cellId of document.notebook.cellOrder) {
            const cell = document.notebook.cellContents[cellId];
            const judgment = cell?.tag === "formal" ? (cell.content as ModelJudgment) : undefined;
            if (judgment?.tag !== "instantiation" || !judgment.model) {
                continue;
            }
            const childRef: DocumentRef = {
                id: judgment.model._id,
                version: judgment.model._version,
                server: judgment.model._server,
            };
            const childKey = refKey(childRef);
            if (instantiatedRefs.has(childKey)) {
                continue;
            }
            if (instantiated.has(childRef.id)) {
                throw new Error(
                    `Cannot instantiate multiple references with document id "${childRef.id}" ` +
                        "but different servers or versions.",
                );
            }
            instantiatedRefs.add(childKey);
            instantiated.set(childRef.id, await elaborate(store, childRef, theory, nextStack));
        }
        return elaborateModel(
            document.notebook as unknown as ModelNotebook,
            instantiated,
            theory,
            ref.id,
        );
    } finally {
        instantiated.free();
    }
}
