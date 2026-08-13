import { Entity } from "catcolab-logics/simple-schema";
import { createMemo, createSignal, For, Show } from "solid-js";

import {
    ATTR_TYPE_NAMES,
    type DemoDocument,
    resolveLinkTarget,
    type SheetTableCreation,
} from "./document";
import {
    cellParsesAs,
    isLinkTag,
    linkTag,
    linkTagEntity,
    type SheetColumnTag,
    type SheetTablePlan,
} from "./sheet-model";

import styles from "./MakeTableDialog.module.css";

/** How many data rows the preview table shows before eliding. */
const PREVIEW_ROWS = 5;

/**
 * The review step between selecting free-sheet columns and creating a table
 * from them. The user confirms the entity name and each column's attribute
 * name (seeded from the column title) and type — a scalar (seeded from the tag
 * or inference) or a foreign key to an existing table, whose cell texts are
 * resolved to target rows by their values. Any choice shows how many values it
 * would leave unset. Applying creates the schema entity, its attributes and
 * mappings, and the instance rows atomically.
 */
export function MakeTableDialog(props: {
    doc: DemoDocument;
    plan: SheetTablePlan;
    onCancel: () => void;
    /** Called after the table is created, so the caller can claim the columns. */
    onApplied: () => void;
}) {
    const [entityName, setEntityName] = createSignal(props.plan.entityName);
    const [nameEdits, setNameEdits] = createSignal<Record<number, string>>({});
    const [typeEdits, setTypeEdits] = createSignal<Record<number, SheetColumnTag>>({});
    const [applyError, setApplyError] = createSignal<string>();

    /** The tables a column can link to, offered alongside the scalar types. */
    const linkTargets = () => (props.doc.trackSchema(), props.doc.schema.cellsOf(Entity));

    const columnName = (index: number) =>
        nameEdits()[index] ?? props.plan.columns[index]?.name ?? "";
    const columnType = (index: number): SheetColumnTag =>
        typeEdits()[index] ?? props.plan.columns[index]?.proposedType ?? "String";

    /** Whether one cell text would be left unset under a column type. */
    const cellUnset = (text: string, type: SheetColumnTag): boolean => {
        if (isLinkTag(type)) {
            return (
                text.trim() !== "" &&
                resolveLinkTarget(props.doc, linkTagEntity(type), text) === undefined
            );
        }
        return !cellParsesAs(text, type);
    };

    const droppedCount = (index: number) => {
        const type = columnType(index);
        return (props.plan.columns[index]?.values ?? []).filter((value) => cellUnset(value, type))
            .length;
    };
    const totalDropped = createMemo(() =>
        props.plan.columns.reduce((sum, _column, index) => sum + droppedCount(index), 0),
    );

    const creation = (): SheetTableCreation => ({
        entityName: entityName().trim(),
        columns: props.plan.columns.map((_column, index) => ({
            name: columnName(index).trim(),
            type: columnType(index),
        })),
        rows: props.plan.rows,
    });

    const apply = async () => {
        try {
            await props.doc.applySheetTableCreation(creation());
            props.onApplied();
        } catch (error) {
            setApplyError(error instanceof Error ? error.message : String(error));
        }
    };

    return (
        <wired-dialog open elevation="4">
            <div class={styles.dialog} role="dialog" aria-labelledby="make-table-title">
                <header class={styles.header}>
                    <p class={styles.eyebrow}>Free sheet</p>
                    <h2 id="make-table-title">Make a table from these columns</h2>
                    <p>
                        The selected columns become a new entity with one attribute per column, and
                        each data row becomes a row of its instance. The claimed columns are removed
                        from the sheet.
                    </p>
                </header>

                <section class={styles.section}>
                    <label class={styles.entityName}>
                        <span>Table name</span>
                        <input
                            value={entityName()}
                            onInput={(event) => setEntityName(event.currentTarget.value)}
                        />
                    </label>
                </section>

                <section class={styles.section}>
                    <div class={styles.summary}>
                        <div>
                            <strong>{props.plan.columns.length}</strong>
                            <span>columns</span>
                        </div>
                        <div>
                            <strong>{props.plan.rows.length}</strong>
                            <span>rows</span>
                        </div>
                        <div classList={{ [styles.problem ?? ""]: totalDropped() > 0 }}>
                            <strong>{totalDropped()}</strong>
                            <span>values left unset</span>
                        </div>
                    </div>
                </section>

                <section class={styles.section}>
                    <div class={styles.previewHeading}>
                        <h3>Columns and preview</h3>
                        <Show when={props.plan.rows.length > PREVIEW_ROWS}>
                            <span>
                                first {PREVIEW_ROWS} of {props.plan.rows.length} rows
                            </span>
                        </Show>
                    </div>
                    <div class={styles.tableScroller}>
                        <table class={`jss_worksheet ${styles.preview}`}>
                            <thead>
                                <tr>
                                    <For each={props.plan.columns}>
                                        {(_column, index) => (
                                            <td data-x={index()}>
                                                <input
                                                    class={styles.columnNameInput}
                                                    aria-label={`Attribute name for column ${
                                                        index() + 1
                                                    }`}
                                                    value={columnName(index())}
                                                    onInput={(event) =>
                                                        setNameEdits((current) => ({
                                                            ...current,
                                                            [index()]: event.currentTarget.value,
                                                        }))
                                                    }
                                                />
                                            </td>
                                        )}
                                    </For>
                                </tr>
                                <tr class={styles.typeRow}>
                                    <For each={props.plan.columns}>
                                        {(_column, index) => (
                                            <td data-x={index()}>
                                                <select
                                                    aria-label={`Column type for ${
                                                        columnName(index()) ||
                                                        `column ${index() + 1}`
                                                    }`}
                                                    onChange={(event) =>
                                                        setTypeEdits((current) => ({
                                                            ...current,
                                                            [index()]: event.currentTarget
                                                                .value as SheetColumnTag,
                                                        }))
                                                    }
                                                >
                                                    <For each={ATTR_TYPE_NAMES}>
                                                        {(name) => (
                                                            <option
                                                                value={name}
                                                                selected={
                                                                    columnType(index()) === name
                                                                }
                                                            >
                                                                {name}
                                                            </option>
                                                        )}
                                                    </For>
                                                    <For each={linkTargets()}>
                                                        {(target) => (
                                                            <option
                                                                value={linkTag(target.id)}
                                                                selected={
                                                                    columnType(index()) ===
                                                                    linkTag(target.id)
                                                                }
                                                            >
                                                                Link to{" "}
                                                                {target.label || "(unnamed)"}
                                                            </option>
                                                        )}
                                                    </For>
                                                </select>
                                                <Show when={droppedCount(index()) > 0}>
                                                    <small class={styles.dropNote}>
                                                        {droppedCount(index())} unset
                                                    </small>
                                                </Show>
                                            </td>
                                        )}
                                    </For>
                                </tr>
                            </thead>
                            <tbody>
                                <For each={props.plan.rows.slice(0, PREVIEW_ROWS)}>
                                    {(row) => (
                                        <tr>
                                            <For each={props.plan.columns}>
                                                {(_column, index) => (
                                                    <td
                                                        classList={{
                                                            [styles.invalidCell ?? ""]: cellUnset(
                                                                row[index()] ?? "",
                                                                columnType(index()),
                                                            ),
                                                        }}
                                                    >
                                                        {row[index()] ?? ""}
                                                    </td>
                                                )}
                                            </For>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                    <Show when={props.plan.rows.length === 0}>
                        <p class={styles.noChanges}>
                            No data rows in the selection — the table starts empty.
                        </p>
                    </Show>
                </section>

                <Show when={totalDropped() > 0}>
                    <p class={styles.warning} role="alert">
                        Highlighted values do not fit their column's type — or match no row of the
                        linked table — and will be left unset.
                    </p>
                </Show>
                <Show when={applyError()}>
                    {(message) => <p class={styles.warning}>{message()}</p>}
                </Show>

                <footer class={styles.actions}>
                    <wired-button onClick={props.onCancel}>Cancel</wired-button>
                    <wired-button onClick={apply}>Create table</wired-button>
                </footer>
            </div>
        </wired-dialog>
    );
}
