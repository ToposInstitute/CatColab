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
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transformAsync } from "@babel/core";
import presetTypescript from "@babel/preset-typescript";
import presetSolid from "babel-preset-solid";

import type { MaterialisedSample } from "./check.ts";

const domRegisterPath = fileURLToPath(new URL("./dom-register.ts", import.meta.url));

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

    const compiled = `import ${JSON.stringify(domRegisterPath)};\n${result.code}\n`;
    const outPath = m.filePath.replace(/\.tsx$/, ".compiled.mjs");
    writeFileSync(outPath, compiled, "utf8");
    return outPath;
}
