import { Index } from "solid-js";
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

/** Renders read-only table editors backed by in-memory table specs. */
function TableViews(props: { initialSpecs: TableSpec[] }) {
    const tables = () => props.initialSpecs.map(toInstanceTable);
    const focus = useChildFocus<string>(rootFocus);

    return (
        <div style={{ display: "flex", "flex-wrap": "wrap", gap: "1.5rem" }}>
            <Index each={tables()}>
                {(table) => (
                    <TableEditor
                        table={table()}
                        tables={tables()}
                        focus={focus.childFocus(table().id)}
                        onSetField={() => {}}
                        onAddRow={() => {}}
                        onDeleteRow={() => {}}
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
    render: () => <TableViews initialSpecs={[teamSpec, personSpec]} />,
};

export const KeyboardNavigation: Story = {
    render: () => <TableViews initialSpecs={[teamSpec]} />,
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
    render: () => <TableViews initialSpecs={[teamSpec]} />,
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
            <TableViews initialSpecs={[teamSpec, personSpec]} />
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
        <TableViews
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
        <TableViews
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
