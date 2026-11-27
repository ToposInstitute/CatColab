import { type DocHandle, type DocumentId } from "@automerge/automerge-repo";
import type { UserState } from "catcolab-api/src/user_state";
import { type Auth, onAuthStateChanged } from "firebase/auth";

import type { DeepReadonly, MetaDocument } from "catcolab-documents";
import { INITIAL_USER_STATE } from "../user/user_state_context";
import { normalizeImmutableStrings } from "../util/immutable_string";
import { unwrap } from "./rpc";
import type { Api } from "./types";

export type ApiMetaDocument = {
    doc: MetaDocument<UserState>;
    dispose(): void;
};

/** Creates a metadata document backed by the Automerge `UserState` document. */
export function createApiMetaDocument(api: Api, auth: Auth): ApiMetaDocument {
    let handle: DocHandle<UserState> | null = null;
    let snapshot: DeepReadonly<UserState> | undefined;
    let generation = 0;
    let disposed = false;
    const listeners = new Set<() => void>();

    const doc: MetaDocument<UserState> = {
        data() {
            snapshot ??= handle
                ? normalizeImmutableStrings(handle.doc())
                : structuredClone(INITIAL_USER_STATE);
            return snapshot;
        },
        onChange(callback) {
            if (disposed) {
                return () => {};
            }
            listeners.add(callback);
            return () => {
                listeners.delete(callback);
            };
        },
    };
    const refresh = (): void => {
        snapshot = undefined;
        for (const callback of Array.from(listeners)) {
            callback();
        }
    };
    const setHandle = (next: DocHandle<UserState> | null): void => {
        if (handle === next) {
            return;
        }
        handle?.off("change", refresh);
        handle = next;
        handle?.on("change", refresh);
        refresh();
    };

    // This will initialize on first load and re-initialize on logout/login.
    const unsubscribeAuth = onAuthStateChanged(auth, async (): Promise<void> => {
        if (disposed) {
            return;
        }
        const request = ++generation;
        setHandle(null);
        const id = unwrap(await api.rpc.get_user_state_doc_id.query());
        if (generation !== request) {
            return;
        }
        const next = await api.repo.find<UserState>(id as DocumentId);
        if (generation === request) {
            setHandle(next);
        }
    });

    return {
        doc,
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
            generation++;
            unsubscribeAuth();
            snapshot = doc.data();
            handle?.off("change", refresh);
            handle = null;
            listeners.clear();
        },
    };
}
