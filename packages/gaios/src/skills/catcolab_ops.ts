import { Model, Nb } from "catcolab-document-methods";
import type {
    Cell,
    DblTheory,
    ModelJudgment,
    MorDecl,
    MorType,
    Notebook,
    Ob,
    ObDecl,
    ObType,
    Uuid,
} from "catlog-wasm";
import type { Theory } from "../../../frontend/src/theory";

/** The parts of a theory that the operations need. */
export type TheoryInfo = Pick<Theory, "id" | "name" | "description" | "modelTypes"> & {
    theory: Pick<DblTheory, "src" | "tgt" | "dom">;
};

/** The parts of a model document that the operations read and write. */
export type ModelDocLike = {
    name: string;
    theory: string;
    notebook: Notebook<ModelJudgment>;
};

/** Analysis notebook cell content: which analysis, plus its configuration. */
export type AnalysisCellContent = { id: string; content: Record<string, unknown> };

/** The parts of an analysis document that the operations read and write. */
export type AnalysisDocLike = {
    name: string;
    notebook: Notebook<AnalysisCellContent>;
};

/** An edit to a model, as requested by the LLM. */
export type ModelOp =
    | { op: "add-object"; name: string; type: string }
    | { op: "add-morphism"; name?: string; type: string; from: EndRef; to: EndRef }
    | { op: "add-note"; text: string }
    | { op: "rename"; target: string; name: string }
    | { op: "remove"; target: string };

/** An edit to an analysis, as requested by the LLM. */
export type AnalysisOp =
    | { op: "add-analysis"; kind: string }
    | { op: "set-params"; cell: string | number; params: Record<string, unknown> }
    | { op: "remove-analysis"; cell: string | number };

/** Reference to a morphism's domain or codomain: a name, or a list of names
for list-typed ends such as the inputs of a Petri net transition. */
export type EndRef = string | string[];

/** A named object or morphism in a model notebook. */
export type Entity =
    | { kind: "object"; id: Uuid; cellId: Uuid; name: string; decl: ObDecl }
    | { kind: "morphism"; id: Uuid; cellId: Uuid; name: string; decl: MorDecl };

/** Summarizes a model for the LLM: its theory, the types it can use, and its
contents, with every reference shown by name.
 */
export function describeModel(doc: ModelDocLike, theory: TheoryInfo | undefined): string {
    const lines = [`Model "${doc.name || "(untitled)"}"`];
    if (!theory) {
        lines.push(`Theory: ${doc.theory} (unknown — set one with the set-theory op)`);
        return lines.join("\n");
    }
    lines.push(`Theory: ${theory.name} (${theory.id}) — ${theory.description}`);

    lines.push("", "Types:");
    for (const meta of theory.modelTypes) {
        if (meta.tag === "ObType") {
            lines.push(`  ${meta.name} (object) — ${meta.description}`);
        } else {
            const ends = `${obTypeName(theory, sourceType(theory, meta.morType))} → ${obTypeName(
                theory,
                targetType(theory, meta.morType),
            )}`;
            lines.push(`  ${meta.name} (morphism ${ends}) — ${meta.description}`);
        }
    }
    if (theory.modelTypes.length === 0) {
        lines.push("  (none — this theory has no types; set a different theory)");
    }

    const entities = listEntities(doc.notebook);
    const notes = listNotes(doc.notebook);
    if (notes.length > 0) {
        lines.push("", "Notes:", ...notes.map((note) => `  ${note}`));
    }
    lines.push("", "Contents:");
    for (const entity of entities) {
        lines.push(`  ${describeEntity(theory, entities, entity)}`);
    }
    if (entities.length === 0) {
        lines.push("  (empty)");
    }
    return lines.join("\n");
}

/** Applies model edits in order, so later ops can refer to what earlier ones
created. Returns one line per op describing what it did.
 */
export function applyModelOps(doc: ModelDocLike, theory: TheoryInfo, ops: ModelOp[]): string[] {
    return ops.map((op) => applyModelOp(doc, theory, op));
}

/** Summarizes an analysis for the LLM. Configuration that is keyed by model
objects or morphisms is shown with their names instead of their IDs.
 */
export function describeAnalysis(
    doc: AnalysisDocLike,
    model: ModelDocLike,
    theory: TheoryInfo & Pick<Theory, "modelAnalyses">,
): string {
    const entities = listEntities(model.notebook);
    const lines = [`Analysis "${doc.name || "(untitled)"}" of model "${model.name}"`];

    lines.push("", "Available analyses:");
    for (const meta of theory.modelAnalyses) {
        lines.push(`  ${meta.id}: ${meta.name}${meta.description ? ` — ${meta.description}` : ""}`);
    }

    lines.push("", "Cells:");
    const cells = analysisCells(doc);
    for (const [i, { content }] of cells.entries()) {
        const name = theory.modelAnalyses.find((meta) => meta.id === content.id)?.name;
        lines.push(`  ${i + 1}. ${content.id}${name ? ` (${name})` : ""}`);
        lines.push(`     ${JSON.stringify(withNames(content.content, entities))}`);
    }
    if (cells.length === 0) {
        lines.push("  (none)");
    }
    return lines.join("\n");
}

/** Applies analysis edits in order. Returns one line per op. */
export function applyAnalysisOps(
    doc: AnalysisDocLike,
    model: ModelDocLike,
    theory: Pick<Theory, "modelAnalyses">,
    ops: AnalysisOp[],
): string[] {
    const entities = listEntities(model.notebook);
    return ops.map((op) => {
        switch (op.op) {
            case "add-analysis": {
                const meta =
                    theory.modelAnalyses.find((m) => m.id === op.kind) ??
                    theory.modelAnalyses.find((m) => sameName(m.name, op.kind));
                if (!meta) {
                    const known = theory.modelAnalyses.map((m) => m.id).join(", ");
                    throw new Error(`No analysis '${op.kind}' for this theory. Known: ${known}.`);
                }
                Nb.appendCell(
                    doc.notebook,
                    Nb.newFormalCell({ id: meta.id, content: meta.initialContent() }),
                );
                return `added analysis ${meta.id}`;
            }
            case "set-params": {
                const { content, index } = resolveAnalysisCell(doc, op.cell);
                setParams(content.content, op.params, entities);
                return `updated cell ${index + 1} (${content.id})`;
            }
            case "remove-analysis": {
                const { cellId, content, index } = resolveAnalysisCell(doc, op.cell);
                Nb.deleteCellAtIndex(doc.notebook, doc.notebook.cellOrder.indexOf(cellId));
                return `removed cell ${index + 1} (${content.id})`;
            }
            default:
                throw new Error(`Unknown analysis op '${(op as { op: unknown }).op}'.`);
        }
    });
}

/** Lists the named objects and morphisms of a model notebook, in order. */
export function listEntities(notebook: Notebook<ModelJudgment>): Entity[] {
    const entities: Entity[] = [];
    for (const cellId of notebook.cellOrder) {
        const cell = notebook.cellContents[cellId];
        if (cell?.tag !== "formal") {
            continue;
        }
        const decl = cell.content;
        if (decl.tag === "object") {
            entities.push({ kind: "object", id: decl.id, cellId, name: decl.name, decl });
        } else if (decl.tag === "morphism") {
            entities.push({ kind: "morphism", id: decl.id, cellId, name: decl.name, decl });
        }
    }
    return entities;
}

function applyModelOp(doc: ModelDocLike, theory: TheoryInfo, op: ModelOp): string {
    const entities = listEntities(doc.notebook);
    switch (op.op) {
        case "add-object": {
            const meta = resolveType(theory, op.type, "ObType");
            requireFreshName(entities, op.name);
            const decl = { ...Model.newObjectDecl(meta.obType), name: op.name };
            Nb.appendCell(doc.notebook, Nb.newFormalCell<ModelJudgment>(decl));
            return `added ${meta.name} "${op.name}"`;
        }
        case "add-morphism": {
            const meta = resolveType(theory, op.type, "MorType");
            const name = op.name ?? "";
            if (name) {
                requireFreshName(entities, name);
            }
            const decl = {
                ...Model.newMorphismDecl(meta.morType),
                name,
                dom: buildEnd(theory, entities, meta.morType, "dom", op.from),
                cod: buildEnd(theory, entities, meta.morType, "cod", op.to),
            };
            Nb.appendCell(doc.notebook, Nb.newFormalCell<ModelJudgment>(decl));
            return `added ${meta.name} ${name ? `"${name}"` : `id:${decl.id}`}`;
        }
        case "add-note": {
            Nb.appendCell(doc.notebook, Nb.newRichTextCell(op.text));
            return "added note";
        }
        case "rename": {
            const entity = resolveEntity(entities, op.target);
            requireFreshName(entities, op.name);
            const cell = doc.notebook.cellContents[entity.cellId];
            if (
                cell?.tag === "formal" &&
                (cell.content.tag === "object" || cell.content.tag === "morphism")
            ) {
                cell.content.name = op.name;
            }
            return `renamed "${entity.name}" to "${op.name}"`;
        }
        case "remove": {
            const removed = removeEntity(
                doc.notebook,
                entities,
                resolveEntity(entities, op.target),
            );
            return `removed ${removed.map((e) => (e.name ? `"${e.name}"` : `id:${e.id}`)).join(", ")}`;
        }
        default:
            throw new Error(`Unknown model op '${(op as { op: unknown }).op}'.`);
    }
}

/** Removes an entity and, transitively, every morphism left referring to a
removed entity.
 */
function removeEntity(
    notebook: Notebook<ModelJudgment>,
    entities: Entity[],
    target: Entity,
): Entity[] {
    const removedIds = new Set([target.id]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const entity of entities) {
            if (entity.kind !== "morphism" || removedIds.has(entity.id)) {
                continue;
            }
            if (
                mentionsAny(entity.decl.dom, removedIds) ||
                mentionsAny(entity.decl.cod, removedIds)
            ) {
                removedIds.add(entity.id);
                grew = true;
            }
        }
    }
    const removed = entities.filter((e) => removedIds.has(e.id));
    for (const entity of removed) {
        const index = notebook.cellOrder.indexOf(entity.cellId);
        if (index >= 0) {
            Nb.deleteCellAtIndex(notebook, index);
        }
    }
    return removed;
}

/** Builds the domain or codomain of a new morphism from names, following the
shape the theory expects: a plain object, a tabulated morphism (such as the
flow a stock-flow link points at), a list, or an operation applied to one.
 */
function buildEnd(
    theory: TheoryInfo,
    entities: Entity[],
    morType: MorType,
    end: "dom" | "cod",
    ref: EndRef,
): Ob {
    const meta = theory.modelTypes.find(
        (m) => m.tag === "MorType" && deepEqual(m.morType, morType),
    ) as Extract<TheoryInfo["modelTypes"][number], { tag: "MorType" }> | undefined;
    const apply = (end === "dom" ? meta?.domain : meta?.codomain)?.apply;
    if (apply) {
        return {
            tag: "App",
            content: { op: apply, ob: buildOb(theory, entities, theory.theory.dom(apply), ref) },
        };
    }
    const expected = end === "dom" ? sourceType(theory, morType) : targetType(theory, morType);
    return buildOb(theory, entities, expected, ref);
}

function buildOb(theory: TheoryInfo, entities: Entity[], expected: ObType, ref: EndRef): Ob {
    switch (expected.tag) {
        case "Basic": {
            const entity = resolveEntity(entities, single(ref), "object");
            requireObType(theory, entity, expected);
            return { tag: "Basic", content: entity.id };
        }
        case "Tabulator": {
            const entity = resolveEntity(entities, single(ref), "morphism");
            if (entity.kind !== "morphism" || !deepEqual(entity.decl.morType, expected.content)) {
                throw new Error(
                    `"${entity.name}" is not a ${morTypeName(theory, expected.content)}.`,
                );
            }
            return { tag: "Tabulated", content: { tag: "Basic", content: entity.id } };
        }
        case "ModeApp": {
            const refs = Array.isArray(ref) ? ref : [ref];
            return {
                tag: "List",
                content: {
                    modality: expected.content.modality,
                    objects: refs.map((r) => buildOb(theory, entities, expected.content.obType, r)),
                },
            };
        }
        default:
            throw new Error(`Unsupported object type ${JSON.stringify(expected)}.`);
    }
}

/** Replaces entity IDs in analysis configuration with entity names: in object
keys, and in string values.
 */
function withNames(value: unknown, entities: Entity[]): unknown {
    const nameOf = (id: string) => {
        const entity = entities.find((e) => e.id === id);
        return entity ? entity.name || `id:${entity.id}` : id;
    };
    if (typeof value === "string") {
        return nameOf(value);
    }
    if (Array.isArray(value)) {
        return value.map((v) => withNames(v, entities));
    }
    if (isPlainObject(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [nameOf(k), withNames(v, entities)]),
        );
    }
    return value;
}

/** Updates analysis configuration from LLM-supplied values.

A field whose current value is a map keyed by entity IDs (or is empty) takes a
map keyed by entity names, resolved recursively. Anything else is assigned as
given.
 */
function setParams(
    target: Record<string, unknown>,
    params: Record<string, unknown>,
    entities: Entity[],
) {
    for (const [key, value] of Object.entries(params)) {
        const current = target[key];
        if (isPlainObject(value) && isEntityMap(current)) {
            for (const [name, inner] of Object.entries(value)) {
                const id = resolveEntity(entities, name).id;
                if (isPlainObject(inner)) {
                    if (!isPlainObject(current[id])) {
                        current[id] = {};
                    }
                    setParams(current, { [id]: inner }, entities);
                } else {
                    current[id] = inner;
                }
            }
        } else {
            target[key] = value;
        }
    }
}

function isEntityMap(value: unknown): value is Record<string, unknown> {
    return isPlainObject(value) && Object.keys(value).every(isUuid);
}

function resolveAnalysisCell(doc: AnalysisDocLike, ref: string | number) {
    const cells = analysisCells(doc);
    const index =
        typeof ref === "number" ? ref - 1 : cells.findIndex(({ content }) => content.id === ref);
    const cell = cells[index];
    if (!cell) {
        const known = cells.map(({ content }, i) => `${i + 1} (${content.id})`).join(", ");
        throw new Error(`No analysis cell '${ref}'. Cells: ${known || "(none)"}.`);
    }
    return { cellId: cell.cellId, content: cell.content, index };
}

function analysisCells(doc: AnalysisDocLike): { cellId: Uuid; content: AnalysisCellContent }[] {
    const cells: { cellId: Uuid; content: AnalysisCellContent }[] = [];
    for (const cellId of doc.notebook.cellOrder) {
        const cell = doc.notebook.cellContents[cellId];
        if (cell?.tag === "formal") {
            cells.push({ cellId, content: cell.content });
        }
    }
    return cells;
}

/** Resolves a reference to an entity: `id:<uuid>`, an exact name, or a unique
case-insensitive name.
 */
function resolveEntity(entities: Entity[], ref: string, kind?: Entity["kind"]): Entity {
    const candidates = kind ? entities.filter((e) => e.kind === kind) : entities;
    const label = kind ?? "object or morphism";
    if (ref.startsWith("id:")) {
        const match = candidates.find((e) => e.id === ref.slice(3));
        if (!match) {
            throw new Error(`No ${label} with ${ref}.`);
        }
        return match;
    }
    const exact = candidates.filter((e) => e.name === ref);
    const matches = exact.length > 0 ? exact : candidates.filter((e) => sameName(e.name, ref));
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length === 0) {
        const known = candidates.map((e) => (e.name ? `"${e.name}"` : `id:${e.id}`)).join(", ");
        throw new Error(`No ${label} named "${ref}". Known: ${known || "(none)"}.`);
    }
    throw new Error(
        `Ambiguous name "${ref}"; use ${matches.map((e) => `id:${e.id}`).join(" or ")}.`,
    );
}

function resolveType<Tag extends "ObType" | "MorType">(theory: TheoryInfo, name: string, tag: Tag) {
    const metas = theory.modelTypes.filter(
        (m): m is Extract<TheoryInfo["modelTypes"][number], { tag: Tag }> => m.tag === tag,
    );
    const meta = metas.find((m) => sameName(m.name, name));
    if (!meta) {
        const kind = tag === "ObType" ? "object" : "morphism";
        const known = metas.map((m) => `"${m.name}"`).join(", ");
        throw new Error(
            `No ${kind} type "${name}" in ${theory.name}. Known: ${known || "(none)"}.`,
        );
    }
    return meta;
}

function requireFreshName(entities: Entity[], name: string) {
    if (!name.trim()) {
        throw new Error("Name must be non-empty.");
    }
    if (name.startsWith("id:")) {
        throw new Error(`Name "${name}" must not start with "id:".`);
    }
    if (entities.some((e) => e.name === name)) {
        throw new Error(`Something named "${name}" already exists.`);
    }
}

function requireObType(theory: TheoryInfo, entity: Entity, expected: ObType) {
    if (entity.kind !== "object" || !deepEqual(entity.decl.obType, expected)) {
        throw new Error(`"${entity.name}" is not a ${obTypeName(theory, expected)}.`);
    }
}

function describeEntity(theory: TheoryInfo, entities: Entity[], entity: Entity): string {
    const label = entity.name ? `"${entity.name}"` : `id:${entity.id}`;
    if (entity.kind === "object") {
        return `${obTypeName(theory, entity.decl.obType)} ${label}`;
    }
    const { decl } = entity;
    const ends = `${describeOb(entities, decl.dom)} → ${describeOb(entities, decl.cod)}`;
    return `${morTypeName(theory, decl.morType)} ${label}: ${ends}`;
}

function describeOb(entities: Entity[], ob: Ob | null | undefined): string {
    if (!ob) {
        return "?";
    }
    switch (ob.tag) {
        case "Basic":
            return entityLabel(entities, ob.content);
        case "Tabulated":
            return ob.content.tag === "Basic"
                ? `[${entityLabel(entities, ob.content.content)}]`
                : "[?]";
        case "List":
            return ob.content.objects.length === 0
                ? "(nothing)"
                : ob.content.objects.map((o) => describeOb(entities, o)).join(" + ");
        case "App":
            return ob.content.ob.tag === "List"
                ? describeOb(entities, ob.content.ob)
                : `${ob.content.op.content}(${describeOb(entities, ob.content.ob)})`;
        default:
            return "?";
    }
}

function entityLabel(entities: Entity[], id: Uuid): string {
    const entity = entities.find((e) => e.id === id);
    return entity ? entity.name || `id:${id}` : `missing:${id}`;
}

function obTypeName(theory: TheoryInfo, obType: ObType): string {
    const meta = theory.modelTypes.find((m) => m.tag === "ObType" && deepEqual(m.obType, obType));
    if (meta) {
        return meta.name;
    }
    if (obType.tag === "Tabulator") {
        return morTypeName(theory, obType.content);
    }
    if (obType.tag === "ModeApp") {
        return `list of ${obTypeName(theory, obType.content.obType)}`;
    }
    return JSON.stringify(obType);
}

function morTypeName(theory: TheoryInfo, morType: MorType): string {
    const meta = theory.modelTypes.find(
        (m) => m.tag === "MorType" && deepEqual(m.morType, morType),
    );
    return meta?.name ?? JSON.stringify(morType);
}

function sourceType(theory: TheoryInfo, morType: MorType): ObType {
    return theory.theory.src(morType);
}

function targetType(theory: TheoryInfo, morType: MorType): ObType {
    return theory.theory.tgt(morType);
}

function listNotes(notebook: Notebook<ModelJudgment>): string[] {
    const notes: string[] = [];
    for (const cellId of notebook.cellOrder) {
        const cell: Cell<ModelJudgment> | undefined = notebook.cellContents[cellId];
        if (cell?.tag === "rich-text" && typeof cell.content === "string" && cell.content.trim()) {
            notes.push(cell.content.replaceAll("\uFFFC", " ").trim());
        }
    }
    return notes;
}

function mentionsAny(ob: Ob | null | undefined, ids: Set<string>): boolean {
    if (!ob) {
        return false;
    }
    switch (ob.tag) {
        case "Basic":
            return ids.has(ob.content);
        case "Tabulated":
            return ob.content.tag === "Basic" && ids.has(ob.content.content);
        case "List":
            return ob.content.objects.some((o) => mentionsAny(o, ids));
        case "App":
            return mentionsAny(ob.content.ob, ids);
        default:
            return false;
    }
}

function single(ref: EndRef): string {
    if (Array.isArray(ref)) {
        if (ref.length !== 1) {
            throw new Error(`Expected one name here, got ${JSON.stringify(ref)}.`);
        }
        return ref[0];
    }
    return ref;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const isUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural equality that ignores key order, since types read from an
Automerge document and types built by the core list their keys differently.
 */
function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every((k) => deepEqual(a[k], b[k]));
    }
    return false;
}
