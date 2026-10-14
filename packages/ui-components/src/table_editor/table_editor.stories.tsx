import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { TableEditor } from "./table_editor";
import {
    EditableTables,
    teamSpec,
    personSpec,
    focusSpec,
    SingleTable,
} from "./table_editor.fixtures";

const meta = {
    title: "Forms & Inputs/TableEditor",
    component: TableEditor,
} satisfies Meta<typeof TableEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec, personSpec]} />,
    tags: ["!autodocs", "!dev"],
};

export const HideTable: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec, personSpec]} hideable />,
};

export const EditingBooleans: Story = {
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
};

export const SelectingRelatedRows: Story = {
    render: () => <EditableTables initialSpecs={[teamSpec, personSpec]} />,
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
};

export const OrphanedColumn: Story = {
    render: () => (
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
    ),
};

export const AddingRows: Story = {
    render: () => (
        <div>
            <p>Edit the last cell and press Enter to add a row and keep typing.</p>
            <SingleTable
                initialSpec={{
                    ...focusSpec,
                    rows: [...focusSpec.rows, { id: "focus-2", values: { value: "Second" } }],
                }}
            />
        </div>
    ),
};

export const ScrollIndicators: Story = {
    render: () => (
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
    ),
};
