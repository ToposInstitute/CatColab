import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "./vite.config.ts";

// This config is used only for database dump tests (*.db-dump-test.ts) in CI.
// It extends the base vite config but overrides the test include pattern
// to only run database dump tests.
export default mergeConfig(
    baseConfig,
    defineConfig({
        test: {
            include: ["**/*.db-dump-test.ts"],
        },
    }),
);
