/**
 * Compile tsx samples with Babel using `babel-preset-solid`, the same
 * transform `vite-plugin-solid` applies. This is required because esbuild
 * (and hence the `tsx` CLI runner) only knows React-style JSX transforms,
 * which evaluate reactive expressions eagerly and break Solid's fine-grained
 * reactivity.
 *
 * The compiled output is written next to the materialised sample as
 * `<id>.compiled.mjs`. The `.mjs` extension keeps it outside the consuming
 * package's `.lts/**` TypeScript includes, so it is never type-checked; the
 * original `.tsx` file remains the type-check target.
 *
 * A side-effect import of `dom-register.ts` (absolute path, resolved within
 * this package) is prefixed so happy-dom globals are installed before any
 * Solid code runs.
 *
 * babel-preset-solid appends the `delegateEvents([...])` registration call to
 * the *end* of the module body. In a normal app that is fine: the module fully
 * evaluates (registering delegated listeners on `document`) before any event is
 * dispatched. Our samples, however, run as a flat top-level script that mounts
 * a component and synthesises clicks inline — so a trailing `delegateEvents`
 * call registers the listener *after* the sample already clicked, and delegated
 * handlers (`onClick`) never fire. The {@link hoistDelegateEvents} plugin moves
 * those calls up to just after the import declarations so delegation is active
 * before the sample's imperative code runs, matching bundler/test behaviour.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type PluginObj, transformAsync, types as t } from "@babel/core";
import presetTypescript from "@babel/preset-typescript";
import presetSolid from "babel-preset-solid";

import type { MaterialisedSample } from "./check.ts";

const domRegisterPath = fileURLToPath(new URL("./dom-register.ts", import.meta.url));

/**
 * Babel plugin: hoist top-level `delegateEvents([...])` expression statements to
 * immediately after the last import declaration in the module body. Only bare
 * top-level statements are moved (calls emitted by babel-preset-solid); calls
 * nested inside functions or other scopes are left untouched.
 */
function hoistDelegateEvents(): PluginObj {
    const isDelegateEventsStatement = (node: t.Statement): boolean =>
        t.isExpressionStatement(node) &&
        t.isCallExpression(node.expression) &&
        t.isIdentifier(node.expression.callee) &&
        node.expression.callee.name.endsWith("delegateEvents");

    return {
        name: "hoist-delegate-events",
        visitor: {
            Program(path) {
                const body = path.node.body;
                const hoisted = body.filter(isDelegateEventsStatement);
                if (hoisted.length === 0) {
                    return;
                }
                const remaining = body.filter((node) => !isDelegateEventsStatement(node));
                let lastImport = -1;
                for (let i = 0; i < remaining.length; i++) {
                    if (t.isImportDeclaration(remaining[i]!)) {
                        lastImport = i;
                    }
                }
                remaining.splice(lastImport + 1, 0, ...hoisted);
                path.node.body = remaining;
            },
        },
    };
}

/**
 * Compile a materialised tsx sample to plain JS with Solid's JSX transform.
 *
 * @returns Absolute path to the written `.compiled.mjs` file.
 */
export async function compileTsxSample(m: MaterialisedSample): Promise<string> {
    const result = await transformAsync(m.sample.content, {
        filename: m.filePath,
        babelrc: false,
        configFile: false,
        sourceMaps: false,
        // Presets are passed as imported modules (not names) so Babel does not
        // try to resolve them from the consuming package's directory.
        presets: [
            [presetSolid, { generate: "dom" }],
            [presetTypescript, { isTSX: true, allExtensions: true }],
        ],
    });
    if (result === null || result.code === null || result.code === undefined) {
        throw new Error(`Babel produced no output for ${m.filePath}`);
    }

    // Second pass: run the hoist plugin over the JSX-transformed output. It must
    // run *after* preset-solid (which appends the `delegateEvents` call to the
    // module tail), so it cannot share the first pass — Babel runs plugins
    // before presets, and the call does not exist yet at that point.
    const hoisted = await transformAsync(result.code, {
        filename: m.filePath,
        babelrc: false,
        configFile: false,
        sourceMaps: false,
        plugins: [hoistDelegateEvents],
    });
    if (hoisted === null || hoisted.code === null || hoisted.code === undefined) {
        throw new Error(`Babel produced no output for ${m.filePath}`);
    }

    const compiled = `import ${JSON.stringify(domRegisterPath)};\n${hoisted.code}\n`;
    const outPath = m.filePath.replace(/\.tsx$/, ".compiled.mjs");
    writeFileSync(outPath, compiled, "utf8");
    return outPath;
}
