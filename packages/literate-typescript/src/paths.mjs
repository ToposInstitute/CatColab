/**
 * Helpers for locating the consuming package root, its tsconfig, and the .lts
 * output directory.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve, parse as parsePath, basename } from "node:path";

/**
 * Find the nearest ancestor directory of `start` that contains a `package.json`.
 *
 * @param {string} start  Absolute path of a file or directory.
 * @returns {string}      Absolute path to the package root.
 */
export function findPackageRoot(start) {
    let dir = resolve(start);
    if (existsSync(dir) && parsePath(dir).ext !== "") {
        dir = dirname(dir);
    }
    while (true) {
        if (existsSync(join(dir, "package.json"))) return dir;
        const parent = dirname(dir);
        if (parent === dir) {
            throw new Error(
                `Could not find package.json above ${start}; literate-typescript requires the markdown file to live inside a package.`,
            );
        }
        dir = parent;
    }
}

/**
 * Pick the tsconfig to use for type-checking samples. Prefers `tsconfig.lts.json`
 * in the package root over `tsconfig.json`.
 *
 * @param {string} pkgRoot
 * @returns {string}
 */
export function findTsConfig(pkgRoot) {
    const preferred = join(pkgRoot, "tsconfig.lts.json");
    if (existsSync(preferred)) return preferred;
    const fallback = join(pkgRoot, "tsconfig.json");
    if (existsSync(fallback)) return fallback;
    throw new Error(
        `Neither tsconfig.lts.json nor tsconfig.json found in ${pkgRoot}.`,
    );
}

/**
 * Compute the per-markdown slug: filename with `.lts.md` or `.md` stripped.
 *
 * @param {string} mdPath
 * @returns {string}
 */
export function markdownSlug(mdPath) {
    const base = basename(mdPath);
    return base
        .replace(/\.lts\.md$/i, "")
        .replace(/\.md$/i, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "-");
}

/**
 * Resolve and (re-)create the per-markdown output directory under `<pkgRoot>/.lts/`.
 *
 * @param {string} pkgRoot
 * @param {string} slug
 * @returns {string}      Absolute path to the cleared output directory.
 */
export function prepareOutDir(pkgRoot, slug) {
    const dir = join(pkgRoot, ".lts", slug);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    return dir;
}
