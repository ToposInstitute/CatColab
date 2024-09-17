import { destructure } from "@solid-primitives/destructure";
import { For, Match, Show, Switch, createEffect, createSignal } from "solid-js";

/** Schema for a column in a table editor. */
export type ColumnSchema<Row> = {
    /** Name of column. */
    name?: string;

    /** Is the column a header? */
    header?: boolean;

    /** Content of the column at the given row. */
    content: (row: Row) => string;

    /** Is the text valid as content for the column at the given row?

    If not specified, any content is considered valid.
     */
    validate?: (row: Row, text: string) => boolean;

    /** Sets the content for the columns at the given row, if possible.

    Returns whether setting the content was successful. If not specified, the
    column is not editable.
     */
    setContent?: (row: Row, text: string) => boolean;
};

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
            <CellEditor row={row()} schema={schema()} />
        </Show>
    );
}

function CellEditor<Row>(props: {
    row: Row;
    schema: ColumnSchema<Row>;
}) {
    const { row, schema } = destructure(props);
    const [text, setText] = createSignal("");

    createEffect(() => {
        setText(schema().content(row()));
    });

    const applyText = (text: string) => {
        if (!schema().setContent?.(row(), text)) {
            setText(schema().content(row()));
        }
    };

    return (
        <input
            class="fixed-table-cell-input"
            type="text"
            size="1"
            value={text()}
            onInput={(evt) => setText(evt.target.value)}
            onChange={(evt) => applyText(evt.target.value)}
        />
    );
}
