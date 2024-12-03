import { destructure } from "@solid-primitives/destructure";
import { For, Match, Show, Switch, createEffect, createSignal } from "solid-js";

import "./fixed_table_editor.css";

type ContentType = "string" | "boolean";

type BaseColumnSchema<Row, Content> = {
    /** Type of content displayed in the column. */
    contentType: ContentType;

    /** Name of column. */
    name?: string;

    /** Is the column a header? */
    header?: boolean;

    /** Content of the column at the given row. */
    content: (row: Row) => Content;

    /** Is the text valid as content for the column at the given row?

    If not specified, any content is considered valid.
     */
    validate?: (row: Row, content: Content) => boolean;

    /** Sets the content for the columns at the given row, if possible.

    Returns whether setting the content was successful. If not specified, the
    column is not editable.
     */
    setContent?: (row: Row, content: Content) => boolean;
};

/** Schema for a text column in a table editor. */
export type TextColumnSchema<Row> = BaseColumnSchema<Row, string> & {
    contentType: "string";
};

/** Schema for a boolean column in a table editor. */
export type BooleanColumnSchema<Row> = BaseColumnSchema<Row, boolean> & {
    contentType: "boolean";
};

/** Schema for a column in a table editor. */
export type ColumnSchema<Row> = TextColumnSchema<Row> | BooleanColumnSchema<Row>;

/** Create schema for a column with numerical (floating point) data. */
export const createNumericalColumn = <Row,>(args: {
    name?: string;
    header?: boolean;
    data: (row: Row) => number | undefined;
    default?: number;
    validate?: (row: Row, data: number) => boolean;
    setData?: (row: Row, data: number) => void;
}): TextColumnSchema<Row> => ({
    contentType: "string",
    name: args.name,
    header: args.header,
    content: (row) => {
        let value = args.data(row);
        if (value === undefined) {
            value = args.default ?? 0;
            args.setData?.(row, value);
        }
        return value.toString();
    },
    validate: (row, text) => {
        const parsed = Number(text);
        return !Number.isNaN(parsed) && (args.validate?.(row, parsed) ?? true);
    },
    setContent:
        args.setData &&
        ((row, text) => {
            const parsed = Number(text);
            const isValid = !Number.isNaN(parsed) && (args.validate?.(row, parsed) ?? true);
            if (isValid) {
                args.setData?.(row, parsed);
            }
            return isValid;
        }),
});

/** Edit tabular data given by a fixed list of rows.

Displays tabular data given row-wise. The content of individual cells can be
edited but the rows and columns are fixed. The rows are given as a list of data
whereas the columns are specified abstractly by functions on the rows.
 */
export function FixedTableEditor<Row>(props: {
    rows: Array<Row>;
    schema: Array<ColumnSchema<Row>>;
}) {
    return (
        <table class="fixed-table-editor">
            <thead>
                <tr>
                    <For each={props.schema}>{(col) => <th scope="col">{col.name}</th>}</For>
                </tr>
            </thead>
            <tbody>
                <For each={props.rows}>
                    {(row) => (
                        <tr>
                            <For each={props.schema}>
                                {(col) => (
                                    <Switch>
                                        <Match when={col.header}>
                                            <th scope="row">
                                                <Cell row={row} schema={col} />
                                            </th>
                                        </Match>
                                        <Match when={true}>
                                            <td>
                                                <Cell row={row} schema={col} />
                                            </td>
                                        </Match>
                                    </Switch>
                                )}
                            </For>
                        </tr>
                    )}
                </For>
            </tbody>
        </table>
    );
}

function Cell<Row>(props: {
    row: Row;
    schema: ColumnSchema<Row>;
}) {
    const { row, schema } = destructure(props);
    return (
        <Show when={schema().setContent} fallback={schema().content(row())}>
            <Switch>
                <Match when={props.schema.contentType === "string" && props.schema}>
                    {(schema) => <TextCellEditor row={row()} schema={schema()} />}
                </Match>
                <Match when={props.schema.contentType === "boolean" && props.schema}>
                    {(schema) => <BooleanCellEditor row={row()} schema={schema()} />}
                </Match>
            </Switch>
        </Show>
    );
}

function TextCellEditor<Row>(props: {
    row: Row;
    schema: TextColumnSchema<Row>;
}) {
    const { row, schema } = destructure(props);

    const [text, setText] = createSignal("");
    createEffect(() => setText(schema().content(row())));

    const applyText = (text: string) => {
        if (!schema().setContent?.(row(), text)) {
            setText(schema().content(row()));
        }
    };

    const [isValid, setIsValid] = createSignal(true);
    createEffect(() => setIsValid(schema().validate?.(row(), text()) ?? true));

    return (
        <input
            class="fixed-table-cell-input"
            classList={{
                invalid: !isValid(),
            }}
            type="text"
            size="1"
            value={text()}
            onInput={(evt) => setText(evt.target.value)}
            onChange={(evt) => applyText(evt.target.value)}
        />
    );
}

function BooleanCellEditor<Row>(props: {
    row: Row;
    schema: BooleanColumnSchema<Row>;
}) {
    const { row, schema } = destructure(props);

    return (
        <input
            class="fixed-table-cell-input"
            type="checkbox"
            checked={schema().content(row())}
            onInput={(evt) => schema().setContent?.(row(), evt.currentTarget.checked)}
        />
    );
}
