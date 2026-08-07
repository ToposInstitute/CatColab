import Plus from "lucide-solid/icons/plus";
import { createEffect, createResource, For, onCleanup, Show } from "solid-js";
import { match, P } from "ts-pattern";

import {
    type Column,
    type Instance,
    type InstanceTable,
    type Row,
    type TableCell,
} from "catcolab-documents";
import { Button, type ColumnSchema, FixedTableEditor } from "catcolab-ui-components";

import styles from "./instance_editor.module.css";

export function InstanceEditor(props: { instance: Instance }) {
    const [tables, { refetch }] = createResource(
        () => props.instance,
        (instance) => instance.tables(),
    );

    // Re-list the tables whenever validation re-runs: it triggers on changes to
    // the instance's own rows and to any document in its schema's instantiation
    // tree, so added/removed/renamed entities and columns are picked up. Row
    // and cell edits between refetches are already live: a table's `label`,
    // `rows`, and `columns` read through to the (reactive) documents on each
    // access.
    createEffect(() => {
        const unsubscribe = props.instance.onValidate(() => refetch());
        onCleanup(unsubscribe);
    });

    return (
        <div class={styles.editor}>
            <Show when={tables()}>
                {(tables) => (
                    <For each={tables()} fallback={<p>This model has no entity types.</p>}>
                        {(table) => <TableEditor table={table} tables={tables()} />}
                    </For>
                )}
            </Show>
        </div>
    );
}

/** One instance table: its entity's label, an add-row button, and the grid. */
function TableEditor(props: { table: InstanceTable; tables: InstanceTable[] }) {
    return (
        <section class={styles.table}>
            <div class={styles.header}>
                <h3>
                    <Show when={props.table.label} fallback={<UnnamedLabel />}>
                        {(label) => label()}
                    </Show>
                </h3>
                <Button onClick={() => props.table.addRow()}>
                    <Plus size={16} /> Add row
                </Button>
            </div>
            <FixedTableEditor
                rows={props.table.rows}
                schema={tableSchema(props.table, props.tables)}
            />
        </section>
    );
}

function tableSchema(table: InstanceTable, tables: InstanceTable[]): ColumnSchema<Row>[] {
    return [
        rowNumberColumn,
        ...table.columns.flatMap((column, index) => columnSchema(column, index, tables) ?? []),
    ];
}

/** The header column numbering each row by its position in the table. */
const rowNumberColumn: ColumnSchema<Row> = {
    contentType: "string",
    name: "",
    header: true,
    content: (row) => rowNumberLabel(row.index),
};

/**
 * The editor column for one schema column: an enum of the target table's rows
 * for a mapping, a literal text cell for an attribute. A column whose codomain
 * does not resolve is dropped — the schema does not validate, and validation
 * owns surfacing that.
 */
function columnSchema(
    column: Column,
    index: number,
    tables: InstanceTable[],
): ColumnSchema<Row> | undefined {
    const target = tables.find((table) => table.id === column.to?.id);
    if (target) {
        return mappingColumn(column, index, target);
    }
    if (column.to) {
        return attributeColumn(column, index);
    }
    return undefined;
}

/** A string cell reading and writing a row's literal attribute value. */
function attributeColumn(column: Column, index: number): ColumnSchema<Row> {
    return {
        contentType: "string",
        ...columnHeader(column),
        content: (row) => literalText(cellAt(row, index)),
        setContent: (row, text) => {
            row.set(column, text || undefined);
            return true;
        },
    };
}

/** An enum cell selecting the target row a mapping column links to. */
function mappingColumn(column: Column, index: number, target: InstanceTable): ColumnSchema<Row> {
    return {
        contentType: "enum",
        ...columnHeader(column),
        variants: () => ["", ...target.rows.map((row) => rowNumberLabel(row.index))],
        content: (row) =>
            match(cellAt(row, index))
                // A dangling link (deleted target row) has index -1.
                .with({ Row: P.any }, ({ Row: linked }) =>
                    linked.index < 0 ? null : rowNumberLabel(linked.index),
                )
                .otherwise(() => null),
        setContent: (row, value) => {
            // No matching target row (the "" variant) clears the mapping.
            row.set(
                column,
                target.rows.find((linked) => rowNumberLabel(linked.index) === value),
            );
        },
    };
}

/** The cell under the table's `index`-th column: `row.cells` align with `table.columns`. */
const cellAt = (row: Row, index: number): TableCell => row.cells[index] ?? "Null";

/** Display text of a literal cell; empty for `"Null"` or a linked row. */
const literalText = (cell: TableCell): string =>
    match(cell)
        .with({ Bool: P.boolean }, ({ Bool: value }) => String(value))
        .with({ Int: P.number }, ({ Int: value }) => String(value))
        .with({ Float: P.number }, ({ Float: value }) => String(value))
        .with({ String: P.string }, ({ String: value }) => value)
        .with(P.union("Null", { Row: P.any }), () => "")
        .exhaustive();

/** Placeholder for an entity or column that its schema leaves unnamed. */
const UnnamedLabel = () => <span class={styles.unnamed}>Unnamed</span>;

/** Header of a column, greyed out when the schema leaves the column unnamed. */
const columnHeader = (column: Column) =>
    column.label ? { name: column.label } : { name: "Unnamed", nameClass: styles.unnamed };

const rowNumberLabel = (index: number) => String(index + 1);
