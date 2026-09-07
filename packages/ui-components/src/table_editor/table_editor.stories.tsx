import { createSignal, Index } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import type {
    FieldValue,
    InstanceTable,
    LiteralType,
    LiteralValue,
    TableHeader,
    TableIssue,
    TableRow,
} from "catcolab-documents";
import { rootFocus, useChildFocus } from "../util/focus";
import { TableEditor } from "./table_editor";

const meta = {
    title: "Forms & Inputs/TableEditor",
    component: TableEditor,
} satisfies Meta<typeof TableEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

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
function EditableTables(props: { initialSpecs: TableSpec[]; issues?: TableIssue[] }) {
    // Initial story data, intentionally captured on mount.
    const [specs, setSpecs] = createSignal(props.initialSpecs);
    const tables = () => specs().map(toInstanceTable);
    const focus = useChildFocus<string>(rootFocus);

    const updateSpec = (tableId: string, update: (spec: TableSpec) => TableSpec) =>
        setSpecs((specs) => specs.map((spec) => (spec.id === tableId ? update(spec) : spec)));

    const setField = (
        tableId: string,
        row: TableRow,
        header: TableHeader,
        value: LiteralValue | TableRow,
    ) => {
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

    return (
        <div style={{ display: "flex", "flex-wrap": "wrap", gap: "1.5rem" }}>
            <Index each={tables()}>
                {(table) => (
                    <TableEditor
                        table={table()}
                        tables={tables()}
                        issues={props.issues?.filter((issue) => issue.path[0] === table().id)}
                        focus={focus.childFocus(table().id)}
                        onSetField={(row, header, value) =>
                            setField(table().id, row, header, value)
                        }
                        onAddRow={() => addRow(table().id)}
                        onDeleteRow={(row) => deleteRow(table().id, row)}
                    />
                )}
            </Index>
        </div>
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

export const Summary: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec, personSpec]} />,
    tags: ["!autodocs", "!dev"],
};

export const DoubleClickBooleanCell: Story = {
    render: () => (
        <EditableTables
            initialSpecs={[
                {
                    id: "boolean",
                    label: "Boolean",
                    columns: [{ id: "active", label: "active", type: "Bool" }],
                    rows: [{ id: "boolean-1", values: { active: true } }],
                },
            ]}
        />
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const activeHeader = canvas.getByRole("columnheader", {
            name: "active",
        }) as HTMLTableCellElement;
        const activeColumn = activeHeader.cellIndex;
        const firstRow = canvas.getAllByRole("row")[1]!;
        const cell = within(firstRow).getAllByRole("gridcell")[activeColumn]!;
        const checkbox = within(cell).getByRole("checkbox");

        await expect(checkbox).toBeChecked();
        await userEvent.dblClick(cell);
        await expect(checkbox).not.toBeChecked();
    },
};

export const RowRefHighlightsCurrent: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec, personSpec]} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const tables = within(canvasElement).getAllByRole("grid");
        // Bob's team cell, which references the second team.
        const cell = within(tables[1]!).getAllByRole("gridcell")[9]!;
        await expect(cell).toHaveTextContent('Team "Beacon"');

        await userEvent.dblClick(cell);
        const listbox = await within(document.body).findByRole("listbox");
        const active = listbox.querySelector("li.active");
        await expect(active).toHaveTextContent('Team "Beacon"');

        await userEvent.keyboard("{Enter}");
        await expect(cell).toHaveTextContent('Team "Beacon"');
    },
};

export const InvalidData: Story = {
    render: () => (
        <EditableTables
            initialSpecs={[
                teamSpec,
                {
                    id: "invalid-person",
                    label: "Invalid person data",
                    columns: [
                        { id: "age", label: "age", type: "Int" },
                        { id: "team", label: "team", type: { rowRef: "team" } },
                    ],
                    rows: [
                        {
                            id: "invalid-person-1",
                            values: {
                                age: "not an integer",
                                team: { rowId: "missing-team" },
                            },
                        },
                    ],
                },
            ]}
        />
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const tables = within(canvasElement).getAllByRole("grid");
        const cells = within(tables[1]!).getAllByRole("gridcell");

        await expect(cells[0]).toHaveTextContent("not an integer");
        await expect(cells[0]).toHaveAttribute("aria-invalid", "true");
        await expect(cells[1]).toHaveTextContent("Team ?");
        await expect(cells[1]).toHaveAttribute("aria-invalid", "true");
    },
};

export const ValidationIssues: Story = {
    render: () => (
        <EditableTables
            initialSpecs={[
                teamSpec,
                {
                    ...personSpec,
                    rows: personSpec.rows.map((row) =>
                        row.id === "person-alice"
                            ? Object.assign({}, row, {
                                  values: Object.assign({}, row.values, {
                                      team: { rowId: "person-bob" },
                                  }),
                              })
                            : row,
                    ),
                },
            ]}
            issues={[
                {
                    message: "`team` must be a row of table `Team` (was a row of table `Person`)",
                    path: ["person", "rows", "person-alice", "fields", "team"],
                    issueType: "MistypedRowRef",
                },
            ]}
        />
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const tables = within(canvasElement).getAllByRole("grid");
        const cells = within(tables[1]!).getAllByRole("gridcell");

        await expect(cells[4]).toHaveTextContent('Person "Bob"');
        await expect(cells[4]).toHaveAttribute("aria-invalid", "true");
        await expect(cells[4]).toHaveAttribute("title", expect.stringContaining("must be a row"));
        await expect(cells[0]).toHaveAttribute("aria-invalid", "false");
        await expect(cells[0]).not.toHaveAttribute("title");
    },
};

export const Unnamed: Story = {
    render: () => (
        <EditableTables
            initialSpecs={[
                {
                    id: "notes",
                    label: "",
                    columns: [{ id: "note", label: "", type: "String" }],
                    rows: [{ id: "note-1", values: { note: "" } }],
                },
                {
                    id: "notes-2",
                    label: "",
                    columns: [{ id: "note", label: "", type: "String" }],
                    rows: [{ id: "note-1", values: { note: "" } }],
                },
                {
                    id: "references",
                    label: "References",
                    columns: [
                        { id: "note", label: "note", type: { rowRef: "notes" } },
                        { id: "note2", label: "note2", type: { rowRef: "notes-2" } },
                    ],
                    rows: [
                        {
                            id: "reference-1",
                            values: { note: { rowId: "note-1" }, note2: { rowId: "note-1" } },
                        },
                    ],
                },
            ]}
        />
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);

        await expect(canvas.getAllByRole("heading", { name: "Unnamed table" })).toHaveLength(2);
        await expect(canvas.getAllByRole("columnheader", { name: "Unnamed column" })).toHaveLength(
            2,
        );
        for (const cell of within(canvas.getAllByRole("grid")[2]!).getAllByRole("gridcell")) {
            await expect(cell).toHaveAttribute("aria-invalid", "false");
        }
    },
};

export const OrphanedTable: Story = {
    render: () => (
        <EditableTables
            initialSpecs={[
                {
                    id: "ghost-table",
                    label: null,
                    columns: [{ id: "mystery", label: null, type: "Unknown" }],
                    rows: [{ id: "ghost-row", values: { mystery: 3 } }],
                },
                {
                    id: "references",
                    label: "References",
                    columns: [{ id: "ghost", label: "ghost", type: { rowRef: "ghost-table" } }],
                    rows: [{ id: "reference-1", values: { ghost: { rowId: "ghost-row" } } }],
                },
            ]}
            issues={[
                {
                    message: "Table `ghost-table` does not exist in the schema",
                    path: ["ghost-table"],
                    issueType: "OrphanedTable",
                },
            ]}
        />
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const tables = canvas.getAllByRole("grid");
        const unknownCell = within(tables[0]!).getByRole("gridcell");
        const unknownRef = within(tables[1]!).getByRole("gridcell");
        const unknownTable = canvas
            .getByRole("heading", { name: "Unknown table" })
            .closest("section");

        await expect(unknownTable).toHaveAttribute(
            "title",
            "Table `ghost-table` does not exist in the schema",
        );
        await expect(canvas.getByRole("columnheader", { name: "Unknown column" })).toBeVisible();
        await expect(unknownCell).toHaveTextContent("3");
        await userEvent.dblClick(unknownCell);
        await expect(within(unknownCell).queryByRole("textbox")).not.toBeInTheDocument();
        await expect(
            within(tables[0]!.closest("section")!).queryByRole("button", { name: "+ Row" }),
        ).not.toBeInTheDocument();
        await expect(unknownRef).toHaveTextContent("Unknown table row 1");
        await expect(unknownRef).toHaveAttribute("aria-invalid", "true");
    },
};

export const EmptyColumns: Story = {
    render: () => (
        <EditableTables
            initialSpecs={[
                {
                    id: "marker",
                    label: "Marker",
                    columns: [],
                    rows: [
                        { id: "marker-1", values: {} },
                        { id: "marker-2", values: {} },
                    ],
                },
            ]}
        />
    ),
};

const focusSpec: TableSpec = {
    id: "focus",
    label: "Focus",
    columns: [{ id: "value", label: "value", type: "String" }],
    rows: [{ id: "focus-1", values: { value: "First" } }],
};

/** Renders a single editable table backed by an in-memory table spec. */
function SingleTable(props: { initialSpec: TableSpec; addRowDelay?: number }) {
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
            tables={[table()]}
            focus={focus.childFocus("table")}
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

export const FocusBoundaries: Story = {
    render: () => (
        <div>
            <button type="button">Before table</button>
            <SingleTable initialSpec={focusSpec} />
            <button type="button">After table</button>
        </div>
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cell = canvas.getByRole("gridcell");

        await userEvent.click(cell);
        await userEvent.keyboard("{Enter}");
        await userEvent.tab({ shift: true });
        await expect(canvas.getByRole("button", { name: "Before table" })).toHaveFocus();

        await userEvent.click(cell);
        await userEvent.keyboard("{Enter}");
        await userEvent.tab();
        await waitFor(() => expect(canvas.getAllByRole("gridcell")[1]).toHaveFocus());
        await userEvent.tab();
        await expect(canvas.getByRole("button", { name: "+ Row" })).toHaveFocus();
        await userEvent.tab();
        await expect(canvas.getByRole("button", { name: "After table" })).toHaveFocus();
    },
};

export const FocusAfterDelete: Story = {
    render: () => (
        <SingleTable
            initialSpec={{
                ...focusSpec,
                rows: [
                    ...focusSpec.rows,
                    { id: "focus-2", values: { value: "Second" } },
                    { id: "focus-3", values: { value: "Third" } },
                ],
            }}
        />
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getAllByRole("gridcell")[0]!);
        await userEvent.click(canvas.getAllByRole("button", { name: "Delete row" })[1]!);
        await waitFor(async () => {
            const firstCell = canvas.getAllByRole("gridcell")[0]!;
            await expect(firstCell).toHaveTextContent("First");
            await expect(firstCell).toHaveFocus();
        });

        await userEvent.click(canvas.getAllByRole("button", { name: "Delete row" })[0]!);
        await waitFor(async () => {
            const remainingCell = canvas.getByRole("gridcell");
            await expect(remainingCell).toHaveTextContent("Third");
            await expect(remainingCell).toHaveFocus();
        });
    },
};

export const DeleteWithoutFocus: Story = {
    render: () => (
        <div>
            <button type="button">Elsewhere</button>
            <SingleTable
                initialSpec={{
                    ...focusSpec,
                    rows: [...focusSpec.rows, { id: "focus-2", values: { value: "Second" } }],
                }}
            />
        </div>
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const elsewhere = canvas.getByRole("button", { name: "Elsewhere" });

        await userEvent.click(elsewhere);
        await userEvent.click(canvas.getAllByRole("button", { name: "Delete row" })[0]!);

        await waitFor(() => expect(canvas.getAllByRole("gridcell")).toHaveLength(1));
        await expect(elsewhere).toHaveFocus();
        await expect(canvas.getByRole("gridcell")).toHaveAttribute("aria-selected", "false");
    },
};

export const AddRowButtonFocusesNewRow: Story = {
    render: () => <SingleTable initialSpec={focusSpec} addRowDelay={100} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole("button", { name: "+ Row" }));

        await waitFor(async () => {
            const cells = canvas.getAllByRole("gridcell");
            await expect(cells).toHaveLength(2);
            await expect(cells[1]).toHaveFocus();
        });
    },
};

export const ContinueEditingAfterAsyncAdd: Story = {
    render: () => (
        <div>
            <p>
                The table is ready for adding a row being an async operation. Edit the last cell and
                press Enter. The next row appears after a short delay, ready for you to keep typing.
            </p>
            <SingleTable
                initialSpec={{
                    ...focusSpec,
                    rows: [...focusSpec.rows, { id: "focus-2", values: { value: "Second" } }],
                }}
                addRowDelay={300}
            />
        </div>
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        await userEvent.dblClick(canvas.getAllByRole("gridcell")[1]!);
        const input = canvas.getByRole("textbox");
        await userEvent.clear(input);
        await userEvent.type(input, "Updated second row");
        await userEvent.keyboard("{Enter}");

        await waitFor(async () => {
            const cells = canvas.getAllByRole("gridcell");
            await expect(cells).toHaveLength(3);
            await expect(cells[1]).toHaveTextContent("Updated second row");
            await expect(cells[2]).toHaveFocus();
        });
    },
};

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

/** A single table alongside buttons simulating concurrent changes to it.

The buttons do not take focus, so clicking them leaves any open cell editor in
place, as a remote change would.
 */
function ConcurrentTable(props: { initialSpec: TableSpec }) {
    // Initial story data, intentionally captured on mount.
    const [spec, setSpec] = createSignal(props.initialSpec);
    const [writes, setWrites] = createSignal(0);
    const table = () => toInstanceTable(spec());
    const focus = useChildFocus<"table">(rootFocus);

    const removeFirstRow = () => setSpec((spec) => ({ ...spec, rows: spec.rows.slice(1) }));
    const insertColumnBefore = () =>
        setSpec((spec) => ({
            ...spec,
            columns: [{ id: "extra", label: "extra", type: "Int" }, ...spec.columns],
        }));

    return (
        <div>
            <TableEditor
                table={table()}
                tables={[table()]}
                focus={focus.childFocus("table")}
                onSetField={(row, header, value) => {
                    setWrites((n) => n + 1);
                    setSpec((spec) => setSpecField(spec, row, header, value));
                }}
                onAddRow={() =>
                    setSpec((spec) => ({
                        ...spec,
                        rows: [...spec.rows, { id: crypto.randomUUID(), values: {} }],
                    }))
                }
                onDeleteRow={(row) =>
                    setSpec((spec) => ({
                        ...spec,
                        rows: spec.rows.filter((candidate) => candidate.id !== row.id),
                    }))
                }
            />
            <p>
                <button
                    type="button"
                    onMouseDown={(evt) => evt.preventDefault()}
                    onClick={removeFirstRow}
                >
                    Remove first row
                </button>
                <button
                    type="button"
                    onMouseDown={(evt) => evt.preventDefault()}
                    onClick={insertColumnBefore}
                >
                    Insert column before
                </button>
            </p>
            <p data-testid="writes">{writes()}</p>
        </div>
    );
}

const concurrentSpec: TableSpec = {
    ...focusSpec,
    rows: [
        ...focusSpec.rows,
        { id: "focus-2", values: { value: "Second" } },
        { id: "focus-3", values: { value: "Third" } },
    ],
};

export const RemoteRowDeleteWhileEditing: Story = {
    render: () => <ConcurrentTable initialSpec={concurrentSpec} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        await userEvent.dblClick(canvas.getAllByRole("gridcell")[1]!);
        const input = canvas.getByRole("textbox");
        await userEvent.clear(input);
        await userEvent.type(input, "Edited");

        await userEvent.click(canvas.getByRole("button", { name: "Remove first row" }));
        await waitFor(() => expect(canvas.getAllByRole("gridcell")).toHaveLength(2));
        // The editor follows its row to the new position, keeping the text.
        await expect(canvas.getByRole("textbox")).toHaveValue("Edited");
        await expect(canvas.getByRole("textbox")).toHaveFocus();
        await expect(canvas.getByTestId("writes")).toHaveTextContent("0");

        await userEvent.keyboard("{Enter}");
        const cells = canvas.getAllByRole("gridcell");
        await expect(cells).toHaveLength(2);
        await expect(cells[0]).toHaveTextContent("Edited");
        await expect(cells[1]).toHaveTextContent("Third");
        await expect(cells[1]).toHaveFocus();
        await expect(canvas.getByTestId("writes")).toHaveTextContent("1");
    },
};

export const RemoteColumnInsertWhileEditing: Story = {
    render: () => <ConcurrentTable initialSpec={concurrentSpec} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        await userEvent.dblClick(canvas.getAllByRole("gridcell")[0]!);
        const input = canvas.getByRole("textbox");
        await userEvent.clear(input);
        await userEvent.type(input, "Edited");

        await userEvent.click(canvas.getByRole("button", { name: "Insert column before" }));
        await waitFor(() => expect(canvas.getAllByRole("columnheader")).toHaveLength(3));
        // The editor follows its column to the new position, keeping the text.
        const editing = canvas.getByRole("textbox");
        await expect(editing).toHaveValue("Edited");
        await expect(editing).toHaveFocus();
        await expect(canvas.getAllByRole("gridcell")[1]).toContainElement(editing);

        await userEvent.keyboard("{Enter}");
        const cells = canvas.getAllByRole("gridcell");
        await expect(cells).toHaveLength(6);
        await expect(cells[0]).toHaveTextContent("");
        await expect(cells[1]).toHaveTextContent("Edited");
        await expect(cells[3]).toHaveTextContent("Second");
        await expect(cells[3]).toHaveFocus();
        await expect(canvas.getByTestId("writes")).toHaveTextContent("1");
    },
};

export const RemoteDeleteOfEditedRow: Story = {
    render: () => <ConcurrentTable initialSpec={concurrentSpec} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        await userEvent.dblClick(canvas.getAllByRole("gridcell")[0]!);
        const input = canvas.getByRole("textbox");
        await userEvent.clear(input);
        await userEvent.type(input, "Edited");

        await userEvent.click(canvas.getByRole("button", { name: "Remove first row" }));
        await waitFor(() => expect(canvas.getAllByRole("gridcell")).toHaveLength(2));
        // The edit is dropped rather than written to whichever row took its place.
        await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
        await expect(canvas.getByTestId("writes")).toHaveTextContent("0");
        const cells = canvas.getAllByRole("gridcell");
        await expect(cells[0]).toHaveTextContent("Second");
        await expect(cells[1]).toHaveTextContent("Third");
        await expect(cells[0]).toHaveFocus();
    },
};

export const StableColumnWidths: Story = {
    render: () => (
        <>
            <p>Constraining the table to a width does not make it escape its container.</p>
            <div style={{ width: "300px" }}>
                <EditableTables initialSpecs={[teamSpec, personSpec]} />
            </div>
        </>
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const tables = within(canvasElement).getAllByRole("grid");
        const table = tables[1]!;
        const rowRefCell = within(table).getAllByRole("gridcell")[4]!;
        const tableWidth = table.getBoundingClientRect().width;
        const columnWidth = rowRefCell.getBoundingClientRect().width;

        await userEvent.dblClick(rowRefCell);
        await expect(within(rowRefCell).getByRole("textbox")).toHaveFocus();
        await expect(table.getBoundingClientRect().width).toBe(tableWidth);
        await expect(rowRefCell.getBoundingClientRect().width).toBe(columnWidth);
    },
};
