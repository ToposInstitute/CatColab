import type { DocumentType } from "catcolab-document-types";
import type { DeepReadonly } from "./util/deep-readonly";

export interface UserInfo {
    username: string | null;
    displayName: string | null;
}

export interface RelationInfo {
    refId: Uint8Array;
    relationType: string;
}

export interface DocInfo {
    name: string;
    typeName: DocumentType;
    createdAt: number;
    deletedAt: number | null;
    dependsOn: RelationInfo[];
    usedBy: RelationInfo[];
}

export interface MetaDocumentData {
    profile: UserInfo;
    knownUsers: Record<string, UserInfo | undefined>;
    documents: Record<string, DocInfo | undefined>;
}

export interface MetaDocument<MD extends MetaDocumentData = MetaDocumentData> {
    data(): DeepReadonly<MD>;
    onChange(callback: () => void): () => void;
}
