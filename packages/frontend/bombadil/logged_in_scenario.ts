import { eventually } from "@antithesishq/bombadil";
import { actions, extract, registerCustomAction } from "@antithesishq/bombadil/browser";

import { exploration } from "./shared_spec.ts";

export function loggedInScenario(email: string, password: string) {
    const allowedLinks = extract((state) =>
        Array.from(state.document.querySelectorAll<HTMLAnchorElement>("a[href]"))
            .filter(
                (link) =>
                    link.origin === state.window.location.origin &&
                    !/^\/(help|dev)(\/|$)/.test(link.pathname),
            )
            .flatMap((link) => [link.href, link.getAttribute("href") ?? ""]),
    );
    const authenticated = extract(
        (state) =>
            state.window.sessionStorage.getItem("catcolab-bombadil-authenticated") === "true",
    );

    const login = registerCustomAction("loginWithEmail", async (document, window) => {
        const deadline = Date.now() + 30_000;
        async function waitFor<T>(find: () => T | null | undefined | false): Promise<T> {
            while (Date.now() < deadline) {
                const result = find();
                if (result) {
                    return result;
                }
                await new Promise((resolve) => window.setTimeout(resolve, 100));
            }
            throw new Error("Bombadil login timed out; check the test account and backend");
        }

        await waitFor(() => {
            if (document.querySelector(".login")) {
                return true;
            }
            const openLogin = Array.from(
                document.querySelectorAll<HTMLButtonElement>("button"),
            ).find((button) => button.textContent?.trim() === "Log in or sign up");
            openLogin?.click();
            return !!document.querySelector(".login");
        });

        const form = await waitFor(() => document.querySelector<HTMLFormElement>(".login form"));
        const emailInput = form.querySelector<HTMLInputElement>('input[type="email"]');
        const passwordInput = form.querySelector<HTMLInputElement>('input[type="password"]');
        const submit = form.querySelector<HTMLButtonElement>('button[value="sign-in"]');
        if (!emailInput || !passwordInput || !submit) {
            throw new Error("Bombadil could not find the email/password login controls");
        }
        for (const [input, value] of [
            [emailInput, email],
            [passwordInput, password],
        ] as const) {
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        form.requestSubmit(submit);

        await waitFor(() => {
            if (form.querySelector(".error")) {
                throw new Error("Bombadil email/password login failed");
            }
            return Array.from(document.querySelectorAll(".quick-actions button")).some(
                (button) => button.textContent?.trim() === "My documents",
            );
        });
        window.sessionStorage.setItem("catcolab-bombadil-authenticated", "true");
    });

    return {
        loginActions: actions(() => (authenticated.current ? [] : [login()])),
        loginCompletes: eventually(() => authenticated.current).within(40, "seconds"),
        nextActions: exploration
            .filter((action) => {
                if (typeof action === "string") {
                    return true;
                }
                const click =
                    "Click" in action
                        ? action.Click
                        : "DoubleClick" in action
                          ? action.DoubleClick
                          : null;
                const href = click?.fingerprint.href;
                if (!href) {
                    return true;
                }
                return allowedLinks.current.includes(href);
            })
            .when(() => authenticated.current),
    };
}
