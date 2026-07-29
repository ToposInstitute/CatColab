import type { DocInfo } from "catcolab-api/src/user_state";
import { renderToString } from "solid-js/web";
import { assert, test, vi } from "vitest";

import type { UserSettings } from "./user_settings_context";

const { getInferenceKey } = vi.hoisted(() => ({
    getInferenceKey: vi.fn<() => Promise<never>>(),
}));

vi.mock("firebase/auth", () => ({
    getAuth: vi.fn<() => unknown>(),
}));

vi.mock("solid-firebase", () => ({
    useAuth: () => ({ data: { uid: "test-user" } }),
    useFirebaseApp: () => ({}),
}));

vi.mock("../api", () => ({
    useApi: () => ({
        rpc: {
            get_inference_key: {
                query: getInferenceKey,
            },
        },
    }),
}));

vi.mock("./user_settings_context", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./user_settings_context")>()),
    useUserSettings: () => ({
        settings: () => ({ llmCapabilitiesEnabled: false }),
        isReady: () => true,
        updateSettings: vi.fn<(patch: Partial<UserSettings>) => void>(),
    }),
}));

import { InferenceKeyProvider } from "./inference_key_provider";
import { isDocumentVisible } from "./user_settings_context";

test("choosing no blocks LLM features", async () => {
    renderToString(() => <InferenceKeyProvider>{null}</InferenceKeyProvider>);
    await Promise.resolve();

    assert.equal(getInferenceKey.mock.calls.length, 0);

    const documents: Array<Pick<DocInfo, "typeName">> = [
        { typeName: "llmconversation" },
        { typeName: "model" },
    ];
    const settings: UserSettings = { llmCapabilitiesEnabled: false };
    const visibleDocuments = documents.filter((doc) => isDocumentVisible(doc, settings));

    assert.deepEqual(
        visibleDocuments.map((doc) => doc.typeName),
        ["model"],
    );
});
