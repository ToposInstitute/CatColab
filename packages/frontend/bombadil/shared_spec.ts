import { always, eventually } from "@antithesishq/bombadil";
import { actions, extract } from "@antithesishq/bombadil/browser";
import { defaultActions } from "@antithesishq/bombadil/browser/defaults";

export {
    noConsoleErrors,
    noHttpErrorCodes,
    noUncaughtExceptions,
} from "@antithesishq/bombadil/browser/defaults/properties";

const unhandledPromiseRejections = extract((state) =>
    state.errors.uncaughtExceptions
        .filter((error) => error.text.startsWith("Uncaught (in promise)"))
        .map((error) => ({
            text: error.text,
            description: error.remote_object?.description ?? "",
        })),
);

export const noUnhandledPromiseRejections = always(() =>
    unhandledPromiseRejections.current.every(
        (error) =>
            error.text ===
                "Uncaught (in promise) Error: Authentication credentials were not provided" ||
            (error.text === "Uncaught (in promise)" &&
                [
                    "Error: Authentication credentials were not provided",
                    "FirebaseError: Firebase: Error (auth/network-request-failed).",
                    "FirebaseError: Firebase: Error (auth/cancelled-popup-request).",
                    "FirebaseError: Firebase: Error (auth/popup-blocked).",
                ].includes(error.description.split("\n")[0] ?? "")),
    ),
);

const appRendered = extract(
    (state) => (state.document.querySelector("#root")?.childElementCount ?? 0) > 0,
);
const loginVisible = extract((state) => !!state.document.querySelector(".login"));

export const appLoads = eventually(() => appRendered.current).within(30, "seconds");

export const waitForApp = actions(() => (appRendered.current ? [] : ["Wait"]));

export const exploration = defaultActions.filter((action) => {
    if (typeof action === "string") {
        return true;
    }
    if ("PressKey" in action && loginVisible.current && action.PressKey.code === 13) {
        return false;
    }
    const click =
        "Click" in action ? action.Click : "DoubleClick" in action ? action.DoubleClick : null;
    if (!click) {
        return true;
    }
    const fingerprint = click.fingerprint;
    return ![fingerprint.textContent, fingerprint.accessibleName].some(
        (label) =>
            label != null &&
            /^(Login|Sign up|Google|GitHub|Login with Google|Login with GitHub|Log out)$/i.test(
                label.trim(),
            ),
    );
});
