import { stringify as uuidStringify } from "uuid";

import type { LinkType } from "catcolab-document-types";
import type { DocumentRef } from "../document-store";
import type { DocInfo, MetaDocument, RelationInfo } from "../meta_document";
import type { DeepReadonly } from "../util/deep-readonly";

export type RelatedDocSummary = Pick<DocInfo, "name" | "typeName" | "createdAt"> & {
    readonly ref: DocumentRef;
};

/** Summaries of documents related to a document, indexed by the type of the
 * link relating them. Every link type is present; a type with no matches
 * maps to an empty array. */
export type RelatedDocuments = Record<LinkType, RelatedDocSummary[]>;

export interface RelatedDocumentsOptions {
    direction: "depends-on" | "used-by" | "both";
    links?: LinkType[];
}

/** Selects relations of a given document. */
function getDocumentRelations(
    document: DeepReadonly<DocInfo> | undefined,
    options: DeepReadonly<RelatedDocumentsOptions>,
): DeepReadonly<RelationInfo>[] {
    if (!document || document.deletedAt !== null) {
        return [];
    }
    const relations: DeepReadonly<RelationInfo>[] = [];
    if (options.direction !== "used-by") {
        relations.push(...document.dependsOn);
    }
    if (options.direction !== "depends-on") {
        relations.push(...document.usedBy);
    }
    if (options.links === undefined) {
        return relations;
    }
    const selected = new Set<string>(options.links);
    return relations.filter((relation) => selected.has(relation.relationType));
}

/** Creates an empty index of document summaries by link type. The arrays are
 * fresh, so each query can fill them independently. */
function emptyRelatedDocuments(): RelatedDocuments {
    return {
        "analysis-of": [],
        "diagram-in": [],
        "instance-of": [],
        "llmconversation-of": [],
        instantiation: [],
    };
}

export function listRelatedDocuments(
    meta: MetaDocument,
    ref: DeepReadonly<DocumentRef>,
    options: DeepReadonly<RelatedDocumentsOptions>,
): DeepReadonly<RelatedDocuments> {
    const metadata = meta.data();
    const summaries = emptyRelatedDocuments();
    const isLinkType = (link: string): link is LinkType => Object.hasOwn(summaries, link);
    const seen = new Map<LinkType, Set<string>>();
    for (const relation of getDocumentRelations(metadata.documents[ref.id], options)) {
        const link = relation.relationType;
        if (!isLinkType(link)) {
            continue;
        }
        const id = uuidStringify(new Uint8Array(relation.refId));
        const document = metadata.documents[id];
        if (id === ref.id || !document || document.deletedAt !== null || seen.get(link)?.has(id)) {
            continue;
        }
        const ids = seen.get(link) ?? new Set<string>();
        ids.add(id);
        seen.set(link, ids);
        summaries[link].push({
            ref: {
                id,
                version: null,
                ...(ref.server === undefined ? {} : { server: ref.server }),
            },
            typeName: document.typeName,
            name: document.name,
            createdAt: document.createdAt,
        });
    }
    return summaries;
}
