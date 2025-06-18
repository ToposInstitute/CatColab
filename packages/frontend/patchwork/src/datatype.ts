import { HasVersionControlMetadata } from "@patchwork/sdk/versionControl";
import { type DataTypeImplementation, initFrom } from "@patchwork/sdk";

// SCHEMA

export type Doc = HasVersionControlMetadata<unknown, unknown> & {
  title: string;
  message: string;
};

// FUNCTIONS

export const markCopy = (doc: Doc) => {
  doc.title = "Copy of " + doc.title;
};

const setTitle = async (doc: Doc, title: string) => {
  doc.title = title;
};

const getTitle = async (doc: Doc) => {
  return doc.title || "SolidJS Demo";
};

export const init = (doc: Doc) => {
  initFrom(doc, {
    title: "SolidJS Demo",
    message: "Hello from SolidJS!",
  });
};

export const dataType: DataTypeImplementation<Doc, unknown> = {
  init,
  getTitle,
  setTitle,
  markCopy,
};
