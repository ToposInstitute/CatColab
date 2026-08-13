import { Attr, Entity, Mapping } from "catcolab-logics/simple-schema";
import jspreadsheet from "jspreadsheet-ce";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";

import type { NotebookCell } from "catcolab-documents";
import { ATTR_TYPE_NAMES, type AttrTypeName, type DemoDocument } from "./document";
import { editHeaderInline } from "./header-edit";
import { tableSpecs, type TableSpec } from "./instance-model";
import type { AddColumnChoice } from "./InstanceTable";
import { MakeTableDialog } from "./MakeTableDialog";
import { SchemaChangeReviewDialog } from "./SchemaChangeReviewDialog";
import {
    columnLetters,
    insertColumnEntries,
    isLinkTag,
    linkTag,
    linkTagEntity,
    parsePersistedSheet,
    type PersistedSheet,
    planTableFromColumns,
    removeColumnEntries,
    removeColumns,
    setColumnEntry,
    SHEET_STORAGE_KEY,
    type SheetColumnRange,
    type SheetColumnTag,
    type SheetColumnTitles,
    type SheetColumnTypes,
    type SheetData,
    type SheetTablePlan,
    trimColumnEntries,
    trimSheetData,
} from "./sheet-model";
import { TablesView } from "./TablesView";

import "jspreadsheet-ce/dist/jspreadsheet.css";
import "jspreadsheet-ce/dist/jspreadsheet.themes.css";
import "jsuites/dist/jsuites.css";
import styles from "./FreeSheet.module.css";

/** The scratch grid's starting size; it grows as the user reaches the edges. */
const MIN_COLS = 12;
const MIN_ROWS = 40;
/** How much the grid grows by when an edit lands on its last row/column. */
const GROW_ROWS = 20;
const GROW_COLS = 4;
const COLUMN_WIDTH = 120;

/** A column title not already used by the table, from a preferred base. */
function uniqueColumnName(spec: TableSpec, base: string): string {
    const existing = new Set(spec.columns.map((column) => column.title));
    if (!existing.has(base)) {
        return base;
    }
    let n = 2;
    while (existing.has(`${base}-${n}`)) {
        n += 1;
    }
    return `${base}-${n}`;
}

/** Keep header interactions off the embedded header type selects. */
const stopEventPropagation = (event: Event) => event.stopPropagation();

/**
 * The Sheet mode: the instance's tables alongside a free-form, endless scratch
 * spreadsheet. The tables render as the same rail-and-grids workspace as the
 * Tables view ({@link TablesView}) — minimized tabs on the left, expanded
 * grids beside them, shared layout — plus this view's schema-editing column
 * affordances. The scratch grid below is schemaless — anything can be typed
 * anywhere, persisted to localStorage outside the documents — until the user
 * selects a column range and turns it into a table. The review dialog then
 * creates the entity, attributes, and rows through the ordinary document API,
 * so the new table appears in the workspace above (and in the schema panel)
 * immediately, and the claimed columns leave the scratch grid.
 */
export function FreeSheet(props: { doc: DemoDocument }) {
    const doc = () => props.doc;

    // The live tables, keyed by entity id so table components stay mounted
    // across schema/instance edits (the specs projection is rebuilt each time).
    const specs = createMemo(() => {
        doc().trackSchema();
        doc().trackInstance();
        return tableSpecs(doc());
    });
    const entityIds = createMemo(() => specs().map((spec) => spec.entity.id));
    const specFor = (entityId: string) =>
        specs().find((candidate) => candidate.entity.id === entityId) as TableSpec;

    /**
     * The "+ Column" menu: an explicitly typed attribute column, or a foreign
     * key linking to any table (including the table itself — self-references
     * are legitimate).
     */
    const addColumnChoices = (): AddColumnChoice[] => [
        { key: "attr:String", label: "Text" },
        { key: "attr:Float", label: "Number (Float)" },
        { key: "attr:Integer", label: "Whole number (Integer)" },
        { key: "attr:Boolean", label: "True / false (Boolean)" },
        ...specs().map((spec) => ({
            key: `link:${spec.entity.id}`,
            label: `Link to ${spec.entity.label || "(unnamed table)"}`,
        })),
    ];

    /** Add a column to a table: a typed attribute, or a mapping (foreign key). */
    const addColumn = (spec: TableSpec, key: string) => {
        // The spec holds a generic ObjectCell; `schema.add` wants the typed
        // entity cell, so look it up by id.
        const entity = doc()
            .schema.cellsOf(Entity)
            .find((candidate) => candidate.id === spec.entity.id);
        if (!entity) {
            return;
        }
        if (key.startsWith("link:")) {
            const target = doc()
                .schema.cellsOf(Entity)
                .find((candidate) => candidate.id === key.slice("link:".length));
            if (!target) {
                return;
            }
            // Foreign keys default to the target's name, like `orbits -> star`.
            const base =
                (target.label || "link")
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9_-]+/g, "-")
                    .replace(/^-+|-+$/g, "") || "link";
            doc().schema.add(Mapping, {
                label: uniqueColumnName(spec, base),
                from: entity,
                to: target,
            });
            return;
        }
        const type = ATTR_TYPE_NAMES.find((name) => key === `attr:${name}`) ?? ("String" as const);
        doc().schema.add(Attr, {
            label: uniqueColumnName(spec, `column-${spec.columns.length + 1}`),
            from: entity,
            to: doc().attrTypes[type],
        });
    };

    /** Rename the schema morphism (attribute or mapping) behind a column. */
    const renameColumn = (morphismId: string, title: string) => {
        const cell = [...doc().schema.cellsOf(Attr), ...doc().schema.cellsOf(Mapping)].find(
            (candidate) => candidate.id === morphismId,
        );
        cell?.update({ label: title.trim() });
    };

    // The attribute whose Float -> Integer change is being reviewed, if any.
    const [reviewAttribute, setReviewAttribute] = createSignal<NotebookCell<typeof Attr>>();

    /**
     * Change an attribute column's type, matching the schema editor's
     * semantics: a direct schema update, except Float -> Integer, which needs a
     * data migration and so opens the schema-change review dialog.
     */
    const changeColumnType = (morphismId: string, type: AttrTypeName) => {
        const cell = doc()
            .schema.cellsOf(Attr)
            .find((candidate) => candidate.id === morphismId);
        if (!cell) {
            return;
        }
        const current = cell.to?.label;
        if (current === type) {
            return;
        }
        if (current === "Float" && type === "Integer") {
            setReviewAttribute(cell);
            return;
        }
        cell.update({ to: doc().attrTypes[type] });
    };

    let container!: HTMLDivElement;
    const host = () => container as unknown as Parameters<typeof jspreadsheet.destroy>[0];
    let worksheet: jspreadsheet.WorksheetInstance | undefined;
    let disposed = false;
    // Explicit type tags and custom titles for the scratch columns
    // (index-aligned; null = auto / the default letter header). Plain mutable
    // state, not signals: they are read and written by the imperative header
    // controls and persisted alongside the cells.
    let columnTypes: SheetColumnTypes = [];
    let columnTitles: SheetColumnTitles = [];
    let scratchTypeCleanup: (() => void) | undefined;

    const [selection, setSelection] = createSignal<SheetColumnRange>();
    const [dialog, setDialog] = createSignal<{
        plan: SheetTablePlan;
        range: SheetColumnRange;
    }>();

    /** The scratch grid's current contents as plain strings. */
    const currentData = (): SheetData => {
        if (!worksheet) {
            return [];
        }
        return worksheet
            .getData(false, true)
            .map((row) =>
                row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))),
            );
    };

    // Persist on change, coalescing a burst (e.g. a paste) into one write.
    let persistScheduled = false;
    const schedulePersist = () => {
        if (persistScheduled) {
            return;
        }
        persistScheduled = true;
        queueMicrotask(() => {
            persistScheduled = false;
            if (disposed) {
                return;
            }
            try {
                const state: PersistedSheet = {
                    cells: trimSheetData(currentData()),
                    types: trimColumnEntries(columnTypes),
                    titles: trimColumnEntries(columnTitles),
                };
                localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(state));
            } catch (error) {
                console.warn("Could not persist the free sheet", error);
            }
        });
    };

    /** Keep the grid "endless": edits on the last row/column extend it. */
    const growIfNeeded = (x: number, y: number) => {
        if (!worksheet) {
            return;
        }
        const data = worksheet.getData();
        const rows = data.length;
        const cols = data[0]?.length ?? 0;
        if (y >= rows - 1) {
            worksheet.insertRow(GROW_ROWS);
        }
        if (x >= cols - 1) {
            worksheet.insertColumn(GROW_COLS);
        }
    };

    /** The "auto" option of a scratch column's type select. */
    const AUTO_TYPE = "auto";

    /**
     * The dropdown options for a link-tagged scratch column: the target rows'
     * *first attribute* values — exactly the texts {@link resolveLinkTarget}
     * matches first at Make-table time, so a picked option always resolves.
     */
    const linkSourceValues = (entityId: string): string[] => {
        const spec = specs().find((candidate) => candidate.entity.id === entityId);
        const firstAttr = spec?.columns.find((column) => column.kind === "attr");
        if (!spec || !firstAttr) {
            return [];
        }
        const values = spec.rows
            .flatMap((row) => {
                const value = doc().rowValue(spec.entity, row, firstAttr.morphismId);
                return value === undefined ? [] : [String(value)];
            })
            .filter((value) => value !== "");
        return [...new Set(values)];
    };

    /**
     * Add a type select to every scratch column's letter header: "auto" (the
     * type is inferred from the data at Make-table time), an explicit scalar
     * type, or a foreign key to an existing table — an explicit tag wins over
     * inference. Reinstalled after every grid build, after column
     * inserts/deletes (which regenerate header cells), and when the table set
     * changes (which changes the link options).
     */
    const installScratchTypeControls = () => {
        scratchTypeCleanup?.();
        scratchTypeCleanup = undefined;
        const headers = [
            ...container.querySelectorAll<HTMLTableCellElement>(
                "table.jss_worksheet thead td[data-x]",
            ),
        ];
        const cleanups: Array<() => void> = [];
        const stop = stopEventPropagation;
        const linkOptions = specs().map((spec) => ({
            value: linkTag(spec.entity.id),
            label: `→ ${spec.entity.label || "(unnamed)"}`,
        }));

        for (const header of headers) {
            const index = Number(header.dataset.x);
            if (!Number.isInteger(index)) {
                continue;
            }
            const select = document.createElement("select");
            select.className = styles.scratchTypeSelect ?? "";
            select.setAttribute("aria-label", `Type of column ${columnLetters(index)}`);
            for (const { value, label } of [
                { value: AUTO_TYPE, label: AUTO_TYPE },
                ...ATTR_TYPE_NAMES.map((name) => ({ value: name as string, label: name })),
                ...linkOptions,
            ]) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                select.append(option);
            }
            const applyTagStyle = () => {
                if (styles.scratchTypeTagged) {
                    select.classList.toggle(styles.scratchTypeTagged, select.value !== AUTO_TYPE);
                }
            };
            const current = columnTypes[index] ?? AUTO_TYPE;
            select.value = current;
            if (select.value !== current) {
                // A link tag whose table is gone: display auto, but keep the
                // tag — an undo can bring the table back.
                select.value = AUTO_TYPE;
            }
            applyTagStyle();
            const onChange = () => {
                const value = select.value;
                const previous = columnTypes[index] ?? null;
                const next = value === AUTO_TYPE ? null : (value as SheetColumnTag);
                columnTypes = setColumnEntry(columnTypes, index, next);
                applyTagStyle();
                schedulePersist();
                // Tagging (or untagging) a foreign key changes the column's
                // editor to/from a dropdown, which needs a grid rebuild.
                // Deferred: the rebuild destroys this very select.
                if (
                    (previous !== null && isLinkTag(previous)) ||
                    (next !== null && isLinkTag(next))
                ) {
                    queueMicrotask(rebuildScratch);
                }
            };
            select.addEventListener("change", onChange);
            select.addEventListener("pointerdown", stop);
            select.addEventListener("mousedown", stop);
            select.addEventListener("click", stop);
            select.addEventListener("dblclick", stop);
            header.append(select);
            cleanups.push(() => {
                select.removeEventListener("change", onChange);
                select.removeEventListener("pointerdown", stop);
                select.removeEventListener("mousedown", stop);
                select.removeEventListener("click", stop);
                select.removeEventListener("dblclick", stop);
            });
        }

        scratchTypeCleanup = () => {
            for (const cleanup of cleanups) {
                cleanup();
            }
        };
    };

    /** Reinstall the header type selects once jspreadsheet settles its DOM. */
    const reinstallScratchTypeControls = () => {
        queueMicrotask(() => {
            if (!disposed) {
                installScratchTypeControls();
            }
        });
    };

    /** (Re)create the jspreadsheet worksheet over the given scratch data. */
    const buildGrid = (data: SheetData) => {
        if (worksheet) {
            scratchTypeCleanup?.();
            scratchTypeCleanup = undefined;
            jspreadsheet.destroy(host(), true);
            worksheet = undefined;
            // v5 leaves its worksheet DOM inside the mutated host after
            // destroy, so recreating without clearing it duplicates the grid.
            container.replaceChildren();
            container.removeAttribute("class");
            container.removeAttribute("style");
        }
        const width = Math.max(MIN_COLS, ...data.map((row) => row.length));
        const options: jspreadsheet.SpreadsheetOptions = {
            tabs: false,
            worksheets: [
                {
                    data: data.length > 0 ? data : [[""]],
                    // Untitled columns keep their default letter header; a
                    // custom title is an editable name that will also name the
                    // table column when the columns are converted. A column
                    // tagged as a foreign key edits as a dropdown of the
                    // target table's rows.
                    columns: Array.from(
                        { length: width },
                        (_unused, index): jspreadsheet.Column => {
                            const base = {
                                width: COLUMN_WIDTH,
                                ...(columnTitles[index]
                                    ? { title: columnTitles[index] as string }
                                    : {}),
                            };
                            const tag = columnTypes[index];
                            if (tag !== null && tag !== undefined && isLinkTag(tag)) {
                                const target = linkTagEntity(tag);
                                if (entityIds().includes(target)) {
                                    return {
                                        ...base,
                                        type: "dropdown",
                                        autocomplete: true,
                                        source: linkSourceValues(target),
                                    };
                                }
                            }
                            return { ...base, type: "text" };
                        },
                    ),
                    minDimensions: [width, MIN_ROWS],
                    allowInsertRow: true,
                    allowInsertColumn: true,
                    allowDeleteRow: true,
                    allowDeleteColumn: true,
                    // Renaming happens through the delegated double-click
                    // editor (committing via setHeader); jspreadsheet's
                    // built-in rename (slow-click on a selected header) calls
                    // setHeader with no value, resetting the title.
                    allowRenameColumn: false,
                    columnSorting: false,
                    columnDrag: false,
                    rowDrag: false,
                },
            ],
            onchangeheader: (_ws, colIndex, newValue) => {
                // An empty (or letter-like default) title clears back to the
                // letter header rather than persisting it as a name.
                const title = newValue.trim();
                columnTitles = setColumnEntry(
                    columnTitles,
                    Number(colIndex),
                    title === "" || title === columnLetters(Number(colIndex)) ? null : title,
                );
                schedulePersist();
                // Renaming rewrites the header cell, dropping the injected
                // type select; put it back.
                reinstallScratchTypeControls();
            },
            onchange: (_ws, _cell, cx, cy) => {
                schedulePersist();
                growIfNeeded(Number(cx), Number(cy));
            },
            onselection: (_ws, x1, _y1, x2) => {
                setSelection({ start: Math.min(x1, x2), end: Math.max(x1, x2) });
            },
            oninsertrow: () => schedulePersist(),
            ondeleterow: () => schedulePersist(),
            oninsertcolumn: (_ws, inserted) => {
                // Shift the type tags and titles with the columns, then re-tag
                // the (new) header cells.
                for (const insertedColumn of [...inserted].toSorted(
                    (a, b) => a.column - b.column,
                )) {
                    columnTypes = insertColumnEntries(columnTypes, insertedColumn.column, 1);
                    columnTitles = insertColumnEntries(columnTitles, insertedColumn.column, 1);
                }
                schedulePersist();
                reinstallScratchTypeControls();
            },
            ondeletecolumn: (_ws, removed) => {
                for (const index of [...removed].toSorted((a, b) => b - a)) {
                    const single = { start: index, end: index };
                    columnTypes = removeColumnEntries(columnTypes, single);
                    columnTitles = removeColumnEntries(columnTitles, single);
                }
                setSelection(undefined);
                schedulePersist();
                reinstallScratchTypeControls();
            },
        };
        const built = jspreadsheet(host(), options);
        worksheet = Array.isArray(built) ? built[0] : built;
        installScratchTypeControls();
    };

    /** Rebuild the scratch grid in place, keeping its current contents. */
    const rebuildScratch = () => {
        if (!worksheet || disposed) {
            return;
        }
        buildGrid(currentData());
    };

    onMount(() => {
        const persisted = loadPersistedSheet();
        columnTypes = persisted.types;
        columnTitles = persisted.titles;
        buildGrid(persisted.cells);

        // Double-click on a column header edits its name inline. Delegated in
        // the capture phase on the stable container — not on the header cells
        // themselves — so it works across grid rebuilds (a rebuild between the
        // two clicks replaces the header element, which would make the browser
        // deliver the dblclick to an ancestor and a per-header listener miss
        // it). Committing goes through jspreadsheet's setHeader, which fires
        // `onchangeheader` (persisting the title and reinstalling the header
        // controls); an empty commit falls back to the letter header.
        const onHeaderDoubleClick = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }
            // Leave the type select and an already-open editor alone.
            if (target.closest("select, [data-header-editor]")) {
                return;
            }
            const header = target.closest<HTMLTableCellElement>("thead td[data-x]");
            if (!header || !container.contains(header)) {
                return;
            }
            const index = Number(header.dataset.x);
            if (!Number.isInteger(index)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            editHeaderInline(header, columnTitles[index] ?? "", (value) => {
                worksheet?.setHeader(index, value);
            });
        };
        container.addEventListener("dblclick", onHeaderDoubleClick, true);
        onCleanup(() => container.removeEventListener("dblclick", onHeaderDoubleClick, true));
    });
    // The scratch tag selects list the tables as link targets, and link-tagged
    // columns bake the target rows' values into their dropdown sources — so
    // refresh when a table appears, disappears, or is renamed, or when a
    // linked table's referenceable values change.
    createEffect(
        on(
            () => {
                const tables = specs()
                    .map((spec) => `${spec.entity.id}:${spec.entity.label}`)
                    .join(",");
                const linked = [
                    ...new Set(
                        columnTypes.flatMap((tag) =>
                            tag !== null && isLinkTag(tag) ? [linkTagEntity(tag)] : [],
                        ),
                    ),
                ];
                const sources = linked
                    .map((id) => `${id}=${linkSourceValues(id).join("\u0000")}`)
                    .join(";");
                return `${tables}#${sources}`;
            },
            (signature, previousSignature) => {
                // The effect fires on every schema/instance change; only act
                // when what the scratch grid consumes actually changed, so the
                // grid is not torn down under the user's pointer gratuitously.
                if (signature === previousSignature) {
                    return;
                }
                // Dropdown sources are baked into the grid, so a rebuild is
                // needed when any column links; otherwise refreshing the
                // header selects' options suffices.
                if (columnTypes.some((tag) => tag !== null && isLinkTag(tag))) {
                    queueMicrotask(rebuildScratch);
                } else {
                    reinstallScratchTypeControls();
                }
            },
            { defer: true },
        ),
    );
    onCleanup(() => {
        disposed = true;
        scratchTypeCleanup?.();
        if (worksheet) {
            jspreadsheet.destroy(host(), true);
            container.replaceChildren();
        }
    });

    const selectionLabel = () => {
        const range = selection();
        if (!range) {
            return "";
        }
        return range.start === range.end
            ? `column ${columnLetters(range.start)}`
            : `columns ${columnLetters(range.start)}–${columnLetters(range.end)}`;
    };

    const openMakeTable = () => {
        const range = selection();
        if (!range) {
            return;
        }
        // Link tags whose target table no longer exists fall back to auto for
        // this plan (the tag itself is kept in case an undo restores the table).
        const liveIds = new Set(entityIds());
        const tags = columnTypes.map((tag) =>
            tag !== null && isLinkTag(tag) && !liveIds.has(linkTagEntity(tag)) ? null : tag,
        );
        setDialog({
            plan: planTableFromColumns(currentData(), range, tags, columnTitles),
            range,
        });
    };

    /** After the table is created, the claimed columns leave the sheet. */
    const claimColumns = (range: SheetColumnRange) => {
        const remaining = trimSheetData(removeColumns(currentData(), range));
        columnTypes = removeColumnEntries(columnTypes, range);
        columnTitles = removeColumnEntries(columnTitles, range);
        setDialog(undefined);
        setSelection(undefined);
        buildGrid(remaining);
        schedulePersist();
    };

    return (
        <div class={styles.sheetView}>
            <Show when={entityIds().length > 0}>
                <div class={styles.tablesArea}>
                    <TablesView
                        doc={doc()}
                        addColumnChoices={addColumnChoices()}
                        onAddColumn={(entityId, key) => addColumn(specFor(entityId), key)}
                        onRenameColumn={renameColumn}
                        onChangeColumnType={changeColumnType}
                    />
                </div>
            </Show>
            <div class={styles.sheetPane}>
                <div class={styles.toolbar}>
                    <span class={styles.hint}>
                        Type anywhere. Every row is data — name columns by double-clicking their
                        headers before turning them into a table. Types are inferred unless tagged
                        in the header.
                    </span>
                    <wired-button
                        elevation="2"
                        disabled={!selection() || undefined}
                        onClick={openMakeTable}
                    >
                        Make table
                        <Show when={selection()}>{` from ${selectionLabel()}`}</Show>
                    </wired-button>
                </div>
                <div class={styles.grid}>
                    <div ref={container} />
                </div>
            </div>
            <Show when={dialog()}>
                {(open) => (
                    <MakeTableDialog
                        doc={doc()}
                        plan={open().plan}
                        onCancel={() => setDialog(undefined)}
                        onApplied={() => claimColumns(open().range)}
                    />
                )}
            </Show>
            <Show when={reviewAttribute()}>
                {(attribute) => (
                    <SchemaChangeReviewDialog
                        doc={doc()}
                        attribute={attribute()}
                        onCancel={() => setReviewAttribute(undefined)}
                        onApplied={() => setReviewAttribute(undefined)}
                    />
                )}
            </Show>
        </div>
    );
}

function loadPersistedSheet(): PersistedSheet {
    try {
        return (
            parsePersistedSheet(localStorage.getItem(SHEET_STORAGE_KEY)) ?? {
                cells: [],
                types: [],
                titles: [],
            }
        );
    } catch {
        return { cells: [], types: [], titles: [] };
    }
}
