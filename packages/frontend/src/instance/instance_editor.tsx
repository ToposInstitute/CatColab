import { createMemo, createResource, Index, onCleanup, Show } from "solid-js";

import type { Result, TableIssue } from "catcolab-documents";
import { type FocusHandle, Spinner, TableEditor, useChildFocus } from "catcolab-ui-components";
import type { ApiInstance } from "./live_doc_compatibility";

import styles from "./instance_editor.module.css";

/** Editor for the data instance of a model. */
export function InstanceEditor(props: { instance: ApiInstance; focus: FocusHandle }) {
    // oxlint-disable-next-line solid/reactivity -- The editor is keyed on the instance.
    const view = props.instance.createValidationView();
    onCleanup(() => view.dispose());

    // The view reports a pending issue and no tables until the schema has been
    // validated once, so wait for that before rendering anything.
    const [ready] = createResource(() => props.instance.validate().then(() => true));

    const issues = createMemo(() => view.issues);
    const tables = createMemo(() => view.tables);

    const issuesForTable = (tableId: string): TableIssue[] =>
        issues().filter((issue) => issue.path[0] === tableId && issue.issueType !== "MissingValue");

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
                    <div class={styles.tables}>
                        <Index each={tables()}>
                            {(table) => (
                                <TableEditor
                                    table={table()}
                                    tables={tables()}
                                    issues={issuesForTable(table().id)}
                                    focus={focus.childFocus(table().id)}
                                    onSetField={(row, header, value) =>
                                        void props.instance
                                            .set(row, header, value)
                                            .then(logError("set field"))
                                    }
                                    onAddRow={() =>
                                        void props.instance
                                            .addRow(table())
                                            .then(logError("add row"))
                                    }
                                    onDeleteRow={(row) =>
                                        props.instance.deleteRow(table().id, row.id)
                                    }
                                />
                            )}
                        </Index>
                    </div>
                </Show>
            </Show>
        </div>
    );
}
