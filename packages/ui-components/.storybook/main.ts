import { defineMain } from "storybook-solidjs-vite";

export default defineMain({
    core: {
        disableTelemetry: true,
        disableWhatsNewNotifications: true,
    },
    framework: {
        name: "storybook-solidjs-vite",
        options: {},
    },
    addons: [
        "@storybook/addon-onboarding",
        "@storybook/addon-docs",
        "@storybook/addon-a11y",
        "@storybook/addon-links",
        "@storybook/addon-vitest",
    ],
    stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx|mdx)"],
    staticDirs: ["./static"],
});
