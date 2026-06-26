import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dependencyFields = ["dependencies", "devDependencies", "peerDependencies"] as const;

type DependencyField = (typeof dependencyFields)[number];

type PackageJson = {
    name?: string;
} & Partial<Record<DependencyField, Record<string, string>>>;

/**
 * Dedupe dependencies from linked monorepo packages, recursively.
 *
 * This prevents linked packages from loading separate framework/runtime
 * copies (e.g. Solid.js, see https://github.com/solidjs/solid/issues/1472).
 *
 * - The recursive crawl through `link:`/`file:`/`workspace:` edges is used only
 *   to *discover* which package names matter; the final dedupe list is
 *   intersected with the consumer package's own direct dependencies so that
 *   packages the consumer doesn't import are never forced to a single copy.
 * - When the same dependency appears with different version ranges across the
 *   crawled packages, the plugin throws to fail the build.
 */
export function monorepoDedupe(): Plugin {
    let intersectingDeps: string[] = [];
    let isBuild = false;
    return {
        name: "@catcolab-dev-tools/vite-plugin-monorepo-dedupe",
        // Use `config()` (not `configResolved()`) so the dedupe list is part of
        // the user config Vite sees *before* it constructs its resolver.
        config(_userConfig, env) {
            // npm scripts invoke vite from the package directory, so cwd is the
            // consumer package root.
            const packageDir = process.cwd();
            intersectingDeps = getIntersectingDeps(packageDir);
            isBuild = env.command === "build";
            return {
                resolve: {
                    dedupe: intersectingDeps,
                },
            };
        },
        generateBundle(_options, bundle) {
            // Only enforce during `vite build`. Skip dev server and vitest, which
            // have their own resolution graphs and may legitimately surface
            // multiple install roots for test-only modules.
            if (!isBuild) {
                return;
            }
            const duplicates = findDuplicateInstallRoots(bundle, new Set(intersectingDeps));
            if (duplicates.length === 0) {
                return;
            }
            const formatted = duplicates
                .map(
                    ({ name, roots }) =>
                        `  - ${name}:\n${roots.map((r) => `      ${r}`).join("\n")}`,
                )
                .join("\n");
            this.error({
                message:
                    "[@catcolab-dev-tools/vite-plugin-monorepo-dedupe] dependencies bundled " +
                    `from multiple install roots:\n${formatted}\n` +
                    "This usually indicates that `resolve.dedupe` failed to collapse a linked " +
                    "workspace dependency into a single copy. See " +
                    "https://github.com/solidjs/solid/issues/1472 for one common cause.",
            });
        },
    };
}

type DuplicateReport = { name: string; roots: string[] };

/**
 * Inspect every emitted chunk's module ids and group them by the
 * `node_modules/<dep>` install root. If any watched dep is sourced from more
 * than one root, the build has produced duplicate copies of that package.
 */
function findDuplicateInstallRoots(
    bundle: Record<string, unknown>,
    watched: Set<string>,
): DuplicateReport[] {
    const rootsByDep = new Map<string, Set<string>>();

    // Matches the install root (group 1) and dep name (group 2) for a module id
    // such as `/x/node_modules/.pnpm/solid-js@1.9.10/node_modules/solid-js/dist/solid.js`.
    // Picks the *last* `node_modules/<dep>` segment so .pnpm-virtualised paths
    // resolve to the per-version directory rather than the .pnpm root.
    const installRootRegex = /^(.*\/node_modules\/(@[^/]+\/[^/]+|[^/]+))(?:\/|$)/;

    for (const chunk of Object.values(bundle)) {
        if (
            chunk === null ||
            typeof chunk !== "object" ||
            !("modules" in chunk) ||
            chunk.modules === null ||
            typeof chunk.modules !== "object"
        ) {
            continue;
        }
        for (const id of Object.keys(chunk.modules as Record<string, unknown>)) {
            // Find the *last* node_modules/<dep> segment.
            const lastIdx = id.lastIndexOf("/node_modules/");
            if (lastIdx === -1) {
                continue;
            }
            const tail = id.slice(lastIdx);
            const match = tail.match(installRootRegex);
            if (match === null) {
                throw new Error(
                    "[@catcolab-dev-tools/vite-plugin-monorepo-dedupe] could not parse " +
                        `install root from module id: ${id}`,
                );
            }
            const installRootSuffix = match[1];
            const depName = match[2];
            if (installRootSuffix === undefined || depName === undefined) {
                throw new Error(
                    "[@catcolab-dev-tools/vite-plugin-monorepo-dedupe] install-root regex " +
                        `matched without capture groups for module id: ${id}`,
                );
            }
            if (!watched.has(depName)) {
                continue;
            }
            const installRoot = id.slice(0, lastIdx) + installRootSuffix;
            let roots = rootsByDep.get(depName);
            if (roots === undefined) {
                roots = new Set();
                rootsByDep.set(depName, roots);
            }
            roots.add(installRoot);
        }
    }

    const duplicates: DuplicateReport[] = [];
    for (const [name, roots] of rootsByDep) {
        if (roots.size > 1) {
            duplicates.push({ name, roots: Array.from(roots).toSorted() });
        }
    }
    duplicates.sort((a, b) => a.name.localeCompare(b.name));
    return duplicates;
}

function getIntersectingDeps(packageDir: string): string[] {
    const packageByName = getWorkspacePackages();
    const dedupeVersions = new Map<string, Set<string>>();
    const visitedPackages = new Set<string>();

    const consumerPackage = readPackageJson(resolve(packageDir, "package.json"));
    const consumerDepNames = new Set(getPackageDependencies(consumerPackage).map(([name]) => name));

    addLinkedPackageDependencies(packageDir);

    throwOnVersionConflicts(dedupeVersions);

    const crawledDepNames = new Set(dedupeVersions.keys());
    // @ts-expect-error: Set.prototype.intersection exists in our Node target
    const dedupeNames: Set<string> = crawledDepNames.intersection(consumerDepNames);

    return Array.from(dedupeNames).toSorted();

    function addLinkedPackageDependencies(currentPackageDir: string) {
        const currentPackage = readPackageJson(resolve(currentPackageDir, "package.json"));

        for (const [dependencyName, dependencyVersion] of getPackageDependencies(currentPackage)) {
            const linkedPackageDir = getLinkedPackageDir(
                currentPackageDir,
                packageByName,
                dependencyName,
                dependencyVersion,
            );

            if (linkedPackageDir === undefined) {
                continue;
            }

            if (addPackageDependencyNames(linkedPackageDir)) {
                addLinkedPackageDependencies(linkedPackageDir);
            }
        }
    }

    function addPackageDependencyNames(linkedPackageDir: string): boolean {
        const realPackageDir = resolve(linkedPackageDir);
        const packageJsonPath = resolve(realPackageDir, "package.json");
        if (!existsSync(packageJsonPath)) {
            return false;
        }

        if (visitedPackages.has(realPackageDir)) {
            return false;
        }
        visitedPackages.add(realPackageDir);

        for (const [dependencyName, dependencyVersion] of getPackageDependencies(
            readPackageJson(packageJsonPath),
        )) {
            let versions = dedupeVersions.get(dependencyName);
            if (versions === undefined) {
                versions = new Set();
                dedupeVersions.set(dependencyName, versions);
            }
            versions.add(dependencyVersion);
        }

        return true;
    }
}

function throwOnVersionConflicts(dedupeVersions: Map<string, Set<string>>): void {
    const conflicts: string[] = [];
    for (const [name, versions] of dedupeVersions) {
        const realVersions = Array.from(versions).filter((v) => !isLinkSpecifier(v));
        if (realVersions.length > 1) {
            conflicts.push(`  - ${name}: ${realVersions.join(", ")}`);
        }
    }
    if (conflicts.length > 0) {
        throw new Error(
            "[@catcolab-dev-tools/vite-plugin-monorepo-dedupe] conflicting version ranges across linked workspace " +
                `packages:\n${conflicts.join("\n")}\n` +
                "Align the versions before deduping.",
        );
    }
}

function isLinkSpecifier(version: string): boolean {
    return (
        version.startsWith("link:") ||
        version.startsWith("file:") ||
        version.startsWith("workspace:")
    );
}

function getWorkspacePackages(): Map<string, string> {
    const packages = new Map<string, string>();

    for (const workspaceRoot of ["packages", "tools"]) {
        const workspaceDir = resolve(repoRoot, workspaceRoot);
        if (!existsSync(workspaceDir)) {
            continue;
        }

        for (const packageName of readdirSync(workspaceDir)) {
            const packageDir = resolve(workspaceDir, packageName);
            const packageJsonPath = resolve(packageDir, "package.json");
            if (!existsSync(packageJsonPath)) {
                continue;
            }

            const packageJson = readPackageJson(packageJsonPath);
            if (packageJson.name !== undefined) {
                packages.set(packageJson.name, packageDir);
            }
        }
    }

    return packages;
}

function getPackageDependencies(packageJson: PackageJson): [string, string][] {
    return dependencyFields.flatMap((field) => Object.entries(packageJson[field] ?? {}));
}

function getLinkedPackageDir(
    packageDir: string,
    packageByName: Map<string, string>,
    dependencyName: string,
    dependencyVersion: string,
): string | undefined {
    if (dependencyVersion.startsWith("link:") || dependencyVersion.startsWith("file:")) {
        return resolve(packageDir, dependencyVersion.replace(/^(link|file):/, ""));
    }

    if (dependencyVersion.startsWith("workspace:")) {
        return packageByName.get(dependencyName);
    }

    return undefined;
}

function readPackageJson(packageJsonPath: string): PackageJson {
    return JSON.parse(readFileSync(packageJsonPath, "utf-8"));
}
