import { spawn } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createTestAccount, type TestAccount } from "./test_account.ts";

type BrowserResult = { status?: number | null; error?: Error; signal?: NodeJS.Signals | null };
type RunBrowser = (
    command: string,
    args: string[],
    options: { stdio: "inherit"; env: NodeJS.ProcessEnv },
) => BrowserResult | Promise<BrowserResult>;

const runBrowser: RunBrowser = (command, args, options) =>
    new Promise((resolve) => {
        const child = spawn(command, args, options);
        let interrupted: NodeJS.Signals | undefined;
        const interrupt = (signal: NodeJS.Signals) => {
            interrupted = signal;
            child.kill(signal);
        };
        const onInterrupt = () => interrupt("SIGINT");
        const onTerminate = () => interrupt("SIGTERM");
        const finish = (result: BrowserResult) => {
            process.removeListener("SIGINT", onInterrupt);
            process.removeListener("SIGTERM", onTerminate);
            resolve({ ...result, signal: interrupted ?? result.signal });
        };
        process.once("SIGINT", onInterrupt);
        process.once("SIGTERM", onTerminate);
        child.once("error", (error) => finish({ error }));
        child.once("exit", (status, signal) => finish({ status, signal }));
    });

type LoginOptions = {
    origin: string;
    options?: string[];
    env?: NodeJS.ProcessEnv;
    run?: RunBrowser;
    createAccount?: typeof createTestAccount;
};

export async function runLoggedIn({
    origin,
    options = [],
    env = process.env,
    run = runBrowser,
    createAccount = createTestAccount,
}: LoginOptions) {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("Expected an HTTP(S) origin without credentials");
    }
    const directory = await mkdtemp(join(tmpdir(), "catcolab-bombadil-"));
    let account: TestAccount | undefined;
    try {
        account = await createAccount(env, url);
        const authenticatedSpec = join(directory, "logged_in_spec.ts");
        for (const name of ["logged_in_spec.ts", "logged_in_scenario.ts", "shared_spec.ts"]) {
            await copyFile(new URL(name, import.meta.url), join(directory, name));
        }
        await writeFile(
            join(directory, "logged_in_credentials.json"),
            JSON.stringify({ email: account.email, password: account.password }),
            { mode: 0o600 },
        );
        const result = await run(
            "bombadil",
            ["browser", "test", new URL("/", url).href, authenticatedSpec, ...options],
            { stdio: "inherit", env },
        );
        if (result.error) {
            throw result.error;
        }
        if (result.signal) {
            throw new Error(`Bombadil interrupted by ${result.signal}`);
        }
        return result.status ?? 1;
    } finally {
        try {
            await account?.dispose();
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = await runLoggedIn({
            origin: process.argv[2] ?? "http://localhost:5173",
            options: process.argv.slice(3),
        });
    } catch (error) {
        console.error(error instanceof Error ? error.message : "Bombadil login setup failed");
        process.exitCode = 1;
    }
}
