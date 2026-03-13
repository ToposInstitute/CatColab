/**
 * Scans all non-deleted Automerge documents in the production database for
 * `migrateDocument` failures. Loads binary chunks directly from the `storage`
 * table (no WebSocket needed), reconstructs each document, and attempts WASM
 * migration.
 *
 * Usage:
 *   node scripts/scan_migration_failures.mjs
 *
 * Requires:
 *   - A local PostgreSQL database with the production dump loaded.
 *   - DATABASE_URL env var, or defaults to the local dev connection string.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline";
import * as Automerge from "@automerge/automerge";

import { migrateDocument } from "catlog-wasm";

const DATABASE_URL =
    process.env.DATABASE_URL || "postgres://catcolab:password@localhost:5432/catcolab";

function psql(sql) {
    return execSync(`psql "${DATABASE_URL}" -At -c "${sql.replace(/"/g, '\\"')}"`, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 512,
    });
}

// Step 1: Get ref_id -> doc_id mapping for all non-deleted refs
console.log("Loading ref -> doc_id mapping...");
const refLines = psql(`
  select r.id || '|' || s.doc_id
  from refs r
  join snapshots s on s.id = r.head
  where r.deleted_at is null
`)
    .trim()
    .split("\n")
    .filter(Boolean);

const refToDocId = new Map();
const docIdToRef = new Map();
for (const line of refLines) {
    const [refId, docId] = line.split("|");
    refToDocId.set(refId, docId);
    docIdToRef.set(docId, refId);
}
console.log(`Found ${refToDocId.size} non-deleted refs.`);

// Step 2: Load all Automerge chunks from storage
console.log("Loading Automerge chunks from storage table...");
const docChunks = new Map(); // docId -> { snapshots: Buffer[], incrementals: Buffer[] }

const chunkOutput = psql(`
  select s.doc_id || '|' || st.key[2] || '|' || translate(encode(st.data, 'base64'), chr(10), '')
  from refs r
  join snapshots s on s.id = r.head
  join storage st on st.key[1] = s.doc_id and st.key[2] in ('snapshot','incremental')
  where r.deleted_at is null
  order by s.doc_id, st.key[2] desc
`);

for (const line of chunkOutput.split("\n")) {
    if (!line) {
        continue;
    }
    const pipeIdx = line.indexOf("|");
    const pipeIdx2 = line.indexOf("|", pipeIdx + 1);
    const docId = line.slice(0, pipeIdx);
    const type = line.slice(pipeIdx + 1, pipeIdx2);
    const b64 = line.slice(pipeIdx2 + 1);
    const buf = Buffer.from(b64, "base64");

    if (!docChunks.has(docId)) {
        docChunks.set(docId, { snapshots: [], incrementals: [] });
    }
    const entry = docChunks.get(docId);
    if (type === "snapshot") {
        entry.snapshots.push(buf);
    } else {
        entry.incrementals.push(buf);
    }
}
console.log(`Loaded chunks for ${docChunks.size} docs.`);

// Step 3: Reconstruct and test each document
const fails = [];
let checked = 0;
let skipped = 0;

for (const [docId, { snapshots, incrementals }] of docChunks) {
    if (snapshots.length === 0) {
        skipped++;
        continue;
    }

    let jsDoc = null;
    try {
        // Load the largest snapshot first
        snapshots.sort((a, b) => b.length - a.length);
        let doc = Automerge.load(new Uint8Array(snapshots[0]));

        // Apply remaining snapshots as changes
        for (let i = 1; i < snapshots.length; i++) {
            [doc] = Automerge.applyChanges(doc, [new Uint8Array(snapshots[i])]);
        }
        // Apply incremental changes
        for (const inc of incrementals) {
            [doc] = Automerge.applyChanges(doc, [new Uint8Array(inc)]);
        }

        jsDoc = Automerge.toJS(doc);
        migrateDocument(jsDoc);
        checked++;
    } catch (e) {
        const refId = docIdToRef.get(docId) || "unknown";
        const parentRef = jsDoc?.analysisOf?._id ?? null;
        fails.push({ refId, docId, parentRef, err: String(e).slice(0, 200) });
        checked++;
    }

    if (checked % 1000 === 0) {
        console.log(`progress: ${checked} checked, ${fails.length} fails`);
    }
}

console.log(`\nDone. checked=${checked}, skipped=${skipped}, total fails=${fails.length}`);

// Categorize failures
const tagFails = fails.filter((f) => f.err.includes("missing field `tag`"));
const theoryFails = fails.filter((f) => f.err.includes("missing field `theory`"));
const otherFails = fails.filter(
    (f) => !f.err.includes("missing field `tag`") && !f.err.includes("missing field `theory`"),
);

function formatFail(f, includeErr = false) {
    const parent = f.parentRef ? `  (child of ${f.parentRef})` : "";
    const err = includeErr ? `\t${f.err}` : "";
    return `${f.refId}${parent}${err}`;
}

console.log(`\n--- missing field \`tag\` (${tagFails.length}) ---`);
for (const f of tagFails) {
    console.log(formatFail(f));
}

console.log(`\n--- missing field \`theory\` (${theoryFails.length}) ---`);
for (const f of theoryFails) {
    console.log(formatFail(f));
}

console.log(`\n--- other errors (${otherFails.length}) ---`);
for (const f of otherFails) {
    console.log(formatFail(f, true));
}
