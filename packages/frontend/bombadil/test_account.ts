import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { build_client, http } from "@qubit-rs/client";
import { deleteApp, type FirebaseOptions, initializeApp } from "firebase/app";
import {
    createUserWithEmailAndPassword,
    deleteUser,
    EmailAuthProvider,
    getAuth,
    reauthenticateWithCredential,
    type User,
} from "firebase/auth";

import type { QubitServer } from "catcolab-api";

export type TestAccount = {
    email: string;
    password: string;
    dispose: () => Promise<void>;
};

export async function firebaseOptions(
    env: NodeJS.ProcessEnv,
    origin: URL,
): Promise<FirebaseOptions> {
    let raw = env.VITE_FIREBASE_OPTIONS;
    if (!raw) {
        const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
        if (!local && !env.BOMBADIL_MODE) {
            throw new Error(
                "Set BOMBADIL_MODE or VITE_FIREBASE_OPTIONS explicitly for a remote target",
            );
        }
        const mode = env.BOMBADIL_MODE ?? "development";
        if (!["development", "staging", "production"].includes(mode)) {
            throw new Error("BOMBADIL_MODE must be development, staging, or production");
        }
        const config: Record<string, string> = {};
        for (const name of [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`]) {
            try {
                Object.assign(
                    config,
                    parseEnv(await readFile(new URL(`../${name}`, import.meta.url), "utf8")),
                );
            } catch (error) {
                if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
                    throw error;
                }
            }
        }
        raw = config.VITE_FIREBASE_OPTIONS;
    }
    if (!raw) {
        throw new Error("Firebase configuration is missing VITE_FIREBASE_OPTIONS");
    }
    const options: unknown = JSON.parse(raw);
    if (
        !options ||
        typeof options !== "object" ||
        !("apiKey" in options) ||
        typeof options.apiKey !== "string" ||
        !options.apiKey
    ) {
        throw new Error("VITE_FIREBASE_OPTIONS must contain a Firebase API key");
    }
    return options as FirebaseOptions;
}

export async function createTestAccount(env: NodeJS.ProcessEnv, origin: URL): Promise<TestAccount> {
    const app = initializeApp(await firebaseOptions(env, origin), `bombadil-${randomUUID()}`);
    let user: User | undefined;
    try {
        const email = `test-bombadil-${randomUUID()}@catcolab.org`;
        const password = randomUUID();
        const credential = await createUserWithEmailAndPassword(getAuth(app), email, password);
        user = credential.user;
        const accountUser = user;
        const serverUrl = new URL(env.VITE_SERVER_URL ?? "/api", origin).href.replace(/\/$/, "");
        const token = await user.getIdToken();
        const rpc = build_client<QubitServer>(
            http(`${serverUrl}/rpc`, {
                fetch: (input, init) => {
                    const headers = new Headers(init?.headers);
                    headers.set("Authorization", `Bearer ${token}`);
                    return fetch(input, { ...init, headers, signal: AbortSignal.timeout(30_000) });
                },
            }),
        );
        const result = await rpc.sign_up_or_sign_in.mutate();
        if (result.tag !== "Ok") {
            throw new Error(`Bombadil backend account setup failed: ${result.message}`);
        }
        return {
            email,
            password,
            async dispose() {
                try {
                    await reauthenticateWithCredential(
                        accountUser,
                        EmailAuthProvider.credential(email, password),
                    );
                    await deleteUser(accountUser);
                } finally {
                    await deleteApp(app);
                }
            },
        };
    } catch (error) {
        try {
            if (user) {
                await deleteUser(user);
            }
        } finally {
            await deleteApp(app);
        }
        throw error;
    }
}
