import File from "lucide-solid/icons/file";
import Menu from "lucide-solid/icons/menu";
import Table from "lucide-solid/icons/table";
import Table2 from "lucide-solid/icons/table-2";
import { createMemo, For } from "solid-js";

import type { DemoDocument } from "./document";
import { tableSpecs } from "./instance-model";
import { SketchSeparator } from "./Rough";
import { reconcileTableLayout } from "./table-layout";
import { collapseTable, raiseTable, savedTableLayout } from "./table-layout-store";

import styles from "./FileSidebar.module.css";

/**
 * A mockup of the frontend's document sidebar: a fixed left panel listing the
 * demo's "files" with type icons and tree indentation. The "Schema" and
 * "Instance" rows are inert stand-ins, but the instance's tables are listed
 * live beneath them: selecting a table expands it and raises its grid to the
 * top of the instance panel (via the shared table-layout store), and selecting
 * it again deselects it, closing the grid. This replaces the tab rail the
 * panel used to have. The list is not reorderable and the right edge is a
 * hand-drawn wave like the demo's other panel seams.
 */
export function FileSidebar(props: { doc: DemoDocument }) {
    const doc = () => props.doc;

    const specs = createMemo(() => {
        doc().trackSchema();
        doc().trackInstance();
        return tableSpecs(doc());
    });

    // The same reconciled layout the instance panel renders from, so the list
    // order and expanded highlights always agree with the grids.
    const layout = createMemo(() =>
        reconcileTableLayout(
            savedTableLayout(),
            specs().map((spec) => ({
                id: spec.entity.id,
                columnIds: spec.columns.map((column) => column.morphismId),
            })),
        ),
    );

    const orderedTables = createMemo(() => {
        const byId = new Map(specs().map((spec) => [spec.entity.id, spec]));
        return layout().tableOrder.flatMap((id) => {
            const spec = byId.get(id);
            return spec ? [spec] : [];
        });
    });

    // A table is "expanded" when its grid is showing: raised at some point and
    // not since collapsed.
    const expandedIds = createMemo(() => {
        const collapsed = new Set(layout().hiddenTables);
        return new Set(layout().expandedOrder.filter((id) => !collapsed.has(id)));
    });

    return (
        <div class={styles.sidebar}>
            <SketchSeparator edge="right" seed={61} />
            <div class={styles.header}>
                <Menu size={18} />
            </div>
            <div class={styles.tree}>
                <div
                    class={`${styles.file} ${styles.active}`}
                    style={{ "padding-left": `${1 * 16}px` }}
                >
                    <File size={16} />
                    <div class={styles.fileName}>Schema</div>
                </div>
                <div class={styles.file} style={{ "padding-left": `${2 * 16}px` }}>
                    <Table2 size={16} />
                    <div class={styles.fileName}>Instance</div>
                </div>
                <For each={orderedTables()}>
                    {(spec) => {
                        const expanded = () => expandedIds().has(spec.entity.id);
                        return (
                            <button
                                type="button"
                                class={`${styles.file} ${styles.clickable}`}
                                classList={{ [styles.active ?? ""]: expanded() }}
                                style={{ "padding-left": `${3 * 16}px` }}
                                aria-pressed={expanded()}
                                onClick={() =>
                                    expanded()
                                        ? collapseTable(spec.entity.id)
                                        : raiseTable(spec.entity.id)
                                }
                            >
                                <Table size={16} />
                                <div class={styles.fileName}>{spec.entity.label || "Unnamed"}</div>
                            </button>
                        );
                    }}
                </For>
            </div>
        </div>
    );
}
