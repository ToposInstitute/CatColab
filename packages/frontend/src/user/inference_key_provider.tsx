import { getAuth } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type JSX, createEffect, createResource } from "solid-js";

import { useApi } from "../api";
import { type InferenceKeyResult, InferenceKeyContext } from "./inference_key_context";
import { useUserSettings } from "./user_settings";

/** Provides the authenticated user's inference key. */
export function InferenceKeyProvider(props: { children: JSX.Element }) {
    const api = useApi();
    const firebaseApp = useFirebaseApp();
    const auth = useAuth(getAuth(firebaseApp));
    const { settings } = useUserSettings();

    const enabledUserId = () => {
        const userId = auth.data?.uid;
        if (userId === undefined) {
            return null;
        }
        if (settings()?.llmEnabled !== true) {
            return null;
        }
        return userId;
    };

    const [inferenceKey, { mutate }] = createResource(enabledUserId, async () => {
        const result = await api.rpc.get_inference_key.query();
        if (result.tag === "Ok") {
            return { tag: "Ready", key: result.content } as InferenceKeyResult;
        }
        if (result.code === 503) {
            return { tag: "Unavailable" } as InferenceKeyResult;
        }
        throw new Error(result.message);
    });

    createEffect(() => {
        if (enabledUserId() === null) {
            mutate(undefined);
        }
    });

    return (
        <InferenceKeyContext.Provider value={inferenceKey}>
            {props.children}
        </InferenceKeyContext.Provider>
    );
}
