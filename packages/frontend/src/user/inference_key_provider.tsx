import { getAuth } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type JSX, createEffect, createResource } from "solid-js";

import { useApi } from "../api";
import { type InferenceKeyResult, InferenceKeyContext } from "./inference_key_context";

/** Provides the authenticated user's inference key. */
export function InferenceKeyProvider(props: { children: JSX.Element }) {
    const api = useApi();
    const firebaseApp = useFirebaseApp();
    const auth = useAuth(getAuth(firebaseApp));

    const [inferenceKey, { mutate }] = createResource(
        () => auth.data?.uid ?? null,
        async () => {
            const result = await api.rpc.get_inference_key.query();
            if (result.tag === "Ok") {
                return { tag: "Ready", key: result.content } as InferenceKeyResult;
            }
            if (result.code === 503) {
                return { tag: "Unavailable" } as InferenceKeyResult;
            }
            throw new Error(result.message);
        },
    );

    // clear the resource explicitly on sign-out
    createEffect(() => {
        if (auth.data == null) {
            mutate(undefined);
        }
    });

    return (
        <InferenceKeyContext.Provider value={inferenceKey}>
            {props.children}
        </InferenceKeyContext.Provider>
    );
}
