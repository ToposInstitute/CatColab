import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "./vite.config";

export default mergeConfig(
    baseConfig,
    defineConfig({
        test: {
            include: ["test/corpus/**/*.db-dump-test.ts"],
            testTimeout: 600_000,
        },
    }),
);
