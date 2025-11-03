import type { Preview } from "storybook-solidjs-vite";

import "./preview.css";

const preview: Preview = {
    parameters: {
        // automatically create action args for all props that start with 'on'
        actions: {
            argTypesRegex: "^on.*",
        },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        a11y: {
            // 'todo' - show a11y violations in the test UI only
            // 'error' - fail CI on a11y violations
            // 'off' - skip a11y checks entirely
            test: "todo",
        },
    },
    // All components will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
    tags: ["autodocs"],
};

export default preview;
