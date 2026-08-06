import type { Document } from "catcolab-document-types";

/** A document whose primary content is a notebook. */
export type NotebookDocument = Extract<Document, { type: "model" | "diagram" | "analysis" }>;
