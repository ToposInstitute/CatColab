import { createSignal } from "solid-js";
import { userEvent, waitFor, within } from "storybook/test";
import { test, expect } from "vitest";

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
