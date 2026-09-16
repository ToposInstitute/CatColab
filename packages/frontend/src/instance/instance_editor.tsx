import { createEffect, createMemo, createResource, For, onCleanup, Show } from "solid-js";

import type { Result, TableIssue } from "catcolab-documents";
import { type FocusHandle, Spinner, TableEditor, useChildFocus } from "catcolab-ui-components";
import type { ApiInstance } from "./live_doc_compatibility";
import { useTableList } from "./table_list";

import styles from "./instance_editor.module.css";

const NO_ISSUES: TableIssue[] = [];

function shallowEqualArrays<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean {
    return a.length === b.length && a.every((item, i) => item === b[i]);
}

/** Editor for the data instance of a model. */
export function InstanceEditor(props: {
    instance: ApiInstance;
    refId: string;
    focus: FocusHandle;
}) {
    // oxlint-disable-next-line solid/reactivity -- The editor is keyed on the instance.
    const view = props.instance.createValidationView();
    onCleanup(() => view.dispose());

    // The view reports a pending issue and no tables until the schema has been
    // validated once, so wait for that before rendering anything.
    const [ready] = createResource(() => props.instance.validate().then(() => true));

    const issues = createMemo(() => view.issues);
    const tables = createMemo(() => view.tables);

    const tableList = useTableList();
    createEffect(() => {
        if (ready()) {
            const refId = props.refId;
            tableList.setTables(
                refId,
                tables().map(({ id, label }) => ({ id, label })),
            );
            onCleanup(() => tableList.setTables(refId, undefined));
        }
    });

    // Editors are keyed by table id: a positional list would hand a hidden
    // table's editor the next table, re-deriving every cell at once.
    const visibleTableIds = createMemo(() =>
        tables()
            .filter((table) => tableList.isVisible(props.refId, table.id))
            .map((table) => table.id),
    );
    const tablesById = createMemo(() => new Map(tables().map((table) => [table.id, table])));

    // Issues grouped by table. Issue objects keep their identity across
    // validations, so a table's list is reused when its issues are unchanged
    // and its editor is not notified.
    const issuesByTable = createMemo((prev: ReadonlyMap<string, TableIssue[]>) => {
        const next = new Map<string, TableIssue[]>();
        for (const issue of issues()) {
            if (issue.issueType === "MissingValue") {
                continue;
            }
            const list = next.get(issue.path[0]) ?? [];
            list.push(issue);
            next.set(issue.path[0], list);
        }
        for (const [tableId, list] of next) {
            const previous = prev.get(tableId);
            if (previous && shallowEqualArrays(previous, list)) {
                next.set(tableId, previous);
            }
        }
        return next;
    }, new Map<string, TableIssue[]>());

    const issuesForTable = (tableId: string): TableIssue[] =>
        issuesByTable().get(tableId) ?? NO_ISSUES;

    // oxlint-disable-next-line solid/reactivity -- Focus handles are stable for a mounted editor.
    const focus = useChildFocus<string>(props.focus);

    const logError = (action: string) => (result: Result<unknown>) => {
        if (result.tag === "Err") {
            console.warn(`Failed to ${action}:`, result.content);
        }
    };

    return (
        <div class={styles.editor}>
            <Show when={ready()} fallback={<Spinner />}>
                <Show
                    when={tables().length > 0}
                    fallback={<p class={styles.empty}>This model has no tables.</p>}
                >
                    <Show
                        when={visibleTableIds().length > 0}
                        fallback={
                            <p class={styles.empty}>
                                All tables are hidden. Select a table in the sidebar to show it.
                            </p>
                        }
                    >
                        <div class={styles.tables}>
                            <For each={visibleTableIds()}>
                                {(tableId) => {
                                    const table = () => tablesById().get(tableId)!;
                                    return (
                                        <TableEditor
                                            table={table()}
                                            tables={tables()}
                                            issues={issuesForTable(tableId)}
                                            focus={focus.childFocus(tableId)}
                                            onHide={() => tableList.hide(props.refId, tableId)}
                                            onSetField={(row, header, value) =>
                                                props.instance
                                                    .set(row, header, value)
                                                    .then(logError("set field"))
                                            }
                                            onAddRow={() =>
                                                void props.instance
                                                    .addRow(table())
                                                    .then(logError("add row"))
                                            }
                                            onDeleteRow={(row) =>
                                                props.instance.deleteRow(tableId, row.id)
                                            }
                                            onDeleteOrphanedTable={() =>
                                                void props.instance
                                                    .deleteOrphanedTable(tableId)
                                                    .then(logError("delete table"))
                                            }
                                            onDeleteOrphanedColumn={(header) =>
                                                void props.instance
                                                    .deleteOrphanedColumn(tableId, header.id)
                                                    .then(logError("delete column"))
                                            }
                                        />
                                    );
                                }}
                            </For>
                        </div>
                    </Show>
                </Show>
            </Show>
        </div>
    );
}
