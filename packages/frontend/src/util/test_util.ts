import { type Auth, createUserWithEmailAndPassword } from "firebase/auth";
import { v4 } from "uuid";

import type { JsonValue } from "catcolab-api";
import type { Document } from "catlog-wasm";

/** Create a Firebase user isolated from other local and CI test runs. */
export async function createTestUserAuth(auth: Auth, label: string, password: string) {
    const email = `${label}-${v4()}@catcolab.org`;
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    return { email, user };
}

/** Creates a valid test document with the given name. */
export function createTestDocument(name: string): JsonValue {
    const doc: Document = {
        type: "model",
        name,
        theory: "empty",
        notebook: { cellOrder: [], cellContents: {} },
        version: "1",
    };

    return doc as unknown as JsonValue;
}

/** Creates a valid child (diagram) test document linking to a parent ref. */
export function createChildTestDocument(name: string, parentRefId: string): JsonValue {
    return {
        type: "diagram",
        name,
        diagramIn: {
            _id: parentRefId,
            _version: null,
            _server: "test",
            type: "diagram-in",
        },
        notebook: { cellOrder: [], cellContents: {} },
        version: "1",
    };
}
