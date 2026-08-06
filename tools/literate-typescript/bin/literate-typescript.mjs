#!/usr/bin/env node
/**
 * Bin shim: load the TypeScript CLI through tsx so the tool can be invoked
 * directly via the package's `bin` entry without a build step.
 */

import { tsImport } from "tsx/esm/api";

await tsImport("../src/cli.ts", import.meta.url);
