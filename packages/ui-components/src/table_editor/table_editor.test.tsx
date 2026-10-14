import { createSignal } from "solid-js";
import { userEvent, waitFor, within } from "storybook/test";
import { test, expect } from "vitest";

import type { LiteralValue } from "catcolab-documents";
import { mount } from "../test/mount";
import { rootFocus, useChildFocus } from "../util/focus";
import { TableEditor } from "./table_editor";
import {
    EditableTables,
    teamSpec,
    personSpec,
    focusSpec,
    SingleTable,
    type TableSpec,
    toInstanceTable,
    setSpecField,
} from "./table_editor.fixtures";

async function expectActiveCell(cell: HTMLElement) {
    const grid = cell.closest('[role="grid"]')!;
    expect(grid).toHaveFocus();
    expect(grid).toHaveAttribute("aria-activedescendant", cell.id);
    expect(cell).toHaveAttribute("aria-selected", "true");
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
                allTables={[table()]}
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
test("Tables without columns render placeholder cells and allow adding rows", async () => {
    const canvas = within(
        mount(() => (
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
        )),
    );
    expect(canvas.getAllByRole("gridcell")).toHaveLength(2);
    expect(canvas.queryByRole("button", { name: "Delete row" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "+ Row" }));
    expect(canvas.getAllByRole("gridcell")).toHaveLength(3);
});

test("HideTable", async () => {
    const canvasElement = mount(() => (
        <EditableTables initialSpecs={[teamSpec, personSpec]} hideable />
    ));

    const canvas = within(canvasElement);
    expect(canvas.getAllByRole("grid")).toHaveLength(2);

    await userEvent.click(canvas.getAllByRole("button", { name: "Hide table" })[0]!);

    await waitFor(() => expect(canvas.getAllByRole("grid")).toHaveLength(1));
    expect(canvas.queryByText("Team")).not.toBeInTheDocument();
    expect(canvas.getByText("Person")).toBeInTheDocument();
});

test("DoubleClickBooleanCell", async () => {
    const canvasElement = mount(() => (
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
    ));

    const canvas = within(canvasElement);
    const activeHeader = canvas.getByRole("columnheader", {
        name: "active",
    }) as HTMLTableCellElement;
    const activeColumn = activeHeader.cellIndex;
    const firstRow = canvas.getAllByRole("row")[1] as HTMLTableRowElement;
    const cell = firstRow.cells[activeColumn]!;
    const checkbox = within(cell).getByRole("checkbox");

    expect(checkbox).toBeChecked();
    await userEvent.dblClick(cell);
    expect(checkbox).not.toBeChecked();
});

test("RowRefHighlightsCurrent", async () => {
    const canvasElement = mount(() => <EditableTables initialSpecs={[teamSpec, personSpec]} />);

    const tables = within(canvasElement).getAllByRole("grid");
    // Bob's team cell, which references the second team.
    const cell = within(tables[1]!).getAllByRole("gridcell")[9]!;
    expect(cell).toHaveTextContent('Team "Beacon"');

    await userEvent.dblClick(cell);
    const listbox = await within(document.body).findByRole("listbox");
    const active = listbox.querySelector("li.active");
    expect(active).toHaveTextContent('Team "Beacon"');

    await userEvent.keyboard("{Enter}");
    expect(cell).toHaveTextContent('Team "Beacon"');
    await expectActiveCell(cell);
});

test("InvalidData", async () => {
    const canvasElement = mount(() => (
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
    ));

    const tables = within(canvasElement).getAllByRole("grid");
    const cells = within(tables[1]!).getAllByRole("gridcell");

    // Stored values are only marked invalid when field issues are supplied.
    expect(cells[0]).toHaveTextContent("not an integer");
    expect(cells[0]).toHaveAttribute("aria-invalid", "false");
    expect(cells[1]).toHaveTextContent("Team ?");
    expect(cells[1]).toHaveAttribute("aria-invalid", "false");
});

test("ValidationIssues", async () => {
    const canvasElement = mount(() => (
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
    ));

    const tables = within(canvasElement).getAllByRole("grid");
    const cells = within(tables[1]!).getAllByRole("gridcell");

    expect(cells[4]).toHaveTextContent('Person "Bob"');
    expect(cells[4]).toHaveAttribute("aria-invalid", "true");
    expect(cells[4]).toHaveAttribute("title", expect.stringContaining("must be a row"));
    expect(cells[0]).toHaveAttribute("aria-invalid", "false");
    expect(cells[0]).not.toHaveAttribute("title");
});

test("Unnamed", async () => {
    const canvasElement = mount(() => (
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
    ));

    const canvas = within(canvasElement);

    expect(canvas.getAllByRole("heading", { name: "Unnamed table" })).toHaveLength(2);
    expect(canvas.getAllByRole("columnheader", { name: "Unnamed column" })).toHaveLength(2);
    for (const cell of within(canvas.getAllByRole("grid")[2]!).getAllByRole("gridcell")) {
        expect(cell).toHaveAttribute("aria-invalid", "false");
    }
});

test("OrphanedTable", async () => {
    const canvasElement = mount(() => (
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
    ));

    const canvas = within(canvasElement);
    const tables = canvas.getAllByRole("grid");
    const unknownCell = within(tables[0]!).getByRole("gridcell");
    const unknownRef = within(tables[1]!).getByRole("gridcell");
    const unknownTable = canvas.getByRole("heading", { name: "Unknown table" }).closest("section");

    expect(unknownTable).toHaveAttribute(
        "title",
        "Table `ghost-table` does not exist in the schema",
    );
    expect(canvas.getByRole("columnheader", { name: "Unknown column" })).toBeVisible();
    expect(unknownCell).toHaveTextContent("3");
    await userEvent.dblClick(unknownCell);
    expect(within(unknownCell).queryByRole("textbox")).not.toBeInTheDocument();
    expect(
        within(tables[0]!.closest("section")!).queryByRole("button", { name: "+ Row" }),
    ).not.toBeInTheDocument();
    expect(unknownRef).toHaveTextContent("Unknown table row 1");
    // A table-level issue does not imply a field-level issue for references.
    expect(unknownRef).toHaveAttribute("aria-invalid", "false");

    // Columns of an orphaned table go with the table, not one by one.
    expect(canvas.queryByRole("button", { name: "Delete column" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Delete table" }));
    await waitFor(() => expect(canvas.getAllByRole("grid")).toHaveLength(1));
    expect(canvas.queryByRole("heading", { name: "Unknown table" })).not.toBeInTheDocument();
    expect(canvas.getByRole("gridcell")).toHaveTextContent("?");
});

test("OrphanedColumn", async () => {
    const canvasElement = mount(() => (
        <EditableTables
            initialSpecs={[
                {
                    ...teamSpec,
                    columns: [...teamSpec.columns, { id: "stray", label: null, type: "Unknown" }],
                    rows: teamSpec.rows.map((row) => ({
                        ...row,
                        values: { ...row.values, stray: "leftover" },
                    })),
                },
            ]}
            issues={teamSpec.rows.map((row) => ({
                message: "Field `stray` does not exist in the schema",
                path: ["team", "rows", row.id, "fields", "stray"],
                issueType: "OrphanedField",
            }))}
        />
    ));

    const canvas = within(canvasElement);

    const unknownHeader = canvas.getByRole("columnheader", { name: /Unknown column/ });
    expect(within(unknownHeader).getByRole("button", { name: "Delete column" })).toBeVisible();
    expect(
        within(canvas.getByRole("columnheader", { name: "name" })).queryByRole("button"),
    ).not.toBeInTheDocument();
    expect(canvas.getAllByRole("gridcell")[2]).toHaveTextContent("leftover");

    await userEvent.click(within(unknownHeader).getByRole("button", { name: "Delete column" }));
    await waitFor(() => expect(canvas.getAllByRole("columnheader")).toHaveLength(4));
    expect(canvas.queryByRole("columnheader", { name: /Unknown column/ })).not.toBeInTheDocument();
    const cells = canvas.getAllByRole("gridcell");
    expect(cells).toHaveLength(6);
    expect(cells[0]).toHaveTextContent("Atlas");
    expect(cells[1]).toHaveTextContent("5");
});

test("FocusBoundaries", async () => {
    const canvasElement = mount(() => (
        <div>
            <button type="button">Before table</button>
            <SingleTable initialSpec={focusSpec} />
            <button type="button">After table</button>
            <p>Non-focusable outside content</p>
        </div>
    ));

    const canvas = within(canvasElement);
    const cell = canvas.getByRole("gridcell");

    await userEvent.click(cell);
    await userEvent.keyboard("{Enter}");
    await userEvent.clear(canvas.getByRole("textbox"));
    await userEvent.type(canvas.getByRole("textbox"), "Committed on exit");
    await userEvent.tab({ shift: true });
    expect(canvas.getByRole("button", { name: "Before table" })).toHaveFocus();
    expect(cell).toHaveTextContent("Committed on exit");
    expect(cell).toHaveAttribute("aria-selected", "false");
    expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();

    await userEvent.click(cell);
    await userEvent.keyboard("{Enter}");
    await userEvent.tab();
    expect(canvas.getByRole("button", { name: "+ Row" })).toHaveFocus();
    expect(cell).toHaveAttribute("aria-selected", "false");
    await userEvent.tab();
    expect(canvas.getByRole("button", { name: "After table" })).toHaveFocus();

    await userEvent.dblClick(cell);
    await userEvent.click(canvas.getByText("Non-focusable outside content"));
    await waitFor(() => expect(canvas.queryByRole("textbox")).not.toBeInTheDocument());
    expect(cell).toHaveAttribute("aria-selected", "false");
    expect(canvas.getByRole("grid")).not.toHaveFocus();
});

test("CommitAndCancelWithinGrid", async () => {
    const canvasElement = mount(() => (
        <SingleTable
            initialSpec={{
                ...focusSpec,
                rows: [...focusSpec.rows, { id: "focus-2", values: { value: "Second" } }],
            }}
        />
    ));

    const canvas = within(canvasElement);
    const [first, second] = canvas.getAllByRole("gridcell");
    await userEvent.dblClick(first!);
    await userEvent.clear(canvas.getByRole("textbox"));
    await userEvent.type(canvas.getByRole("textbox"), "Committed on selection");
    await userEvent.click(second!);
    expect(first).toHaveTextContent("Committed on selection");
    await expectActiveCell(second!);

    await userEvent.keyboard("{Enter}");
    await userEvent.type(canvas.getByRole("textbox"), "Discard this");
    await userEvent.keyboard("{Escape}");
    expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    expect(second).toHaveTextContent("Second");
    await expectActiveCell(second!);
});

test("LogicalFocusTransfer", async () => {
    const canvasElement = mount(() => {
        const focus = useChildFocus<"table" | "outside">(rootFocus);
        return (
            <div>
                <SingleTable
                    initialSpec={focusSpec}
                    focus={focus.childFocus("table")}
                    addRowDelay={500}
                />
                <button
                    type="button"
                    onMouseDown={(evt) => evt.preventDefault()}
                    onClick={() => focus.childFocus("outside").setFocused(true)}
                >
                    Transfer logical focus
                </button>
            </div>
        );
    });

    const canvas = within(canvasElement);
    const cell = canvas.getByRole("gridcell");
    await userEvent.dblClick(cell);
    await userEvent.clear(canvas.getByRole("textbox"));
    await userEvent.type(canvas.getByRole("textbox"), "Committed by logical transfer");
    await userEvent.click(canvas.getByRole("button", { name: "Transfer logical focus" }));

    expect(cell).toHaveTextContent("Committed by logical transfer");
    expect(cell).toHaveAttribute("aria-selected", "false");
    expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    expect(canvas.getByRole("grid")).not.toHaveFocus();

    await userEvent.dblClick(cell);
    await userEvent.keyboard("{Enter}");
    await userEvent.click(canvas.getByRole("button", { name: "Transfer logical focus" }));
    await waitFor(() => expect(canvas.getAllByRole("gridcell")).toHaveLength(2));
    // Browser focus never moved, but it must not reclaim logical ownership.
    expect(canvas.getByRole("grid")).toHaveFocus();
    for (const candidate of canvas.getAllByRole("gridcell")) {
        expect(candidate).toHaveAttribute("aria-selected", "false");
    }
});

test("LeaveBeforeAsyncAdd", async () => {
    const canvasElement = mount(() => (
        <div>
            <SingleTable initialSpec={focusSpec} addRowDelay={500} />
            <button type="button">Elsewhere</button>
        </div>
    ));

    const canvas = within(canvasElement);
    const elsewhere = canvas.getByRole("button", { name: "Elsewhere" });

    await userEvent.dblClick(canvas.getByRole("gridcell"));
    await userEvent.keyboard("{Enter}");
    await userEvent.click(elsewhere);
    await waitFor(() => expect(canvas.getAllByRole("gridcell")).toHaveLength(2));
    expect(elsewhere).toHaveFocus();
    for (const cell of canvas.getAllByRole("gridcell")) {
        expect(cell).toHaveAttribute("aria-selected", "false");
    }

    await userEvent.click(canvas.getByRole("button", { name: "+ Row" }));
    await userEvent.click(elsewhere);
    await waitFor(() => expect(canvas.getAllByRole("gridcell")).toHaveLength(3));
    expect(elsewhere).toHaveFocus();
    for (const cell of canvas.getAllByRole("gridcell")) {
        expect(cell).toHaveAttribute("aria-selected", "false");
    }
});

test("FocusAfterDelete", async () => {
    const canvasElement = mount(() => (
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
    ));

    const canvas = within(canvasElement);

    await userEvent.click(canvas.getAllByRole("gridcell")[0]!);
    await userEvent.click(canvas.getAllByRole("button", { name: "Delete row" })[1]!);
    await waitFor(async () => {
        const firstCell = canvas.getAllByRole("gridcell")[0]!;
        expect(firstCell).toHaveTextContent("First");
        await expectActiveCell(firstCell);
    });

    await userEvent.click(canvas.getAllByRole("button", { name: "Delete row" })[0]!);
    await waitFor(async () => {
        const remainingCell = canvas.getByRole("gridcell");
        expect(remainingCell).toHaveTextContent("Third");
        await expectActiveCell(remainingCell);
    });
});

test("DeleteWithoutFocus", async () => {
    const canvasElement = mount(() => (
        <div>
            <button type="button">Elsewhere</button>
            <SingleTable
                initialSpec={{
                    ...focusSpec,
                    rows: [...focusSpec.rows, { id: "focus-2", values: { value: "Second" } }],
                }}
            />
        </div>
    ));

    const canvas = within(canvasElement);
    const elsewhere = canvas.getByRole("button", { name: "Elsewhere" });

    await userEvent.click(elsewhere);
    await userEvent.click(canvas.getAllByRole("button", { name: "Delete row" })[0]!);

    await waitFor(() => expect(canvas.getAllByRole("gridcell")).toHaveLength(1));
    expect(elsewhere).toHaveFocus();
    expect(canvas.getByRole("gridcell")).toHaveAttribute("aria-selected", "false");
});

test("AddRowButtonFocusesNewRow", async () => {
    const canvasElement = mount(() => <SingleTable initialSpec={focusSpec} addRowDelay={100} />);

    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Row" }));

    await waitFor(async () => {
        const cells = canvas.getAllByRole("gridcell");
        expect(cells).toHaveLength(2);
        await expectActiveCell(cells[1]!);
    });
});

test("ContinueEditingAfterAsyncAdd", async () => {
    const canvasElement = mount(() => (
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
    ));

    const canvas = within(canvasElement);
    await userEvent.dblClick(canvas.getAllByRole("gridcell")[1]!);
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Updated second row");
    await userEvent.keyboard("{Enter}");

    await waitFor(async () => {
        const cells = canvas.getAllByRole("gridcell");
        expect(cells).toHaveLength(3);
        expect(cells[1]).toHaveTextContent("Updated second row");
        await expectActiveCell(cells[2]!);
    });
});

test("RemoteRowDeleteWhileEditing", async () => {
    const canvasElement = mount(() => <ConcurrentTable initialSpec={concurrentSpec} />);

    const canvas = within(canvasElement);
    await userEvent.dblClick(canvas.getAllByRole("gridcell")[1]!);
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Edited");

    await userEvent.click(canvas.getByRole("button", { name: "Remove first row" }));
    await waitFor(() => expect(canvas.getAllByRole("gridcell")).toHaveLength(2));
    // The editor follows its row to the new position, keeping the text.
    expect(canvas.getByRole("textbox")).toHaveValue("Edited");
    expect(canvas.getByRole("textbox")).toHaveFocus();
    expect(canvas.getByTestId("writes")).toHaveTextContent("0");

    await userEvent.keyboard("{Enter}");
    const cells = canvas.getAllByRole("gridcell");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveTextContent("Edited");
    expect(cells[1]).toHaveTextContent("Third");
    await expectActiveCell(cells[1]!);
    expect(canvas.getByTestId("writes")).toHaveTextContent("1");
});

test("RemoteColumnInsertWhileEditing", async () => {
    const canvasElement = mount(() => <ConcurrentTable initialSpec={concurrentSpec} />);

    const canvas = within(canvasElement);
    await userEvent.dblClick(canvas.getAllByRole("gridcell")[0]!);
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Edited");

    await userEvent.click(canvas.getByRole("button", { name: "Insert column before" }));
    await waitFor(() => expect(canvas.getAllByRole("columnheader")).toHaveLength(4));
    // The editor follows its column to the new position, keeping the text.
    const editing = canvas.getByRole("textbox");
    expect(editing).toHaveValue("Edited");
    expect(editing).toHaveFocus();
    expect(canvas.getAllByRole("gridcell")[1]).toContainElement(editing);

    await userEvent.keyboard("{Enter}");
    const cells = canvas.getAllByRole("gridcell");
    expect(cells).toHaveLength(6);
    expect(cells[0]).toHaveTextContent("");
    expect(cells[1]).toHaveTextContent("Edited");
    expect(cells[3]).toHaveTextContent("Second");
    await expectActiveCell(cells[3]!);
    expect(canvas.getByTestId("writes")).toHaveTextContent("1");
});

test("RemoteDeleteOfEditedRow", async () => {
    const canvasElement = mount(() => <ConcurrentTable initialSpec={concurrentSpec} />);

    const canvas = within(canvasElement);
    await userEvent.dblClick(canvas.getAllByRole("gridcell")[0]!);
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Edited");

    await userEvent.click(canvas.getByRole("button", { name: "Remove first row" }));
    await waitFor(() => expect(canvas.getAllByRole("gridcell")).toHaveLength(2));
    // The edit is dropped rather than written to whichever row took its place.
    expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    expect(canvas.getByTestId("writes")).toHaveTextContent("0");
    const cells = canvas.getAllByRole("gridcell");
    expect(cells[0]).toHaveTextContent("Second");
    expect(cells[1]).toHaveTextContent("Third");
    await expectActiveCell(cells[0]!);
});

test("StableColumnWidths", async () => {
    const canvasElement = mount(() => (
        <>
            <p>Constraining the table to a width does not make it escape its container.</p>
            <div style={{ width: "300px" }}>
                <EditableTables initialSpecs={[teamSpec, personSpec]} />
            </div>
        </>
    ));

    const tables = within(canvasElement).getAllByRole("grid");
    const table = tables[1]!;
    const rowRefCell = within(table).getAllByRole("gridcell")[4]!;
    const tableWidth = table.getBoundingClientRect().width;
    const columnWidth = rowRefCell.getBoundingClientRect().width;

    await userEvent.dblClick(rowRefCell);
    expect(within(rowRefCell).getByRole("textbox")).toHaveFocus();
    expect(table.getBoundingClientRect().width).toBe(tableWidth);
    expect(rowRefCell.getBoundingClientRect().width).toBe(columnWidth);
});

test("VirtualizedRows", async () => {
    const canvasElement = mount(() => (
        <EditableTables
            trackWrites
            initialSpecs={[
                {
                    id: "large",
                    label: "Large table",
                    columns: [{ id: "value", label: "Value", type: "String" }],
                    rows: Array.from({ length: 10000 }, (_, index) => ({
                        id: `row-${index}`,
                        values: { value: `Value ${index}` },
                    })),
                },
            ]}
        />
    ));

    const canvas = within(canvasElement);
    const table = canvas.getByRole("grid");
    const scrollArea = table.parentElement!;
    await waitFor(() => expect(canvas.getAllByRole("gridcell").length).toBeLessThan(100));
    const first = canvas.getAllByRole("gridcell")[0]!;
    expect(first.closest("tr")!.getBoundingClientRect().height).toBe(29);
    await userEvent.click(first);
    // Moving past the rendered window mounts the next row before focusing it.
    await userEvent.keyboard("{ArrowDown>40/}");
    await waitFor(() => expectActiveCell(canvas.getByText("Value 40").closest("td")!));
    // Manual scrolling may recycle the focused row, but keeps keyboard focus
    // in the grid rather than losing it to the document body.
    scrollArea.scrollTop = scrollArea.scrollHeight;
    scrollArea.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(canvas.getByText("Value 9999")).toBeInTheDocument());
    expect(table).toHaveFocus();
    expect(table).not.toHaveAttribute("aria-activedescendant");
    expect(canvas.getAllByRole("gridcell").length).toBeLessThan(100);
    await userEvent.keyboard("{ArrowUp}");
    await waitFor(() => expectActiveCell(canvas.getByText("Value 39").closest("td")!));
    await userEvent.dblClick(canvas.getByText("Value 39").closest("td")!);
    await userEvent.keyboard(" updated");
    scrollArea.scrollTop = scrollArea.scrollHeight;
    scrollArea.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(canvas.getByText("Value 9999")).toBeInTheDocument());
    expect(scrollArea).toHaveFocus();
    scrollArea.scrollTop = 39 * 29;
    scrollArea.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(canvas.getByText("Value 39 updated")).toBeInTheDocument());
    expect(scrollArea).toHaveFocus();
    expect(canvas.getAllByRole("listitem")).toHaveLength(1);
    expect(canvas.getByText("Value 39 updated").closest("tr")).toHaveAttribute(
        "aria-rowindex",
        "41",
    );
    scrollArea.scrollTop = scrollArea.scrollHeight;
    scrollArea.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(canvas.getByText("Value 9999")).toBeInTheDocument());
    await userEvent.dblClick(canvas.getByText("Value 9999").closest("td")!);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(table).toHaveAttribute("aria-rowcount", "10002"));
    await waitFor(() => expectActiveCell(canvas.getAllByRole("gridcell").at(-1)!));
    await userEvent.click(canvas.getAllByRole("button", { name: "Delete row" }).at(-1)!);
    await waitFor(() => expect(table).toHaveAttribute("aria-rowcount", "10001"));
    await waitFor(() => expectActiveCell(canvas.getByText("Value 9999").closest("td")!));
    // The grid remains the single cell-navigation Tab stop after focus leaves.
    canvasElement.tabIndex = -1;
    canvasElement.focus();
    await waitFor(() => expect(table.tabIndex).toBe(0));
});

test("ScrollIndicators", async () => {
    const canvasElement = mount(() => (
        <div style={{ width: "240px", "--table-editor-max-height": "120px" }}>
            <EditableTables
                initialSpecs={[
                    {
                        id: "scroll-indicators",
                        label: "Scrollable table",
                        columns: [
                            { id: "first", label: "First", type: "String" },
                            { id: "second", label: "Second", type: "String" },
                        ],
                        rows: Array.from({ length: 12 }, (_, index) => ({
                            id: `row-${index}`,
                            values: { first: `Value ${index}`, second: "Other" },
                        })),
                    },
                ]}
            />
        </div>
    ));

    const canvas = within(canvasElement);
    const table = canvas.getByRole("grid");
    const scrollArea = table.parentElement!;
    const container = canvasElement.firstElementChild as HTMLElement;
    const hasCue = (direction: string) =>
        canvasElement.querySelector(`[data-scroll-direction="${direction}"]`) !== null;
    await waitFor(async () => {
        expect(hasCue("bottom")).toBe(true);
        expect(hasCue("right")).toBe(true);
        expect(hasCue("top")).toBe(false);
        expect(hasCue("left")).toBe(false);
    });
    scrollArea.scrollTop = scrollArea.scrollHeight;
    scrollArea.scrollLeft = scrollArea.scrollWidth;
    scrollArea.dispatchEvent(new Event("scroll"));
    await waitFor(async () => {
        expect(hasCue("top")).toBe(true);
        expect(hasCue("left")).toBe(true);
        expect(hasCue("bottom")).toBe(false);
        expect(hasCue("right")).toBe(false);
    });
    container.style.width = "600px";
    container.style.setProperty("--table-editor-max-height", "600px");
    await waitFor(() =>
        expect(canvasElement.querySelectorAll("[data-scroll-direction]")).toHaveLength(0),
    );
    // Adding/removing content updates overflow even if viewport width is unchanged.
    container.style.setProperty("--table-editor-max-height", "400px");
    await userEvent.click(canvas.getByRole("button", { name: "+ Row" }));
    await waitFor(() => expect(table).toHaveAttribute("aria-rowcount", "14"));
    await waitFor(() => expect(hasCue("top")).toBe(true));
    await userEvent.click(canvas.getAllByRole("button", { name: "Delete row" }).at(-1)!);
    await waitFor(() =>
        expect(canvasElement.querySelectorAll("[data-scroll-direction]")).toHaveLength(0),
    );
});

test("ScrollStability", async () => {
    const canvasElement = mount(() => (
        <div style={{ width: "260px", "--table-editor-max-height": "150px" }}>
            <EditableTables
                remoteUpdates
                trackWrites
                initialSpecs={[
                    {
                        id: "wide",
                        label: "Wide",
                        columns: [
                            { id: "name", label: "Name", type: "String" },
                            { id: "enabled", label: "Enabled", type: "Bool" },
                            { id: "team", label: "Team", type: { rowRef: "team" } },
                            { id: "last", label: "Last", type: "String" },
                        ],
                        rows: Array.from({ length: 100 }, (_, index) => ({
                            id: `wide-${index}`,
                            values: {
                                name: `Name ${index}`,
                                enabled: false,
                                last: `Last ${index}`,
                            },
                        })),
                    },
                    teamSpec,
                ]}
            />
        </div>
    ));

    const canvas = within(canvasElement);
    const table = canvas.getAllByRole("grid")[0]!;
    const area = table.parentElement!;
    const container = canvasElement.firstElementChild as HTMLElement;
    area.scrollTop = 30 * 29;
    area.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(within(table).getByText("Name 30")).toBeInTheDocument());
    const name = within(table).getByText("Name 30").closest("td")!;
    await userEvent.dblClick(name);
    await userEvent.keyboard(" updated");
    expect(name.closest("tr")!.getBoundingClientRect().height).toBe(29);
    const top = area.scrollTop;
    const left = area.scrollLeft;
    // Blur closes the editor without changing the selected cell or either offset.
    area.focus({ preventScroll: true });
    await waitFor(() => expect(name).toHaveTextContent("Name 30 updated"));
    expect(area.scrollTop).toBe(top);
    expect(area.scrollLeft).toBe(left);
    expect(canvas.getAllByRole("listitem")).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: "Remote update" }));
    await waitFor(() => expect(name).toHaveTextContent("Remote"));
    expect(area.scrollTop).toBe(top);
    expect(area.scrollLeft).toBe(left);

    await userEvent.keyboard("{ArrowRight}");
    const row = name.closest("tr")!;
    const checkbox = within(row).getByRole("checkbox");
    const boolLeft = area.scrollLeft;
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(area.scrollTop).toBe(top);
    expect(area.scrollLeft).toBe(boolLeft);
    await userEvent.keyboard("{ArrowRight}");
    const refCell = within(row).getAllByRole("gridcell")[2]!;
    await expectActiveCell(refCell);
    expect(area.scrollLeft).toBeGreaterThan(0);
    await userEvent.keyboard("{Enter}");
    const refLeft = area.scrollLeft;
    await userEvent.click(within(document.body).getAllByRole("option")[0]!);
    await expectActiveCell(refCell);
    expect(area.scrollTop).toBe(top);
    expect(area.scrollLeft).toBe(refLeft);
    expect(canvas.getAllByRole("listitem")).toHaveLength(3);

    // Resize while focused: keep the selected row below the sticky header.
    container.style.setProperty("--table-editor-max-height", "100px");
    container.style.width = "240px";
    await waitFor(() => expect(area.clientHeight).toBeLessThanOrEqual(100));
    await waitFor(() =>
        expect(refCell.getBoundingClientRect().right).toBeLessThanOrEqual(
            area.getBoundingClientRect().left + area.clientWidth + 1,
        ),
    );
    await expectActiveCell(refCell);
    const bounds = refCell.getBoundingClientRect();
    expect(bounds.top).toBeGreaterThanOrEqual(
        table.querySelector("thead")!.getBoundingClientRect().bottom - 1,
    );
    // Recycling an open popup closes it without a stray field write.
    await userEvent.keyboard("{Enter}");
    area.scrollTop = area.scrollHeight;
    area.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(within(table).getByText("Last 99")).toBeInTheDocument());
    expect(area).toHaveFocus();
    expect(within(document.body).queryAllByRole("option")).toHaveLength(0);
    expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    // No focus theft when the old selection is manually brought back into view.
    area.scrollTop = 30 * 29;
    area.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(table.querySelector('[aria-rowindex="32"]')).toBeInTheDocument());
    expect(area).toHaveFocus();
    // Leaving after recycling keeps all visible cells reachable by Tab.
    const outside = canvas.getByRole("button", { name: "Remote update" });
    outside.focus();
    await waitFor(() => expect(table.tabIndex).toBe(0));
    await userEvent.tab();
    await waitFor(() => expect(table.contains(document.activeElement)).toBe(true));
});

/** A table alongside buttons simulating structural changes from elsewhere. */
function StructuralChangesTable() {
    // Initial story data, intentionally captured on mount.
    const [spec, setSpec] = createSignal<TableSpec>({
        id: "structural",
        label: "Structural",
        columns: [{ id: "name", label: "Name", type: "String" }],
        rows: Array.from({ length: 1000 }, (_, index) => ({
            id: `row-${index}`,
            values: { name: `Row ${index}` },
        })),
    });
    const [writes, setWrites] = createSignal(0);
    const focus = useChildFocus<string>(rootFocus);
    const table = () => toInstanceTable(spec());
    return (
        <div style={{ "--table-editor-max-height": "150px" }}>
            <button
                onMouseDown={(evt) => evt.preventDefault()}
                onClick={() => setSpec((s) => ({ ...s, rows: s.rows.slice(900) }))}
            >
                Remove prefix
            </button>
            <button
                onMouseDown={(evt) => evt.preventDefault()}
                onClick={() => setSpec((s) => ({ ...s, rows: s.rows.slice(0, -1) }))}
            >
                Remove edited row
            </button>
            <button onClick={() => setSpec((s) => ({ ...s, rows: s.rows.slice(0, 2) }))}>
                Shrink outside
            </button>
            <span data-testid="write-count">{writes()}</span>
            <TableEditor
                table={table()}
                allTables={[table()]}
                focus={focus.childFocus("table")}
                onSetField={(row, header, value) => {
                    setWrites((n) => n + 1);
                    setSpec((s) => setSpecField(s, row, header, value as LiteralValue));
                }}
                onAddRow={() =>
                    setTimeout(
                        () =>
                            setSpec((s) => ({
                                ...s,
                                rows: [...s.rows, { id: "appended", values: {} }],
                            })),
                        100,
                    )
                }
                onDeleteRow={(row) =>
                    setSpec((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== row.id) }))
                }
            />
        </div>
    );
}

test("VirtualizedStructuralChanges", async () => {
    const canvasElement = mount(() => <StructuralChangesTable />);

    const canvas = within(canvasElement);
    const table = canvas.getByRole("grid");
    const area = table.parentElement!;
    area.scrollTop = area.scrollHeight;
    area.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(canvas.getByText("Row 999")).toBeInTheDocument());
    await userEvent.dblClick(canvas.getByText("Row 999").closest("td")!);
    await userEvent.keyboard(" draft");
    await userEvent.click(canvas.getByRole("button", { name: "Remove prefix" }));
    await waitFor(() => expect(table).toHaveAttribute("aria-rowcount", "101"));
    expect(canvas.getByRole("textbox")).toHaveValue("Row 999 draft");
    expect(canvas.getByRole("textbox")).toHaveFocus();
    expect(canvas.getByRole("textbox").closest("tr")).toHaveAttribute("aria-rowindex", "101");
    expect(canvas.getByTestId("write-count")).toHaveTextContent("0");
    await userEvent.click(canvas.getByRole("button", { name: "Remove edited row" }));
    await waitFor(() => expectActiveCell(canvas.getByText("Row 998").closest("td")!));
    expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    expect(canvas.getByTestId("write-count")).toHaveTextContent("0");
    // Leave before a delayed append arrives: it must not regain browser focus.
    await userEvent.click(canvas.getByRole("button", { name: "+ Row" }));
    const outside = canvas.getByRole("button", { name: "Shrink outside" });
    outside.focus();
    await waitFor(() => expect(table).toHaveAttribute("aria-rowcount", "101"));
    expect(outside).toHaveFocus();
    // Large unfocused shrink clamps the stale virtual offset and spacer.
    await userEvent.click(outside);
    await waitFor(() => expect(table).toHaveAttribute("aria-rowcount", "3"));
    await waitFor(() => expect(area.scrollTop).toBe(0));
    expect(canvas.getByText("Row 900")).toBeInTheDocument();
    expect(outside).toHaveFocus();
});
