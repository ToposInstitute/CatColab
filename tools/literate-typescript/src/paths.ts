/**
 * Helpers for locating the consuming package root, its tsconfig, and the
 * temporary sample output directory.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { basename, dirname, join, parse as parsePath, resolve } from "node:path";

/**
 * Find the nearest ancestor directory of `start` that contains a `package.json`.
 *
 * @param start Absolute path of a file or directory.
 * @returns Absolute path to the package root.
 */
export function findPackageRoot(start: string): string {
    let dir = resolve(start);
    if (existsSync(dir) && parsePath(dir).ext !== "") {
        dir = dirname(dir);
    }
    while (true) {
        if (existsSync(join(dir, "package.json"))) {
            return dir;
        }
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
 */
export function findTsConfig(pkgRoot: string): string {
    const preferred = join(pkgRoot, "tsconfig.lts.json");
    if (existsSync(preferred)) {
        return preferred;
    }
    const fallback = join(pkgRoot, "tsconfig.json");
    if (existsSync(fallback)) {
        return fallback;
    }
    throw new Error(`Neither tsconfig.lts.json nor tsconfig.json found in ${pkgRoot}.`);
}

/**
 * Compute the per-markdown slug: filename with `.lts.md` or `.md` stripped.
 */
export function markdownSlug(mdPath: string): string {
    const base = basename(mdPath);
    return base
        .replace(/\.lts\.md$/i, "")
        .replace(/\.md$/i, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "-");
}

/**
 * Create a per-markdown output directory in the package root.
 *
 * Keeping samples inside the package preserves package self-resolution and
 * normal `node_modules` lookup without writing to the old `.lts` directory.
 *
 * @returns Absolute path to the output directory.
 */
export function prepareOutDir(pkgRoot: string, slug: string): string {
    return mkdtempSync(join(pkgRoot, `.literate-typescript-${slug}-`));
}

/**
 * Remove a temporary output directory created by `prepareOutDir`.
 */
export function cleanupOutDir(dir: string): void {
    rmSync(dir, { recursive: true, force: true });
}
