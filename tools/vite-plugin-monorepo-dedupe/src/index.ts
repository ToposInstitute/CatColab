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
    return {
        name: "@catcolab-dev-tools/vite-plugin-monorepo-dedupe",
        configResolved(config) {
            const packageDir =
                config.configFile === undefined ? process.cwd() : dirname(config.configFile);
            config.resolve.dedupe = getRecursiveMonorepoDependencies(packageDir);
        },
    };
}

function getRecursiveMonorepoDependencies(packageDir: string): string[] {
    const packageByName = getWorkspacePackages();
    const dedupeVersions = new Map<string, Set<string>>();
    const visitedPackages = new Set<string>();

    const consumerPackage = readPackageJson(resolve(packageDir, "package.json"));
    const consumerDepNames = new Set(getPackageDependencies(consumerPackage).map(([name]) => name));

    addLinkedPackageDependencies(packageDir);

    throwOnVersionConflicts(dedupeVersions);

    return Array.from(dedupeVersions.keys())
        .filter((name) => consumerDepNames.has(name))
        .sort();

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
