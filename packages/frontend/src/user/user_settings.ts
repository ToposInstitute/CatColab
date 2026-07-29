import type { DocInfo } from "catcolab-api/src/user_state";
import { createContext, type Resource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { UserSettings } from "catcolab-api";

export type UserSettingsContextValue = {
    settings: Resource<UserSettings>;
    updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
};

export const UserSettingsContext = createContext<UserSettingsContextValue>();

/** Retrieve the current user's settings and settings actions. */
export function useUserSettings(): UserSettingsContextValue {
    const context = useContext(UserSettingsContext);
    invariant(context, "User settings should be provided as context");
    return context;
}

/** Whether a document should be visible with the current user settings. */
export function isDocumentVisible(
    doc: Pick<DocInfo, "typeName">,
    settings?: UserSettings,
): boolean {
    return doc.typeName !== "llmconversation" || settings?.llmEnabled === true;
}
