import { type Accessor, createMemo, createSignal, getOwner, onCleanup } from "solid-js";

import type {
    Binder,
    DeepReadonly,
    DocumentRef,
    RelatedDocuments,
    RelatedDocumentsOptions,
} from "catcolab-documents";

function relatedDocumentsEqual(
    left: DeepReadonly<RelatedDocuments>,
    right: DeepReadonly<RelatedDocuments>,
): boolean {
    return (Object.keys(left) as (keyof RelatedDocuments)[]).every((link) => {
        const previous = left[link];
        const next = right[link];
        return (
            previous.length === next.length &&
            previous.every((summary, index) => {
                const other = next[index];
                return (
                    other !== undefined &&
                    summary.ref.id === other.ref.id &&
                    summary.ref.version === other.ref.version &&
                    summary.ref.server === other.ref.server &&
                    summary.name === other.name &&
                    summary.typeName === other.typeName &&
                    summary.createdAt === other.createdAt
                );
            })
        );
    });
}

export function createRelatedDocumentsView(
    binder: Pick<Binder<unknown, unknown>, "meta" | "listRelatedDocuments">,
    ref: Accessor<DocumentRef>,
    options: RelatedDocumentsOptions | Accessor<RelatedDocumentsOptions>,
): Accessor<DeepReadonly<RelatedDocuments>> {
    if (!getOwner()) {
        throw new Error("Related document views must be created within a Solid owner.");
    }

    const [revision, setRevision] = createSignal(0);
    const view = createMemo(
        () => {
            revision();
            return binder.listRelatedDocuments(
                ref(),
                typeof options === "function" ? options() : options,
            );
        },
        undefined,
        { equals: relatedDocumentsEqual },
    );
    onCleanup(binder.meta.onChange(() => setRevision((value) => value + 1)));
    return view;
}
