import { FirebaseError } from "firebase/app";
import {
    type Auth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from "firebase/auth";

import type { JsonValue } from "catcolab-api";
import type { Document } from "catlog-wasm";

/** Initialize a test user in Firebase auth. */
export async function initTestUserAuth(auth: Auth, email: string, password: string) {
    try {
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
        if (err instanceof FirebaseError && err.code === "auth/email-already-in-use") {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            throw err;
        }
    }
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
    } as unknown as JsonValue;
}
