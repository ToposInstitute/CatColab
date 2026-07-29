import type { DocInfo } from "catcolab-api/src/user_state";
import { type Accessor, createContext, useContext } from "solid-js";
import invariant from "tiny-invariant";

export type UserSettings = {
    llmCapabilitiesEnabled: boolean;
};

export type UserSettingsContextValue = {
    settings: Accessor<UserSettings>;
    isReady: Accessor<boolean>;
    updateSettings: (patch: Partial<UserSettings>) => void;
};

export const UserSettingsContext = createContext<UserSettingsContextValue>();

/** Whether a document should be visible with the current user settings. */
export function isDocumentVisible(doc: Pick<DocInfo, "typeName">, settings: UserSettings): boolean {
    return doc.typeName !== "llmconversation" || settings.llmCapabilitiesEnabled;
}

/** Retrieve the current user's settings and settings actions. */
export function useUserSettings(): UserSettingsContextValue {
    const context = useContext(UserSettingsContext);
    invariant(context, "User settings should be provided as context");
    return context;
}
