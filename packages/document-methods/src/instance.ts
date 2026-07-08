import { v7 } from "uuid";

import type {
    InstanceJudgment,
    Document,
    StableRef,
} from "catcolab-document-types";
import { currentVersion } from "catcolab-document-types";
import { newNotebook } from "./notebook";

/** A document defining a instance in a model. */
export type InstanceDocument = Document & { type: "instance" };

/** Create an empty instance of a model. */
export const newInstanceDocument = (modelRef: StableRef): InstanceDocument => ({
    name: "",
    type: "instance",
    instanceIn: {
        ...modelRef,
        type: "instance-in",
    },
    notebook: newNotebook<InstanceJudgment>(),
    version: currentVersion(),
});

/** Duplicate a instance judgment, creating a fresh UUID. */
export const duplicateInstanceJudgment = (jgmt: InstanceJudgment): InstanceJudgment => ({
    ...structuredClone(jgmt),
    id: v7(),
});
