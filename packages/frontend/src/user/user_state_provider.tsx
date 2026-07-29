import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useFirebaseApp } from "solid-firebase";
import { type JSX, createMemo, createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { useApi } from "../api";
import { unwrap } from "../api/rpc";
import { normalizeImmutableStrings } from "../util/immutable_string";
import { type UserSettings, UserSettingsContext } from "./user_settings_context";
import { type AppUserState, INITIAL_USER_STATE, UserStateContext } from "./user_state_context";

export function UserStateProvider(props: { children: JSX.Element }) {
    const api = useApi();
    const firebaseApp = useFirebaseApp();
    const [userState, setUserState] = createStore<AppUserState>(INITIAL_USER_STATE);
    const [isReady, setIsReady] = createSignal(false);
    const settings = createMemo<UserSettings>(() => ({
        llmCapabilitiesEnabled: userState.settings?.llmCapabilitiesEnabled === true,
    }));

    let currentDocHandle: DocHandle<AppUserState> | null = null;
    let currentChangeHandler: ((arg: { doc: AppUserState }) => void) | null = null;
    let currentUserId: string | null = null;

    const teardownDocHandle = () => {
        if (currentDocHandle && currentChangeHandler) {
            currentDocHandle.off("change", currentChangeHandler);
        }
        currentDocHandle = null;
        currentChangeHandler = null;
    };

    // This will initialize on first load and re-initialize on logout/login
    const unsubscribeAuth = onAuthStateChanged(getAuth(firebaseApp), async (user) => {
        const userId = user?.uid ?? null;
        currentUserId = userId;

        teardownDocHandle();
        setUserState(INITIAL_USER_STATE);
        setIsReady(false);

        if (userId === null) {
            return;
        }

        const userStateDocId = unwrap(await api.rpc.get_user_state_doc_id.query());
        if (currentUserId !== userId) {
            return;
        }

        const docHandle: DocHandle<AppUserState> = await api.repo.find(
            userStateDocId as DocumentId,
        );
        await docHandle.whenReady();
        if (currentUserId !== userId) {
            return;
        }

        currentDocHandle = docHandle;
        const onChange = ({ doc }: { doc: AppUserState }) => {
            setUserState(reconcile(normalizeImmutableStrings(doc)));
        };
        currentChangeHandler = onChange;

        setUserState(reconcile(normalizeImmutableStrings(docHandle.doc())));
        docHandle.on("change", onChange);
        setIsReady(true);
    });

    const updateSettings = (patch: Partial<UserSettings>) => {
        if (currentDocHandle === null) {
            return;
        }

        currentDocHandle.change((doc) => {
            if (doc.settings === undefined) {
                doc.settings = {};
            }
            Object.assign(doc.settings, patch);
        });
    };

    onCleanup(() => {
        unsubscribeAuth();
        teardownDocHandle();
    });

    const settingsContext = { settings, isReady, updateSettings };

    return (
        <UserStateContext.Provider value={userState}>
            <UserSettingsContext.Provider value={settingsContext}>
                {props.children}
            </UserSettingsContext.Provider>
        </UserStateContext.Provider>
    );
}
