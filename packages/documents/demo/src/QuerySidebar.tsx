import jspreadsheet from "jspreadsheet-ce";
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    on,
    onCleanup,
    onMount,
    Show,
} from "solid-js";

import { CodeView } from "catcolab-ui-components";
import { projectDataScript, queryDataScript, type QueryTable } from "./datascript";
import type { DemoDocument } from "./document";
import { SketchSeparator } from "./Rough";

import "jspreadsheet-ce/dist/jspreadsheet.css";
import "jspreadsheet-ce/dist/jspreadsheet.themes.css";
import "jsuites/dist/jsuites.css";
import styles from "./QuerySidebar.module.css";

export const DEFAULT_QUERY = `;; Query for the entity types
[:find ?entity-name
 :where
 [?row "catcolab/entity" ?entity]
 [?entity "catcolab/label" ?entity-name]]`;
export const QUERY_STORAGE_KEY = "catcolab-instances-demo:query";

type QueryStatus = { tag: "ok"; message: string } | { tag: "error"; message: string };

/** A live Datalog query editor over a DataScript projection of the demo document. */
export function QuerySidebar(props: {
    doc: DemoDocument;
    source: string;
    onSourceChange: (value: string) => void;
}) {
    const projection = createMemo(() => {
        props.doc.trackSchema();
        props.doc.trackInstance();
        return projectDataScript(props.doc);
    });
    const [result, setResult] = createSignal<QueryTable>();
    const [status, setStatus] = createSignal<QueryStatus>();
    const [lastQuery, setLastQuery] = createSignal<string>();

    const execute = (source: string, current = projection()) => {
        try {
            const table = queryDataScript(current, source);
            setResult(table);
            setStatus({
                tag: "ok",
                message: `${table.rows.length} ${table.rows.length === 1 ? "result" : "results"}`,
            });
        } catch (error) {
            setResult(undefined);
            setStatus({
                tag: "error",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };

    const run = () => {
        setLastQuery(props.source);
        execute(props.source);
    };

    // Keep an already-run query live as schema and instance edits rebuild the projection.
    createEffect(
        on(
            projection,
            (current) => {
                const source = lastQuery();
                if (source) {
                    execute(source, current);
                }
            },
            { defer: true },
        ),
    );

    const onKeyDown = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            run();
        }
    };

    // Match the Script editor: grow the transparent textarea to its content so
    // the surrounding editor area scrolls it and the highlighted layer together.
    let textareaEl: HTMLTextAreaElement | undefined;
    const autoGrow = () => {
        if (textareaEl) {
            textareaEl.style.height = "0px";
            textareaEl.style.height = `${textareaEl.scrollHeight}px`;
        }
    };
    const update = (value: string) => {
        props.onSourceChange(value);
        autoGrow();
    };
    onMount(autoGrow);
    createEffect(on(() => props.source, autoGrow));

    return (
        <section class={styles.querySidebar} aria-label="DataScript query">
            <header class={styles.header}>
                <SketchSeparator edge="bottom" seed={149} />
                <span>DataScript Query</span>
                <a
                    href="https://github.com/schalkwijk/learndatalogtoday/blob/master/resources/chapters/chapter-0.md"
                    target="_blank"
                    rel="noreferrer"
                >
                    Datalog reference
                </a>
            </header>
            <div class={styles.body}>
                <div class={styles.editorColumn}>
                    <div class={styles.editorArea}>
                        <div class={styles.highlight} aria-hidden="true">
                            <CodeView text={`${props.source}\n`} lang="clojure" />
                        </div>
                        <textarea
                            ref={textareaEl}
                            class={styles.editor}
                            spellcheck={false}
                            autocomplete="off"
                            autocapitalize="off"
                            value={props.source}
                            onInput={(event) => update(event.currentTarget.value)}
                            onKeyDown={onKeyDown}
                            aria-label="Datalog query"
                        />
                    </div>
                    <div class={styles.footer}>
                        <SketchSeparator edge="top" seed={151} />
                        <wired-button class={styles.runButton} elevation="2" onClick={run}>
                            Run query
                        </wired-button>
                        <Show when={status()}>
                            {(current) => (
                                <span class={styles.status} data-tag={current().tag}>
                                    {current().message}
                                </span>
                            )}
                        </Show>
                    </div>
                </div>
                <div class={styles.results}>
                    <Show when={result()} fallback={<div class={styles.emptyResult}></div>}>
                        {(table) => (
                            <Show
                                when={table().rows.length > 0}
                                fallback={
                                    <div class={styles.emptyResult}>
                                        The query returned no rows.
                                    </div>
                                }
                            >
                                <QueryResultsGrid table={table()} />
                            </Show>
                        )}
                    </Show>
                    <details class={styles.schemaHelp}>
                        <summary>Available attributes</summary>
                        <dl>
                            <dt>"catcolab/row-id"</dt>
                            <dd>Stable row UUID</dd>
                            <dt>"catcolab/entity"</dt>
                            <dd>Reference from a row to its schema entity</dd>
                            <dt>"catcolab/schema-id"</dt>
                            <dd>Stable schema-cell UUID</dd>
                            <dt>"catcolab/label"</dt>
                            <dd>Schema-cell label</dd>
                            <For each={projection().attributes}>
                                {(attribute) => (
                                    <>
                                        <dt>"{attribute.attribute}"</dt>
                                        <dd>
                                            {attribute.kind} {attribute.entityLabel}.
                                            {attribute.label}
                                        </dd>
                                    </>
                                )}
                            </For>
                        </dl>
                    </details>
                </div>
            </div>
        </section>
    );
}

/** A read-only jspreadsheet worksheet for a normalized DataScript result relation. */
function QueryResultsGrid(props: { table: QueryTable }) {
    let container!: HTMLDivElement;
    let worksheet: jspreadsheet.WorksheetInstance | undefined;
    const host = () => container as unknown as Parameters<typeof jspreadsheet.destroy>[0];

    const destroy = () => {
        if (!worksheet) {
            return;
        }
        jspreadsheet.destroy(host(), true);
        worksheet = undefined;
        container.replaceChildren();
        container.removeAttribute("class");
        container.removeAttribute("style");
    };

    const rebuild = () => {
        destroy();
        const options: jspreadsheet.SpreadsheetOptions = {
            tabs: false,
            worksheets: [
                {
                    data: props.table.rows.map((row) =>
                        props.table.columns.map((_, index) => formatCell(row[index])),
                    ),
                    columns: props.table.columns.map((column) => ({
                        type: "text",
                        title: column,
                        width: 220,
                        readOnly: true,
                    })),
                    minDimensions: [props.table.columns.length, 0],
                    editable: false,
                    allowComments: false,
                    allowDeleteColumn: false,
                    allowDeleteRow: false,
                    allowInsertColumn: false,
                    allowInsertRow: false,
                    allowManualInsertColumn: false,
                    allowManualInsertRow: false,
                    allowRenameColumn: false,
                    columnDrag: false,
                    columnResize: false,
                    columnSorting: true,
                    rowDrag: false,
                    rowResize: false,
                },
            ],
        };
        const built = jspreadsheet(host(), options);
        worksheet = Array.isArray(built) ? built[0] : built;
    };

    createEffect(on(() => props.table, rebuild));
    onCleanup(destroy);

    return <div class={styles.tableScroller} ref={container} />;
}

function formatCell(value: unknown): string {
    if (value === null) {
        return "null";
    }
    if (value === undefined) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}
