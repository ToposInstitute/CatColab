import { createSignal, Index } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

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

import styles from "./table_editor.module.css";

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

/** Describes a committed field write for the commit log. */
function describeValue(value: LiteralValue | TableRow): string {
    if (typeof value === "object" && value !== null) {
        return `row ${value.id}`;
    }
    return value === null ? "null" : String(value);
}

/** Renders editable table editors backed by in-memory table specs.

Every committed field write is logged, so that stories can assert exactly-once
commits.
 */
function EditableTables(props: { initialSpecs: TableSpec[]; remoteUpdates?: boolean }) {
    const [specs, setSpecs] = createSignal(props.initialSpecs);
    const [commits, setCommits] = createSignal<string[]>([]);
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
        const stored: LiteralValue | { rowId: string } =
            typeof value === "object" && value !== null ? { rowId: value.id } : value;
        setCommits((commits) => [
            ...commits,
            `${tableId}.${header.id}[${row.id}] = ${describeValue(value)}`,
        ]);
        updateSpec(tableId, (spec) => ({
            ...spec,
            rows: spec.rows.map((specRow) =>
                specRow.id === row.id
                    ? { ...specRow, values: { ...specRow.values, [header.id]: stored } }
                    : specRow,
            ),
        }));
    };

    return (
        <div>
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
            <ol data-testid="commit-log">
                <Index each={commits()}>{(commit) => <li>{commit()}</li>}</Index>
            </ol>
            <div style={{ display: "flex", "flex-wrap": "wrap", gap: "1.5rem" }}>
                <Index each={tables()}>
                    {(table) => (
                        <TableEditor
                            table={table()}
                            tables={tables()}
                            focus={focus.childFocus(table().id)}
                            onSetField={(row, header, value) =>
                                setField(table().id, row, header, value)
                            }
                            onAddRow={() => {}}
                            onDeleteRow={() => {}}
                        />
                    )}
                </Index>
            </div>
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
        { id: "team", label: "team", type: { rowRef: "team" } },
        { id: "active", label: "active", type: "Bool" },
        { id: "score", label: "score", type: "Float" },
    ],
    rows: [
        {
            id: "person-ada",
            values: { name: "Ada", team: { rowId: "team-atlas" }, active: true, score: 3.5 },
        },
        {
            id: "person-bob",
            values: { name: "Bob", team: { rowId: "team-canopy" }, active: false, score: null },
        },
        { id: "person-cleo", values: { name: "", team: null, active: true, score: 0 } },
    ],
};

export const Summary: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec, personSpec]} />,
};

export const EditString: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec]} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cells = canvas.getAllByRole("gridcell");

        // Typing on a selected cell replaces its content.
        await userEvent.click(cells[0]!);
        await userEvent.keyboard("Greta");
        const input = within(cells[0]!).getByRole("textbox");
        await expect(input).toHaveValue("Greta");

        await userEvent.keyboard("{Enter}");
        await expect(cells[0]).toHaveTextContent("Greta");
        await expect(canvas.getAllByRole("listitem")).toHaveLength(1);
        await expect(canvas.getAllByRole("listitem")[0]).toHaveTextContent(
            "team.name[team-atlas] = Greta",
        );

        // Committing moves the selection down.
        await expect(cells[2]).toHaveFocus();
        await expect(cells[0]).toHaveAttribute("aria-selected", "false");
        await expect(cells[2]).toHaveAttribute("aria-selected", "true");
    },
};

export const InvalidIntReverts: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec]} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cells = canvas.getAllByRole("gridcell");

        await userEvent.click(cells[1]!);
        await userEvent.keyboard("abc");
        const input = within(cells[1]!).getByRole("textbox");
        await expect(input).toHaveValue("abc");
        await expect(input).toHaveClass(styles.invalid);
        await expect(cells[1]).toHaveClass(styles.selected);

        await userEvent.keyboard("{Enter}");
        // Invalid input is dropped: the cell keeps its previous value, but the
        // selection still moves on.
        await expect(cells[1]).toHaveTextContent("5");
        await expect(cells[3]).toHaveFocus();
        await expect(canvas.queryAllByRole("listitem")).toHaveLength(0);
    },
};

export const EscapeCancels: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec]} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cells = canvas.getAllByRole("gridcell");

        await userEvent.click(cells[0]!);
        await userEvent.keyboard("Greta");
        await userEvent.keyboard("{Escape}");
        await expect(cells[0]).toHaveTextContent("Atlas");
        await expect(cells[0]).toHaveFocus();
        await expect(canvas.queryAllByRole("listitem")).toHaveLength(0);
    },
};

export const BlurCommits: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec]} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cells = canvas.getAllByRole("gridcell");

        await userEvent.click(cells[0]!);
        await userEvent.keyboard("Greta");
        // Committing from a blurred editor must not steal focus back: the
        // clicked cell takes the selection.
        await userEvent.click(cells[3]!);
        await expect(cells[0]).toHaveTextContent("Greta");
        await expect(cells[3]).toHaveFocus();
        await expect(cells[3]).toHaveAttribute("aria-selected", "true");
        await expect(cells[0]).toHaveAttribute("aria-selected", "false");
        await expect(canvas.getAllByRole("listitem")).toHaveLength(1);
    },
};

export const DeleteClears: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec]} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cells = canvas.getAllByRole("gridcell");

        await userEvent.click(cells[0]!);
        await userEvent.keyboard("{Delete}");
        await expect(cells[0]).toHaveTextContent("");
        await expect(canvas.getAllByRole("listitem")[0]).toHaveTextContent(
            "team.name[team-atlas] = null",
        );
        // The selection stays put after clearing.
        await expect(cells[0]).toHaveFocus();
        await expect(canvas.getAllByRole("listitem")).toHaveLength(1);
    },
};

export const ToggleBooleans: Story = {
    render: () => (
        <EditableTables
            initialSpecs={[
                {
                    id: "boolean",
                    label: "Boolean",
                    columns: [{ id: "active", label: "active", type: "Bool" }],
                    rows: [
                        { id: "boolean-1", values: { active: true } },
                        { id: "boolean-2", values: { active: false } },
                    ],
                },
            ]}
        />
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cells = canvas.getAllByRole("gridcell");
        const checkbox = within(cells[0]!).getByRole("checkbox") as HTMLInputElement;

        // Clicking the checkbox itself toggles the value.
        await expect(checkbox).toBeChecked();
        await userEvent.click(checkbox);
        await expect(checkbox).not.toBeChecked();

        // Enter and Space toggle the selected boolean cell as well.
        await userEvent.keyboard("{Enter}");
        await expect(checkbox).toBeChecked();
        await userEvent.keyboard(" ");
        await expect(checkbox).not.toBeChecked();

        await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
        await expect(canvas.getAllByRole("listitem")[0]).toHaveTextContent("= false");
        await expect(canvas.getAllByRole("listitem")[1]).toHaveTextContent("= true");
        await expect(canvas.getAllByRole("listitem")[2]).toHaveTextContent("= false");
    },
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
        const cell = canvas.getAllByRole("gridcell")[0]!;
        const checkbox = within(cell).getByRole("checkbox") as HTMLInputElement;

        await expect(checkbox).toBeChecked();
        await userEvent.dblClick(cell);
        await expect(checkbox).not.toBeChecked();
    },
};

export const CommitWithTab: Story = {
    render: () => (
        <div>
            <button type="button">Before table</button>
            <EditableTables initialSpecs={[teamSpec]} />
        </div>
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cells = canvas.getAllByRole("gridcell");

        await userEvent.click(cells[0]!);
        await userEvent.keyboard("{Enter}");
        await expect(within(cells[0]!).getByRole("textbox")).toHaveFocus();

        // Tab commits and moves forward through the grid.
        await userEvent.tab();
        await expect(cells[1]).toHaveFocus();
        await expect(canvas.getAllByRole("listitem")).toHaveLength(1);

        await userEvent.tab({ shift: true });
        await expect(cells[0]).toHaveFocus();

        // At the first cell, Shift+Tab leaves the grid; the draft commits on
        // blur without moving the selection.
        await userEvent.keyboard("Greta");
        await userEvent.tab({ shift: true });
        await expect(canvas.getByRole("button", { name: "Before table" })).toHaveFocus();
        await expect(cells[0]).toHaveTextContent("Greta");
        await expect(canvas.getAllByRole("listitem")).toHaveLength(2);
        await expect(canvas.getAllByRole("listitem")[1]).toHaveTextContent(
            "team.name[team-atlas] = Greta",
        );
        await expect(cells[0]).toHaveAttribute("aria-selected", "false");
    },
};

export const KeyboardExitFocus: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec]} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cells = canvas.getAllByRole("gridcell");
        const last = cells[5]!;
        // Repeated exits at a boundary must request focus even with no selection change.
        await userEvent.click(last);
        await userEvent.keyboard("7{Enter}");
        await expect(last).toHaveFocus();
        await expect(last).toHaveTextContent("7");
        await userEvent.keyboard("8");
        await userEvent.tab();
        await expect(last).toHaveFocus();
        await expect(last).toHaveTextContent("8");
        await expect(canvas.getAllByRole("listitem")).toHaveLength(2);

        await userEvent.keyboard("9{Escape}");
        await expect(last).toHaveFocus();
        await expect(last).toHaveTextContent("8");
        await userEvent.keyboard("0{Escape}");
        await expect(last).toHaveFocus();
        await expect(canvas.getAllByRole("listitem")).toHaveLength(2);

        await userEvent.keyboard("{F2}");
        await userEvent.tab({ shift: true });
        await expect(cells[4]).toHaveFocus();
        await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    },
};

export const BlurOutsideFocus: Story = {
    render: () => (
        <div>
            <EditableTables initialSpecs={[teamSpec]} remoteUpdates />
            <button type="button">Outside</button>
            <div data-testid="outside-area">Non-focusable outside area</div>
        </div>
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cells = canvas.getAllByRole("gridcell");
        const outside = canvas.getByRole("button", { name: "Outside" });
        const update = canvas.getByRole("button", { name: "Remote update" });

        // A previous keyboard focus request must not replay on subsequent blur.
        await userEvent.click(cells[0]!);
        await userEvent.keyboard("Cancelled{Escape}");
        await userEvent.keyboard("Greta");
        await userEvent.click(outside);
        await expect(outside).toHaveFocus();
        await expect(cells[0]).toHaveTextContent("Greta");
        await expect(cells[0]).toHaveAttribute("aria-selected", "false");
        await expect(canvas.getAllByRole("listitem")).toHaveLength(1);
        await userEvent.click(update);
        await expect(outside).toHaveFocus();
        await expect(cells[0]).toHaveTextContent("Remote");

        // Invalid blur drops the draft without moving outside focus.
        await userEvent.click(cells[1]!);
        await userEvent.keyboard("invalid");
        await userEvent.click(outside);
        await expect(outside).toHaveFocus();
        await expect(cells[1]).toHaveTextContent("5");
        await expect(canvas.getAllByRole("listitem")).toHaveLength(1);

        // Removing the focused editor while focus goes to body is not a restore request.
        await userEvent.click(cells[0]!);
        await userEvent.keyboard("Body");
        await userEvent.click(canvas.getByTestId("outside-area"));
        await expect(document.body).toHaveFocus();
        await expect(cells[0]).toHaveTextContent("Body");
        await expect(cells[0]).toHaveAttribute("aria-selected", "false");
        await expect(canvas.getAllByRole("listitem")).toHaveLength(2);
        await userEvent.click(update);
        await expect(document.body).toHaveFocus();

        // Re-entry and editing still work after blur and reactive updates.
        await userEvent.click(cells[0]!);
        await userEvent.keyboard("{F2}");
        await expect(within(cells[0]!).getByRole("textbox")).toHaveFocus();
        await userEvent.keyboard("{Escape}");
        await expect(cells[0]).toHaveFocus();
    },
};

export const ReactiveUpdateFocus: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec, personSpec]} remoteUpdates />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const update = canvas.getByRole("button", { name: "Remote update" });
        const cells = within(canvas.getAllByRole("grid")[0]!).getAllByRole("gridcell");
        await userEvent.click(cells[1]!);
        await userEvent.click(update);
        await expect(cells[1]).toHaveFocus();

        await userEvent.click(cells[0]!);
        await userEvent.keyboard("Draft");
        const input = within(cells[0]!).getByRole("textbox");
        await userEvent.click(update);
        await expect(input).toHaveFocus();
        await expect(input).toHaveValue("Draft");
        await userEvent.keyboard("{Escape}");
        await expect(cells[0]).toHaveFocus();
        await expect(cells[0]).toHaveTextContent("Remote");
        await expect(canvas.queryAllByRole("listitem")).toHaveLength(0);

        // Selection is not an instruction to steal focus from a nested checkbox.
        const checkbox = within(canvas.getAllByRole("grid")[1]!).getAllByRole("checkbox")[0]!;
        await userEvent.click(checkbox);
        checkbox.focus();
        await userEvent.click(update);
        await expect(checkbox).toHaveFocus();
        await expect(canvas.getAllByRole("listitem")).toHaveLength(1);
    },
};

export const KeyboardNavigation: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec]} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cells = canvas.getAllByRole("gridcell");
        await userEvent.click(cells[0]!);
        await expect(cells[0]).toHaveFocus();
        await expect(cells[0]).toHaveAttribute("aria-selected", "true");

        await userEvent.keyboard("{ArrowRight}");
        await expect(cells[1]).toHaveFocus();
        await expect(cells[1]).toHaveAttribute("aria-selected", "true");
        await expect(cells[0]).toHaveAttribute("aria-selected", "false");

        await userEvent.keyboard("{ArrowDown}");
        await expect(cells[3]).toHaveFocus();
    },
};

export const FocusBoundaries: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec]} />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const cells = canvas.getAllByRole("gridcell");
        const addRow = canvas.getByRole("button", { name: "+ Row" });

        await expect(cells[0]).toHaveAttribute("tabindex", "0");
        await expect(cells[1]).toHaveAttribute("tabindex", "-1");

        await userEvent.tab();
        await expect(cells[0]).toHaveFocus();
        for (let i = 1; i < cells.length; i++) {
            await userEvent.tab();
            await expect(cells[i]).toHaveFocus();
        }
        await userEvent.tab();
        await expect(addRow).toHaveFocus();
    },
};

export const FocusReentry: Story = {
    render: () => (
        <div>
            <button type="button">Before</button>
            <EditableTables initialSpecs={[teamSpec, personSpec]} />
            <button type="button">After</button>
        </div>
    ),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const grids = canvas.getAllByRole("grid");
        const teamCells = within(grids[0]!).getAllByRole("gridcell");
        const personCells = within(grids[1]!).getAllByRole("gridcell");
        await userEvent.click(teamCells[1]!);
        await userEvent.tab({ shift: true });
        await expect(teamCells[0]).toHaveFocus();
        await userEvent.tab({ shift: true });
        await expect(canvas.getByRole("button", { name: "Before" })).toHaveFocus();
        await expect(teamCells[0]).toHaveAttribute("aria-selected", "false");
        await userEvent.tab();
        await expect(teamCells[0]).toHaveFocus();

        await userEvent.click(personCells[0]!);
        await expect(personCells[0]).toHaveFocus();
        await expect(teamCells[0]).toHaveAttribute("aria-selected", "false");
        await userEvent.keyboard("{ArrowRight}");
        await expect(personCells[1]).toHaveFocus();

        await userEvent.click(canvas.getByRole("button", { name: "After" }));
        await expect(personCells[1]).toHaveAttribute("aria-selected", "false");
        await userEvent.tab({ shift: true });
        await expect(canvas.getAllByRole("button", { name: "+ Row" })[1]).toHaveFocus();
        await userEvent.tab({ shift: true });
        await expect(personCells[0]).toHaveFocus();
    },
};

export const EmptyColumns: Story = {
    render: () => (
        <EditableTables
            initialSpecs={[
                {
                    id: "bare",
                    label: "Bare",
                    columns: [],
                    rows: [{ id: "bare-1", values: {} }],
                },
            ]}
        />
    ),
};

export const Unnamed: Story = {
    render: () => (
        <EditableTables
            initialSpecs={[
                {
                    id: "unnamed",
                    label: "",
                    columns: [{ id: "x", label: null, type: "String" }],
                    rows: [{ id: "unnamed-1", values: { x: "content" } }],
                },
                {
                    id: "orphan",
                    label: null,
                    columns: [{ id: "y", label: null, type: "Unknown" }],
                    rows: [{ id: "orphan-1", values: {} }],
                },
            ]}
        />
    ),
};
