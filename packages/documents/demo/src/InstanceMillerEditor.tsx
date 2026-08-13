import { Attr, Mapping } from "catcolab-logics/simple-schema";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Plus from "lucide-solid/icons/plus";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import type { MorphismCell, ObjectCell, TableRow } from "catcolab-documents";
import type { DemoDocument } from "./document";
import { type Column, columnsFor, rowShortLabel, tableSpecs } from "./instance-model";

import styles from "./InstanceMillerEditor.module.css";

type Location = { entityId: string; rowId: string };

/** Navigate an instance as entities -> rows -> record in three fixed columns. */
export function InstanceMillerEditor(props: { doc: DemoDocument }) {
    const specs = createMemo(() => {
        props.doc.trackSchema();
        props.doc.trackInstance();
        return tableSpecs(props.doc);
    });
    const [entityId, setEntityId] = createSignal("");
    const [path, setPath] = createSignal<Location[]>([]);

    const selectEntity = (id: string) => {
        setEntityId(id);
        const spec = specs().find((candidate) => candidate.entity.id === id);
        const firstRow = spec?.rows[0];
        const firstRowId = firstRow && spec ? props.doc.rowId(spec.entity, firstRow) : undefined;
        setPath(firstRowId ? [{ entityId: id, rowId: firstRowId }] : []);
    };

    // Keep navigation valid as schema edits, row deletion, and history change the document.
    createEffect(() => {
        const allSpecs = specs();
        const selected = allSpecs.find((spec) => spec.entity.id === entityId()) ?? allSpecs[0];
        if (!selected) {
            setEntityId("");
            setPath([]);
            return;
        }
        if (selected.entity.id !== entityId()) {
            selectEntity(selected.entity.id);
            return;
        }

        const current = path()[0];
        const currentIsValid =
            current?.entityId === selected.entity.id &&
            selected.rows.some((row) => props.doc.rowId(selected.entity, row) === current.rowId);
        if (!currentIsValid) {
            const firstRow = selected.rows[0];
            const firstRowId = firstRow ? props.doc.rowId(selected.entity, firstRow) : undefined;
            setPath(firstRowId ? [{ entityId: selected.entity.id, rowId: firstRowId }] : []);
        }
    });

    const selectedSpec = () => specs().find((spec) => spec.entity.id === entityId());

    return (
        <div class={styles.browser}>
            <section class={styles.column} aria-label="Entities">
                <ColumnHeading title="Entities" />
                <div class={styles.list}>
                    <For each={specs()}>
                        {(spec) => (
                            <button
                                class={styles.listItem}
                                classList={{
                                    [styles.selected ?? ""]: spec.entity.id === entityId(),
                                }}
                                type="button"
                                aria-pressed={spec.entity.id === entityId()}
                                onClick={() => selectEntity(spec.entity.id)}
                            >
                                <span class={styles.itemLabel}>
                                    {spec.entity.label || "Unnamed"}
                                </span>
                                <span class={styles.count}>{spec.rows.length}</span>
                                <span class={styles.chevron}>›</span>
                            </button>
                        )}
                    </For>
                </div>
            </section>

            <section class={styles.column} aria-label="Rows">
                <ColumnHeading
                    title={selectedSpec()?.entity.label || "Rows"}
                    onAdd={() => {
                        const spec = selectedSpec();
                        if (!spec) {
                            return;
                        }
                        const row = props.doc.addRow(spec.entity);
                        const rowId = props.doc.rowId(spec.entity, row);
                        setPath(rowId ? [{ entityId: spec.entity.id, rowId }] : []);
                    }}
                />
                <div class={styles.list}>
                    <For each={selectedSpec()?.rows ?? []}>
                        {(row) => {
                            const rowId = () => props.doc.rowId(selectedSpec()!.entity, row);
                            return (
                                <button
                                    class={styles.listItem}
                                    classList={{
                                        [styles.selected ?? ""]: path()[0]?.rowId === rowId(),
                                    }}
                                    type="button"
                                    aria-pressed={path()[0]?.rowId === rowId()}
                                    onClick={() => {
                                        const id = rowId();
                                        if (id) {
                                            setPath([{ entityId: entityId(), rowId: id }]);
                                        }
                                    }}
                                >
                                    <span class={styles.itemLabel}>
                                        {rowShortLabel(props.doc, selectedSpec()!.entity, row)}
                                    </span>
                                    <span class={styles.chevron}>›</span>
                                </button>
                            );
                        }}
                    </For>
                    <Show when={(selectedSpec()?.rows.length ?? 0) === 0}>
                        <div class={styles.empty}>No rows yet</div>
                    </Show>
                </div>
            </section>

            <Show when={path()[0]}>
                {(location) => (
                    <RecordColumn
                        doc={props.doc}
                        location={location()}
                        openTarget={(target) => {
                            setEntityId(target.entityId);
                            setPath([target]);
                        }}
                    />
                )}
            </Show>
        </div>
    );
}

function ColumnHeading(props: { title: string; onAdd?: () => void }) {
    return (
        <div class={styles.columnHeading}>
            <h3>{props.title}</h3>
            <Show when={props.onAdd}>
                {(onAdd) => (
                    <wired-icon-button title="Add row" aria-label="Add row" onClick={onAdd()}>
                        <Plus size={18} strokeWidth={2} aria-hidden="true" />
                    </wired-icon-button>
                )}
            </Show>
        </div>
    );
}

function RecordColumn(props: {
    doc: DemoDocument;
    location: Location;
    openTarget: (target: Location) => void;
}) {
    const entity = () =>
        tableSpecs(props.doc).find((spec) => spec.entity.id === props.location.entityId)?.entity;
    const row = () =>
        entity()
            ? props.doc
                  .rowsOf(entity()!)
                  .find(
                      (candidate) => props.doc.rowId(entity()!, candidate) === props.location.rowId,
                  )
            : undefined;
    const columns = () => (entity() ? columnsFor(props.doc, entity()!) : []);

    return (
        <section class={`${styles.column} ${styles.recordColumn}`} aria-label="Record details">
            <div class={styles.recordHeading}>
                <div>
                    <span class={styles.eyebrow}>{entity()?.label || "Unnamed entity"}</span>
                    <h3>
                        {row() && entity()
                            ? rowShortLabel(props.doc, entity()!, row()!)
                            : "Missing row"}
                    </h3>
                </div>
                <wired-button
                    class={styles.deleteButton}
                    onClick={() => {
                        const currentEntity = entity();
                        const currentRow = row();
                        if (currentEntity && currentRow) {
                            currentRow.delete();
                        }
                    }}
                >
                    Delete
                </wired-button>
            </div>
            <div class={styles.fields}>
                <Show when={row()} keyed>
                    {(currentRow) => (
                        <Show
                            when={columns().length > 0}
                            fallback={<div class={styles.empty}>This entity has no fields.</div>}
                        >
                            <For each={columns()}>
                                {(column) => (
                                    <Field
                                        doc={props.doc}
                                        entity={entity()!}
                                        row={currentRow}
                                        column={column}
                                        openTarget={props.openTarget}
                                    />
                                )}
                            </For>
                        </Show>
                    )}
                </Show>
            </div>
        </section>
    );
}

function Field(props: {
    doc: DemoDocument;
    entity: ObjectCell;
    row: TableRow;
    column: Column;
    openTarget: (target: Location) => void;
}) {
    const morphism = () => morphismCellFor(props.doc, props.column);

    return (
        <label class={styles.field}>
            <span class={styles.fieldLabel}>
                {props.column.title}
                <span class={styles.fieldKind}>
                    {props.column.kind === "attr" ? props.column.attrType : "Mapping"}
                </span>
            </span>
            <Show
                when={props.column.kind === "mapping"}
                fallback={
                    <AttributeInput
                        doc={props.doc}
                        entity={props.entity}
                        row={props.row}
                        column={props.column}
                        morphism={morphism()}
                    />
                }
            >
                <MappingInput
                    doc={props.doc}
                    entity={props.entity}
                    row={props.row}
                    column={props.column as Extract<Column, { kind: "mapping" }>}
                    morphism={morphism()}
                    openTarget={props.openTarget}
                />
            </Show>
        </label>
    );
}

function AttributeInput(props: {
    doc: DemoDocument;
    entity: ObjectCell;
    row: TableRow;
    column: Column;
    morphism: MorphismCell;
}) {
    const column = () => props.column as Extract<Column, { kind: "attr" }>;
    const value = () => props.doc.rowValue(props.entity, props.row, column().morphismId);
    if (column().attrType === "Boolean") {
        return (
            <span class={styles.checkboxRow}>
                <input
                    type="checkbox"
                    checked={value() === true}
                    onChange={(event) =>
                        props.doc.setRowValue(
                            props.entity,
                            props.row,
                            props.morphism,
                            event.currentTarget.checked,
                        )
                    }
                />
                <span>{value() === true ? "True" : "False"}</span>
            </span>
        );
    }
    const numeric = () => column().attrType === "Integer" || column().attrType === "Float";
    const displayValue = () => {
        const current = value();
        return typeof current === "string" || typeof current === "number" ? current : "";
    };
    return (
        <input
            class={styles.input}
            type={numeric() ? "number" : "text"}
            step={column().attrType === "Float" ? "any" : undefined}
            value={displayValue()}
            placeholder="Empty"
            onChange={(event) => {
                const raw = event.currentTarget.value;
                if (raw === "") {
                    props.doc.setRowValue(props.entity, props.row, props.morphism, undefined);
                } else if (!numeric()) {
                    props.doc.setRowValue(props.entity, props.row, props.morphism, raw);
                } else {
                    const number = Number(raw);
                    const validInteger =
                        Number.isInteger(number) &&
                        number >= -2_147_483_648 &&
                        number <= 2_147_483_647;
                    const validFloat =
                        Number.isFinite(number) && Number.isFinite(Math.fround(number));
                    if (
                        (column().attrType === "Integer" && validInteger) ||
                        (column().attrType === "Float" && validFloat)
                    ) {
                        props.doc.setRowValue(props.entity, props.row, props.morphism, number);
                    } else {
                        event.currentTarget.value = String(displayValue());
                    }
                }
            }}
        />
    );
}

function MappingInput(props: {
    doc: DemoDocument;
    entity: ObjectCell;
    row: TableRow;
    column: Extract<Column, { kind: "mapping" }>;
    morphism: MorphismCell;
    openTarget: (target: Location) => void;
}) {
    const rows = () => props.doc.rowsOf(props.column.codomain);
    const value = () => props.doc.rowValue(props.entity, props.row, props.column.morphismId);
    const target = () => {
        const current = value();
        if (typeof current !== "object" || current === null) {
            return undefined;
        }
        const currentId = props.doc.rowId(props.column.codomain, current as TableRow);
        return currentId
            ? rows().find((row) => props.doc.rowId(props.column.codomain, row) === currentId)
            : undefined;
    };
    const invalid = () => value() !== undefined && !target();

    return (
        <span class={styles.mappingControl}>
            <select
                class={styles.input}
                classList={{ [styles.invalid ?? ""]: invalid() }}
                value={
                    invalid()
                        ? "__invalid"
                        : (target() && props.doc.rowId(props.column.codomain, target()!)) || ""
                }
                aria-invalid={invalid()}
                onChange={(event) => {
                    const next = rows().find(
                        (row) =>
                            props.doc.rowId(props.column.codomain, row) ===
                            event.currentTarget.value,
                    );
                    props.doc.setRowValue(props.entity, props.row, props.morphism, next);
                }}
            >
                <option value="">None</option>
                <Show when={invalid()}>
                    <option value="__invalid">Invalid reference</option>
                </Show>
                <For each={rows()}>
                    {(row) => (
                        <option value={props.doc.rowId(props.column.codomain, row) ?? ""}>
                            {rowShortLabel(props.doc, props.column.codomain, row)}
                        </option>
                    )}
                </For>
            </select>
            <wired-icon-button
                class={styles.openButton}
                disabled={!target()}
                title="Open linked row"
                aria-label="Open linked row"
                onClick={() => {
                    const row = target();
                    if (row) {
                        const rowId = props.doc.rowId(props.column.codomain, row);
                        if (!rowId) {
                            return;
                        }
                        props.openTarget({
                            entityId: props.column.codomain.id,
                            rowId,
                        });
                    }
                }}
            >
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
            </wired-icon-button>
        </span>
    );
}

function morphismCellFor(doc: DemoDocument, column: Column): MorphismCell {
    const cell = [...doc.schema.cellsOf(Mapping), ...doc.schema.cellsOf(Attr)].find(
        (candidate) => candidate.id === column.morphismId,
    );
    if (!cell) {
        throw new Error(`No schema morphism cell for "${column.title}".`);
    }
    return cell;
}
