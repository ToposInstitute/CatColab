/** A reference in a document to another document. */
export type ExternRef = {
    tag: "extern-ref";
    refId: string;
    taxon: string;
};
