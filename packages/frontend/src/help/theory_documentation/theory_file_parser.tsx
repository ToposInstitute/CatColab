import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { For, type JSX } from "solid-js";
import type { Plugin } from "vite";

export const documentationFileParser = (): Plugin => {
    return {
        name: "documentation-file-parser",
        async buildStart() {
            processFiles();
        },

        configureServer(server) {
            server.watcher.on("change", (filePath) => {
                if (filePath.includes("./theory_documentation")) {
                    processFiles();
                }
            });
        },
    };
};

export const theoryDocumentationPosts: { slug: string }[] = [];

export const processFiles = () => {
    const outputFile = resolve("./theory_documentation/theory_documentation_files.json");
    const theoryDocumentationDir = resolve("/theory_documentation");
    const files = readdirSync(theoryDocumentationDir);
    const theoryDocumentationPosts = files
        .filter(
            (file) =>
                statSync(join(theoryDocumentationDir, file)).isFile() && file.endsWith(".mdx"),
        )
        .map((file) => ({ slug: file.replace(".mdx", "") }));
    writeFileSync(outputFile, JSON.stringify(theoryDocumentationPosts, null, 2), "utf-8");
};

export function theoryDocumentationDisplay(): JSX.Element {
    return (
        <For each={theoryDocumentationPosts}>
            {(theory_post) => (
                <a href={`/theory_documentation/${theory_post.slug}.mdx`}>{theory_post.slug}</a>
            )}
        </For>
    );
}
