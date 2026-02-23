import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "./vite.config.ts";

// This config is used only for staging tests (*.staging-test.ts) in CI.
// It extends the base vite config but overrides the test include pattern
// to only run staging tests.
export default mergeConfig(
    baseConfig,
    defineConfig({
        test: {
            include: ["**/*.staging-test.ts"],
            environment: "node",
        },
    }),
);
