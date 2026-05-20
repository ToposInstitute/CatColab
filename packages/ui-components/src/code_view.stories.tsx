import { bundledLanguagesInfo, bundledThemesInfo } from "shiki";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { CodeView } from "./code_view";

const langs = bundledLanguagesInfo.map((l) => l.id);
const themes = bundledThemesInfo.map((t) => t.id);

const meta: Meta<typeof CodeView> = {
    title: "Misc/CodeView",
    component: CodeView,
    tags: ["autodocs"],
    argTypes: {
        text: {
            control: "text",
            description: "The source code to display",
        },
        lang: {
            control: "select",
            options: langs,
            description: "The lang for syntax highlighting",
        },
        theme: {
            control: "select",
            options: themes,
            description: "The theme for syntax highlighting",
        },
    },
};

export default meta;
type Story = StoryObj<typeof CodeView>;

export const SQL: Story = {
    // excluding from autodocs and dev seems to be the way to have this
    // component as the first thing in the docs and only there
    tags: ["!autodocs", "!dev"],
    args: {
        lang: "sql",
        text: `SELECT p.name, COUNT(o.id) AS order_count
FROM products p
LEFT JOIN orders o ON o.product_id = p.id
WHERE p.active = TRUE
GROUP BY p.name
ORDER BY order_count DESC;`,
    },
};

export const Typescript: Story = {
    args: {
        lang: "typescript",
        text: `function greet(name: string): string {
    return \`Hello, \${name}!\`;
}`,
    },
};

const sampleTs = `function greet(name: string): string {
    return \`Hello, \${name}!\`;
}`;

export const Themes: Story = {
    render: () => (
        <div style={{ display: "flex", "flex-direction": "column", gap: "1rem" }}>
            <For
                each={
                    [
                        "min-light",
                        "min-dark",
                        "github-light",
                        "github-dark",
                        "dracula",
                        "nord",
                        "solarized-light",
                        "solarized-dark",
                        "one-dark-pro",
                        "monokai",
                    ] as const
                }
            >
                {(theme) => (
                    <div>
                        <h4 style={{ margin: "0 0 0.25rem 0" }}>{theme}</h4>
                        <CodeView lang="typescript" theme={theme} text={sampleTs} />
                    </div>
                )}
            </For>
        </div>
    ),
};
