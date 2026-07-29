import { getAuth } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type JSX, createEffect, createResource } from "solid-js";

import type { UserSettings } from "catcolab-api";
import { useApi } from "../api";
import { unwrap } from "../api/rpc";
import { UserSettingsContext } from "./user_settings";

/** Provides settings for the authenticated user. */
export function UserSettingsProvider(props: { children: JSX.Element }) {
    const api = useApi();
    const firebaseApp = useFirebaseApp();
    const auth = useAuth(getAuth(firebaseApp));

    const [settings, { mutate: setSettings }] = createResource(
        () => auth.data?.uid ?? null,
        async () => unwrap(await api.rpc.get_active_user_settings.query()),
    );

    createEffect(() => {
        if (auth.data == null) {
            setSettings(undefined);
        }
    });

    const updateSettings = async (patch: Partial<UserSettings>) => {
        const userId = auth.data?.uid;
        const currentSettings = settings();
        if (userId === undefined || currentSettings === undefined) {
            return;
        }

        const nextSettings: UserSettings = { ...currentSettings, ...patch };
        unwrap(await api.rpc.set_active_user_settings.mutate(nextSettings));
        if (auth.data?.uid === userId) {
            setSettings(nextSettings);
        }
    };

    return (
        <UserSettingsContext.Provider value={{ settings, updateSettings }}>
            {props.children}
        </UserSettingsContext.Provider>
    );
}
