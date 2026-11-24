import { always, eventually } from "@antithesishq/bombadil";
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

    const loginState = extract((state) => ({
        formVisible: !!state.document.querySelector(".login form"),
        submitted:
            state.window.sessionStorage.getItem("catcolab-bombadil-login-submitted") === "true",
        errors: Array.from(state.document.querySelectorAll(".login .error")).map(
            (error) => error.textContent ?? "",
        ),
        complete: Array.from(state.document.querySelectorAll(".quick-actions button")).some(
            (button) => button.textContent?.trim() === "My documents",
        ),
    }));
    const openLogin = registerCustomAction("openEmailLogin", async (document) => {
        Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
            .find((button) => button.textContent?.trim() === "Log in or sign up")
            ?.click();
    });
    const login = registerCustomAction("loginWithEmail", async (document, window) => {
        const form = document.querySelector<HTMLFormElement>(".login form");
        if (!form) {
            throw new Error("Bombadil could not find the login form");
        }
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
        window.sessionStorage.setItem("catcolab-bombadil-login-submitted", "true");
        form.requestSubmit(submit);
    });
    const finishLogin = registerCustomAction("finishEmailLogin", async (_document, window) => {
        window.sessionStorage.setItem("catcolab-bombadil-authenticated", "true");
    });

    return {
        loginActions: actions(() => {
            if (authenticated.current) {
                return [];
            }
            if (loginState.current.complete) {
                return [finishLogin()];
            }
            if (loginState.current.submitted) {
                return ["Wait"];
            }
            return [loginState.current.formVisible ? login() : openLogin()];
        }),
        loginCompletes: eventually(() => authenticated.current).within(40, "seconds"),
        loginHasNoErrors: always(
            () => authenticated.current || loginState.current.errors.length === 0,
        ),
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
