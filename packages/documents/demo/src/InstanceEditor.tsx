import { createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js";

import type { DiagramValidationResult } from "catcolab-documents";
import type { DemoDocument } from "./document";
import { FreeSheet } from "./FreeSheet";
import { HistorySidebar } from "./HistorySidebar";
import { HistoryToggle } from "./HistoryToggle";
import { tableSpecs } from "./instance-model";
import { InstanceMillerEditor } from "./InstanceMillerEditor";
import { SketchSeparator } from "./Rough";
import { TablesView } from "./TablesView";

import styles from "./InstanceEditor.module.css";

/**
 * The right-hand instance editor. It renders one spreadsheet table per schema
 * entity, following the demo's structural rules:
 *
 *  - entity added / deleted  -> a table appears / disappears;
 *  - morphism added / deleted, or its domain changed -> a column appears /
 *    disappears in the appropriate table;
 *  - a mapping's codomain changed -> foreign-key cells pointing at rows of the
 *    old codomain are shown as invalid.
 *
 * Presentation preferences are keyed by entity and morphism UUIDs and persisted
 * separately from the document, so layout changes do not enter undo history.
 */
/** The instance panel's view modes. */
type EditorMode = "tables" | "columns" | "sheet";

export function InstanceEditor(props: {
    doc: DemoDocument;
    active: () => boolean;
    onActivate: () => void;
}) {
    const doc = () => props.doc;

    const specs = createMemo(() => {
        doc().trackSchema();
        doc().trackInstance();
        return tableSpecs(doc());
    });

    const [historyOpen, setHistoryOpen] = createSignal(false);
    const [editorMode, setEditorMode] = createSignal<EditorMode>("tables");

    return (
        <div
            class={styles.panelLayout}
            onFocusIn={() => props.onActivate()}
            onPointerDown={() => props.onActivate()}
        >
            <div class={styles.panelColumn}>
                <div class={styles.panel}>
                    <div class={styles.header}>
                        <SketchSeparator edge="bottom" seed={83} />
                        <div class={styles.headerLeft}>
                            <h2>Instance</h2>
                            <ValidationBadge doc={doc()} />
                        </div>
                        <div class={styles.headerRight}>
                            <wired-radio-group
                                class={styles.viewSwitch}
                                aria-label="Instance editor view"
                                selected={editorMode()}
                                on:selected={(event) =>
                                    setEditorMode(event.detail.selected as EditorMode)
                                }
                            >
                                <wired-radio name="tables" checked={editorMode() === "tables"}>
                                    Tables
                                </wired-radio>
                                <wired-radio name="columns" checked={editorMode() === "columns"}>
                                    Columns
                                </wired-radio>
                                <wired-radio name="sheet" checked={editorMode() === "sheet"}>
                                    Sheet
                                </wired-radio>
                            </wired-radio-group>
                            <HistoryToggle
                                open={historyOpen()}
                                onToggle={() => setHistoryOpen((v) => !v)}
                            />
                        </div>
                    </div>
                    <Switch>
                        {/* The sheet is usable with an empty schema: it is where
                            tables come from in the first place. */}
                        <Match when={editorMode() === "sheet"}>
                            <FreeSheet doc={doc()} />
                        </Match>
                        <Match when={specs().length === 0}>
                            <div class={styles.empty}>
                                Add an entity on the left to edit its instance, or switch to Sheet
                                to start from free-form data.
                            </div>
                        </Match>
                        <Match when={editorMode() === "tables"}>
                            <TablesView doc={doc()} />
                        </Match>
                        <Match when={editorMode() === "columns"}>
                            <InstanceMillerEditor doc={doc()} />
                        </Match>
                    </Switch>
                </div>
            </div>
            <Show when={historyOpen()}>
                <HistorySidebar history={doc().instanceHistory} active={props.active} />
            </Show>
        </div>
    );
}

/** A live validity badge from `instance.onValidate()`. */
function ValidationBadge(props: { doc: DemoDocument }) {
    // The observer follows the instance's own rows *and* the schema's whole
    // model tree through the elaboration cache, so no manual subscription to
    // the schema is needed, and equivalent results are never re-delivered.
    const [validation, setValidation] = createSignal<DiagramValidationResult>();
    const unsubscribe = props.doc.instance.onValidate(setValidation);
    onCleanup(unsubscribe);

    const displayTag = () => validation()?.tag ?? "Checking";

    return (
        <span class={styles.badge} data-tag={displayTag()}>
            {displayTag()}
        </span>
    );
}
