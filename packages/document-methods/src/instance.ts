import type { Document, StableRef } from "catcolab-document-types";
import { currentVersion } from "catcolab-document-types";

/** A document defining a instance in a model. */
export type InstanceDocument = Extract<Document, { type: "instance" }>;

/** Create an empty instance of a model. */
export const newInstanceDocument = (modelRef: StableRef): InstanceDocument => ({
    name: "",
    type: "instance",
    instanceOf: {
        ...modelRef,
        type: "instance-of",
    },
    tables: {},
    version: currentVersion(),
});
