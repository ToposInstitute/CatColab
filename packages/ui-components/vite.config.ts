/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { monorepoDedupe } from "@catcolab-dev-tools/vite-plugin-monorepo-dedupe";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite";

const configDir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
    plugins: [monorepoDedupe()],
    define: {
        "process.env": {},
    },
    test: {
        projects: [
            {
                extends: true,
                plugins: [
                    // The plugin will run tests for the stories defined in your Storybook config
                    // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
                    storybookTest({
                        configDir: path.join(configDir, ".storybook"),
                    }),
                ],
                test: {
                    name: "storybook",
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright(),
                        instances: [
                            {
                                browser: "chromium",
                            },
                        ],
                    },
                    setupFiles: ["./.storybook/vitest.setup.ts"],
                },
            },
        ],
    },
});
