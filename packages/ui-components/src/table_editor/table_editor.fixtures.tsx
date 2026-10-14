import { createSignal, Index } from "solid-js";

import type {
    FieldValue,
    InstanceTable,
    LiteralType,
    LiteralValue,
    TableHeader,
    TableIssue,
    TableRow,
} from "catcolab-documents";
import { type FocusHandle, rootFocus, useChildFocus } from "../util/focus";
import { TableEditor } from "./table_editor";

/** Plain data from which `InstanceTable` fixtures are derived. */
type TableSpec = {
    id: string;
    label: string | null;
    columns: Array<{
        id: string;
        label: string | null;
        type: LiteralType | "Unknown" | { rowRef: string };
    }>;
    rows: Array<{ id: string; values: Record<string, LiteralValue | { rowId: string }> }>;
};

function toInstanceTable(spec: TableSpec): InstanceTable {
    const headers: TableHeader[] = spec.columns.map((column) => ({
        id: column.id,
        label: column.label,
        type:
            typeof column.type === "string"
                ? { tag: column.type }
                : { tag: "RowRef", content: { id: column.type.rowRef } },
    }));
    const rows: TableRow[] = spec.rows.map((row, index) => ({
        id: row.id,
        index,
        fields: spec.columns.map((column) =>
            toFieldValue(spec.id, row.id, column, row.values[column.id] ?? null),
        ),
    }));
    return { id: spec.id, label: spec.label, headers, rows };
}

function toFieldValue(
    tableId: string,
    rowId: string,
    column: TableSpec["columns"][number],
    value: LiteralValue | { rowId: string },
): FieldValue {
    const path: FieldValue["content"]["path"] = [tableId, "rows", rowId, "fields", column.id];
    if (value === null) {
        return { tag: "Null", content: { path } };
    }
    if (typeof value === "object") {
        return { tag: "RowRef", content: { path, id: value.rowId } };
    }
    if (typeof value === "boolean") {
        return { tag: "Bool", content: { path, value } };
    }
    if (typeof value === "number") {
        return { tag: column.type === "Int" ? "Int" : "Float", content: { path, value } };
    }
    return { tag: "String", content: { path, value } };
}

/** Renders editable table editors backed by in-memory table specs. */
function EditableTables(props: {
    initialSpecs: TableSpec[];
    issues?: TableIssue[];
    hideable?: boolean;
    trackWrites?: boolean;
    remoteUpdates?: boolean;
}) {
    // Initial story data, intentionally captured on mount.
    const [specs, setSpecs] = createSignal(props.initialSpecs);
    const [commits, setCommits] = createSignal<string[]>([]);
    const [hidden, setHidden] = createSignal<ReadonlySet<string>>(new Set());
    const tables = () => specs().map(toInstanceTable);
    const focus = useChildFocus<string>(rootFocus);
    const visibleTables = () => tables().filter((table) => !hidden().has(table.id));

    const hide = (tableId: string) => setHidden((ids) => new Set([...ids, tableId]));

    const updateSpec = (tableId: string, update: (spec: TableSpec) => TableSpec) =>
        setSpecs((specs) => specs.map((spec) => (spec.id === tableId ? update(spec) : spec)));

    const setField = (
        tableId: string,
        row: TableRow,
        header: TableHeader,
        value: LiteralValue | TableRow,
    ) => {
        if (props.trackWrites) {
            setCommits((commits) => [...commits, `${tableId}.${header.id}[${row.id}]`]);
        }
        const stored = typeof value === "object" && value !== null ? { rowId: value.id } : value;
        updateSpec(tableId, (spec) => ({
            ...spec,
            rows: spec.rows.map((specRow) =>
                specRow.id === row.id
                    ? { ...specRow, values: { ...specRow.values, [header.id]: stored } }
                    : specRow,
            ),
        }));
    };

    const addRow = (tableId: string) =>
        updateSpec(tableId, (spec) => ({
            ...spec,
            rows: [...spec.rows, { id: crypto.randomUUID(), values: {} }],
        }));

    const deleteRow = (tableId: string, row: TableRow) =>
        updateSpec(tableId, (spec) => ({
            ...spec,
            rows: spec.rows.filter((specRow) => specRow.id !== row.id),
        }));

    const deleteTable = (tableId: string) =>
        setSpecs((specs) => specs.filter((spec) => spec.id !== tableId));

    const deleteColumn = (tableId: string, header: TableHeader) =>
        updateSpec(tableId, (spec) => ({
            ...spec,
            columns: spec.columns.filter((column) => column.id !== header.id),
            rows: spec.rows.map((row) => {
                const { [header.id]: _removed, ...values } = row.values;
                return { ...row, values };
            }),
        }));

    return (
        <>
            {props.remoteUpdates && (
                <button
                    type="button"
                    onMouseDown={(evt) => evt.preventDefault()}
                    onClick={() =>
                        setSpecs((specs) =>
                            specs.map((spec) => ({
                                ...spec,
                                rows: spec.rows.map((row) => ({
                                    ...row,
                                    values: { ...row.values, name: "Remote" },
                                })),
                            })),
                        )
                    }
                >
                    Remote update
                </button>
            )}
            {props.trackWrites && (
                <ol data-testid="commit-log">
                    <Index each={commits()}>{(commit) => <li>{commit()}</li>}</Index>
                </ol>
            )}
            <div style={{ display: "flex", "flex-wrap": "wrap", gap: "1.5rem" }}>
                <Index each={visibleTables()}>
                    {(table) => (
                        <TableEditor
                            table={table()}
                            allTables={tables()}
                            issues={props.issues?.filter((issue) => issue.path[0] === table().id)}
                            focus={focus.childFocus(table().id)}
                            onSetField={(row, header, value) =>
                                setField(table().id, row, header, value)
                            }
                            onAddRow={() => addRow(table().id)}
                            onDeleteRow={(row) => deleteRow(table().id, row)}
                            onHide={props.hideable ? () => hide(table().id) : undefined}
                            onDeleteOrphanedTable={() => deleteTable(table().id)}
                            onDeleteOrphanedColumn={(header) => deleteColumn(table().id, header)}
                        />
                    )}
                </Index>
            </div>
        </>
    );
}

const teamSpec: TableSpec = {
    id: "team",
    label: "Team",
    columns: [
        { id: "name", label: "name", type: "String" },
        { id: "capacity", label: "capacity", type: "Int" },
    ],
    rows: [
        { id: "team-atlas", values: { name: "Atlas", capacity: 5 } },
        { id: "team-beacon", values: { name: "Beacon", capacity: 3 } },
        { id: "team-canopy", values: { name: "Canopy", capacity: 4 } },
    ],
};

const personSpec: TableSpec = {
    id: "person",
    label: "Person",
    columns: [
        { id: "name", label: "name", type: "String" },
        { id: "age", label: "age", type: "Int" },
        { id: "score", label: "score", type: "Float" },
        { id: "active", label: "active", type: "Bool" },
        { id: "team", label: "team", type: { rowRef: "team" } },
    ],
    rows: [
        {
            id: "person-alice",
            values: {
                name: "Alice",
                age: 30,
                score: 9.5,
                active: true,
                team: { rowId: "team-atlas" },
            },
        },
        {
            id: "person-bob",
            values: {
                name: "Bob",
                age: 25,
                score: 7.25,
                active: false,
                team: { rowId: "team-beacon" },
            },
        },
        {
            id: "person-charlie",
            values: { name: "Charlie", age: 35, score: 8.75, active: true },
        },
    ],
};

const focusSpec: TableSpec = {
    id: "focus",
    label: "Focus",
    columns: [{ id: "value", label: "value", type: "String" }],
    rows: [{ id: "focus-1", values: { value: "First" } }],
};

/** Renders a single editable table backed by an in-memory table spec. */
function SingleTable(props: { initialSpec: TableSpec; addRowDelay?: number; focus?: FocusHandle }) {
    // Initial story data, intentionally captured on mount.
    const [spec, setSpec] = createSignal(props.initialSpec);
    const table = () => toInstanceTable(spec());
    const focus = useChildFocus<"table">(rootFocus);

    const addRow = () =>
        setSpec((spec) => ({
            ...spec,
            rows: [...spec.rows, { id: crypto.randomUUID(), values: {} }],
        }));

    return (
        <TableEditor
            table={table()}
            allTables={[table()]}
            focus={props.focus ?? focus.childFocus("table")}
            onSetField={(row, header, value) =>
                setSpec((spec) => setSpecField(spec, row, header, value))
            }
            onAddRow={() =>
                props.addRowDelay === undefined ? addRow() : setTimeout(addRow, props.addRowDelay)
            }
            onDeleteRow={(row) =>
                setSpec((spec) => ({
                    ...spec,
                    rows: spec.rows.filter((candidate) => candidate.id !== row.id),
                }))
            }
        />
    );
}

function setSpecField(
    spec: TableSpec,
    row: TableRow,
    header: TableHeader,
    value: LiteralValue | TableRow,
): TableSpec {
    const stored = typeof value === "object" && value !== null ? { rowId: value.id } : value;
    return {
        ...spec,
        rows: spec.rows.map((candidate) =>
            candidate.id === row.id
                ? { ...candidate, values: { ...candidate.values, [header.id]: stored } }
                : candidate,
        ),
    };
}

export {
    TableSpec,
    EditableTables,
    teamSpec,
    personSpec,
    focusSpec,
    SingleTable,
    toInstanceTable,
    setSpecField,
};
