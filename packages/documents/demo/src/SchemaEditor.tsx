import { Attr, Entity, Mapping } from "catcolab-logics/simple-schema";
import { createEffect, createSignal, For, on, Show } from "solid-js";

import { CellKind, type NotebookCell, type ObjectCell } from "catcolab-documents";
import {
    ATTR_TYPE_NAMES,
    type AttrTypeName,
    type DemoDocument,
    entityCells,
    SCHEMA_CELL_LABEL,
    type SchemaCell,
    schemaCellKind,
    schemaCells,
} from "./document";
import { HistorySidebar } from "./HistorySidebar";
import { HistoryToggle } from "./HistoryToggle";
import { SketchArrow, SketchBox, SketchSeparator } from "./Rough";
import { SchemaChangeReviewDialog } from "./SchemaChangeReviewDialog";

import styles from "./SchemaEditor.module.css";

/** A morphism cell as it appears in the schema notebook (Mapping or Attr). */
type SchemaMorphismCell = Extract<SchemaCell, { kind: typeof CellKind.Morphism }>;

/** The single object endpoint of a schema morphism (never a list, here). */
function endpoint(
    end: SchemaMorphismCell["from"] | SchemaMorphismCell["to"],
): { readonly id: string; readonly label: string } | undefined {
    return Array.isArray(end) ? end[0] : end;
}

/**
 * An inline, borderless name field that owns its text locally so a schema
 * re-render (triggered by *its own* edits) never clobbers what the user is
 * typing. It writes through to `setValue` on every input and only pulls the
 * external `value` back in when the field is not focused (e.g. an edit from
 * elsewhere), mirroring CatColab's `InlineInput`.
 */
function NameField(props: {
    value: string;
    setValue: (name: string) => void;
    placeholder?: string;
    class?: string;
}) {
    const [text, setText] = createSignal(props.value);
    let el!: HTMLInputElement;

    createEffect(
        on(
            () => props.value,
            (value) => {
                if (document.activeElement !== el) {
                    setText(value);
                }
            },
        ),
    );

    // Size the input to its content with the frontend's `InlineInput` trick: a
    // hidden filler span (same text metrics) sets the width, and the input is
    // stretched over it. Without this the input keeps its default fixed width,
    // leaving empty space to the right of the name inside the entity box.
    return (
        <span class={styles.inlineInput}>
            <span class={`${styles.inlineInputFiller} ${props.class ?? ""}`}>
                {text() || props.placeholder}
            </span>
            <input
                ref={el}
                class={`${styles.inlineInputField} ${props.class ?? ""}`}
                placeholder={props.placeholder}
                value={text()}
                onInput={(e) => {
                    setText(e.currentTarget.value);
                    props.setValue(e.currentTarget.value);
                }}
            />
        </span>
    );
}

/**
 * The left panel: a faithful simple-schema notebook. It edits a single
 * SimpleSchema laid out exactly like a CatColab model notebook — one formal cell
 * per line, each with a hover gutter ("+") on the left and its type tag on the
 * right. Entities are boxed monospace names; mappings and attributes are drawn
 * `dom ──name──▶ cod`.
 *
 * The two attribute types (String, Number) are seeded and shown as ordinary
 * "Attribute type" cells, but they are pinned to the top and cannot be deleted,
 * and the new-cell menu never offers to add another attribute type — so the only
 * attribute codomains are ever String and Number.
 */
export function SchemaEditor(props: {
    doc: DemoDocument;
    active: () => boolean;
    onActivate: () => void;
}) {
    const doc = () => props.doc;

    // Iterate over stable cell ids so a row's DOM (and its focused input) is not
    // torn down every time the schema signal bumps; each row resolves its live
    // handle by id reactively.
    const cellIds = () => (doc().trackSchema(), schemaCells(doc()).map((c) => c.id));

    const [historyOpen, setHistoryOpen] = createSignal(false);

    return (
        <div
            class={styles.panelLayout}
            onFocusIn={() => props.onActivate()}
            onPointerDown={() => props.onActivate()}
        >
            <SketchSeparator edge="right" seed={73} />
            <div class={styles.panelColumn}>
                <div class={styles.panel}>
                    <div class={styles.header}>
                        <SketchSeparator edge="bottom" seed={79} />
                        <h2>Schema</h2>
                        <div class={styles.headerRight}>
                            <HistoryToggle
                                open={historyOpen()}
                                onToggle={() => setHistoryOpen((v) => !v)}
                            />
                        </div>
                    </div>
                    <div class={styles.notebookContainer}>
                        <ul class={styles.notebookCells}>
                            <For each={cellIds()}>
                                {(id) => <SchemaCellRow doc={doc()} cellId={id} />}
                            </For>
                        </ul>
                        <AddCellPlaceholder doc={doc()} />
                    </div>
                </div>
            </div>
            <Show when={historyOpen()}>
                <HistorySidebar history={doc().schemaHistory} active={props.active} />
            </Show>
        </div>
    );
}

/** Dispatch one notebook cell to the right formal-cell editor, plus gutter + tag. */
function SchemaCellRow(props: { doc: DemoDocument; cellId: string }) {
    const cell = () => {
        props.doc.trackSchema();
        return schemaCells(props.doc).find((c) => c.id === props.cellId);
    };
    const kind = () => {
        const c = cell();
        return c ? schemaCellKind(props.doc, c) : undefined;
    };
    // The seeded attribute types are pinned and cannot be deleted.
    const deletable = () => kind() !== "attrType";

    return (
        <Show when={cell()}>
            {(c) => (
                <li class={styles.cell}>
                    <div class={styles.cellGutter}>
                        <AddCellButton doc={props.doc} icon="+" />
                        <Show when={deletable()}>
                            <button
                                class={styles.gutterDelete}
                                type="button"
                                title="Delete cell"
                                onClick={() => c().delete()}
                            >
                                ×
                            </button>
                        </Show>
                    </div>
                    <div class={styles.cellContent}>
                        <Show
                            when={c().kind === CellKind.Object}
                            fallback={
                                <MorphismCellEditor
                                    doc={props.doc}
                                    cell={c() as SchemaMorphismCell}
                                    kind={kind() === "mapping" ? "mapping" : "attr"}
                                />
                            }
                        >
                            <ObjectCellEditor
                                object={c() as ObjectCell}
                                boxed={kind() === "entity"}
                                readonly={kind() === "attrType"}
                            />
                        </Show>
                    </div>
                    <Show when={kind()}>
                        {(k) => <div class={styles.cellTag}>{SCHEMA_CELL_LABEL[k()]}</div>}
                    </Show>
                </li>
            )}
        </Show>
    );
}

/**
 * An object cell: a single monospace name. Entities are wrapped in a 1px box
 * (like a CatColab Entity declaration); attribute types are shown read-only.
 */
function ObjectCellEditor(props: { object: ObjectCell; boxed: boolean; readonly?: boolean }) {
    const name = () => (
        <Show
            when={!props.readonly}
            fallback={<span class={styles.code}>{props.object.label}</span>}
        >
            <NameField
                class={`${styles.nameInput} ${styles.code}`}
                placeholder="Unnamed"
                value={props.object.label}
                setValue={(value) => props.object.update({ label: value })}
            />
        </Show>
    );

    return (
        <div class={`${styles.formalJudgment} ${styles.objectDecl}`}>
            <Show when={props.boxed} fallback={name()}>
                <SketchBox class={styles.box} seed={Math.max(1, props.object.id.length)}>
                    {name()}
                </SketchBox>
            </Show>
        </div>
    );
}

/** A morphism cell rendered `dom ──name──▶ cod`, matching CatColab's layout. */
function MorphismCellEditor(props: {
    doc: DemoDocument;
    cell: SchemaMorphismCell;
    kind: "mapping" | "attr";
}) {
    const doc = () => props.doc;
    const entities = () => (doc().trackSchema(), entityCells(doc()));
    const [reviewIntegerChange, setReviewIntegerChange] = createSignal(false);

    const setDomain = (id: string) => {
        const entity = entities().find((e) => e.id === id);
        if (entity) {
            props.cell.update({ from: entity });
        }
    };
    const setMappingCodomain = (id: string) => {
        const entity = entities().find((e) => e.id === id);
        if (entity) {
            props.cell.update({ to: entity });
        }
    };

    // Reactive endpoint ids: read `trackSchema` so, after the option list
    // re-renders on a schema change, the select re-applies the right selection
    // (a `<select>` otherwise snaps back to its first option).
    const fromId = () => (doc().trackSchema(), endpoint(props.cell.from)?.id ?? "");
    const toId = () => (doc().trackSchema(), endpoint(props.cell.to)?.id ?? "");
    const toName = () => (doc().trackSchema(), endpoint(props.cell.to)?.label ?? "String");
    const setAttrCodomain = (name: AttrTypeName) => {
        if (toName() === name) {
            return;
        }
        if (toName() === "Float" && name === "Integer") {
            setReviewIntegerChange(true);
            return;
        }
        props.cell.update({ to: doc().attrTypes[name] });
    };

    return (
        <div class={`${styles.formalJudgment} ${styles.morphismDecl}`}>
            <select
                class={`${styles.endpoint} ${styles.code}`}
                onChange={(e) => setDomain(e.currentTarget.value)}
            >
                <For each={entities()}>
                    {(entity) => (
                        <option value={entity.id} selected={entity.id === fromId()}>
                            {entity.label || "•"}
                        </option>
                    )}
                </For>
            </select>

            <div class={styles.arrowWithName}>
                <NameField
                    class={`${styles.arrowName} ${styles.code}`}
                    placeholder="Unnamed"
                    value={props.cell.label}
                    setValue={(name) => props.cell.update({ label: name })}
                />
                <div class={styles.arrowContainer}>
                    <SketchArrow />
                </div>
            </div>

            <Show
                when={props.kind === "mapping"}
                fallback={
                    <select
                        class={`${styles.endpoint} ${styles.code}`}
                        onChange={(e) => {
                            const name = e.currentTarget.value as AttrTypeName;
                            e.currentTarget.value = toName();
                            setAttrCodomain(name);
                        }}
                    >
                        <For each={ATTR_TYPE_NAMES}>
                            {(name) => (
                                <option value={name} selected={toName() === name}>
                                    {name}
                                </option>
                            )}
                        </For>
                    </select>
                }
            >
                <select
                    class={`${styles.endpoint} ${styles.code}`}
                    onChange={(e) => setMappingCodomain(e.currentTarget.value)}
                >
                    <For each={entities()}>
                        {(entity) => (
                            <option value={entity.id} selected={entity.id === toId()}>
                                {entity.label || "•"}
                            </option>
                        )}
                    </For>
                </select>
            </Show>
            <Show when={reviewIntegerChange()}>
                <SchemaChangeReviewDialog
                    doc={doc()}
                    attribute={props.cell as NotebookCell<typeof Attr>}
                    onCancel={() => setReviewIntegerChange(false)}
                    onApplied={() => setReviewIntegerChange(false)}
                />
            </Show>
        </div>
    );
}

/** The list of cell types offered by the new-cell menu (never "Attribute type"). */
const CELL_TYPES: { kind: "entity" | "mapping" | "attr"; name: string; description: string }[] = [
    { kind: "entity", name: "Entity", description: "A type of thing, i.e. a database table." },
    {
        kind: "mapping",
        name: "Mapping",
        description: "A foreign key from one entity to another entity.",
    },
    {
        kind: "attr",
        name: "Attribute",
        description: "A String-, Boolean-, Integer-, or Float-valued column.",
    },
];

/** Insert a new cell of the given kind, adding an entity first if one is needed. */
function addCell(doc: DemoDocument, kind: "entity" | "mapping" | "attr") {
    if (kind === "entity") {
        doc.schema.add(Entity, { label: "" });
        return;
    }
    // A mapping/attribute needs a domain entity; create one if none exists yet.
    const entity = entityCells(doc)[0] ?? doc.schema.add(Entity, { label: "" });
    if (kind === "mapping") {
        // A mapping is a foreign key between entities: entity -> entity.
        doc.schema.add(Mapping, { label: "", from: entity, to: entity });
    } else {
        doc.schema.add(Attr, { label: "", from: entity, to: doc.attrTypes.String });
    }
}

/** A popover-style new-cell button (the "+" gutter affordance and the footer). */
function AddCellButton(props: { doc: DemoDocument; icon: string }) {
    const [open, setOpen] = createSignal(false);

    return (
        <div class={styles.addCell}>
            <button
                class={styles.addCellButton}
                type="button"
                title="Add a cell"
                onClick={() => setOpen((v) => !v)}
            >
                {props.icon}
            </button>
            <Show when={open()}>
                <>
                    <div class={styles.addCellBackdrop} onClick={() => setOpen(false)} />
                    <wired-card class={styles.addCellMenu} elevation="3">
                        <ul class={styles.addCellMenuList}>
                            <For each={CELL_TYPES}>
                                {(type) => (
                                    <li
                                        class={styles.addCellOption}
                                        onClick={() => {
                                            addCell(props.doc, type.kind);
                                            setOpen(false);
                                        }}
                                    >
                                        <div class={styles.addCellName}>{type.name}</div>
                                        <div class={styles.addCellDescription}>
                                            {type.description}
                                        </div>
                                    </li>
                                )}
                            </For>
                        </ul>
                    </wired-card>
                </>
            </Show>
        </div>
    );
}

/** The end-of-notebook add-cell placeholder. */
function AddCellPlaceholder(props: { doc: DemoDocument }) {
    return (
        <div class={styles.notebookCellPlaceholder}>
            <AddCellButton doc={props.doc} icon="+" />
            <span>Add a cell</span>
        </div>
    );
}
