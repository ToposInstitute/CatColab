import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { ExpandableTable } from "./expandable_table";
import { KatexDisplay } from "./katex_display";

const meta = {
    title: "Layout/ExpandableTable",
    component: ExpandableTable,
    argTypes: {
        threshold: {
            control: "number",
            description: "Number of rows to show before truncation",
            table: {
                defaultValue: { summary: "3" },
            },
        },
        columns: {
            description: "Column definitions with header and cell renderer",
            control: false,
            table: {
                type: {
                    summary:
                        "{ header: string | JSX.Element; cell: (row: T, index: number) => JSX.Element }[]",
                },
            },
        },
        expandText: {
            description: "Custom text for the expand button",
            control: false,
            type: { name: "function", required: false },
            table: {
                type: {
                    summary: "(remainingCount: number) => string",
                },
                // biome-ignore lint/suspicious/noTemplateCurlyInString: it's needed here
                defaultValue: { summary: "(count) => `${count} more rows...`" },
            },
        },
        collapseText: {
            control: "text",
            description: "Custom text for the collapse button",
            table: {
                defaultValue: { summary: '"Show less"' },
            },
        },
        title: {
            control: "text",
            description: "Optional title that can be clicked to toggle expansion",
            table: {
                type: {
                    summary: "string | JSX.Element",
                },
            },
        },
        rows: {
            description: "Array of row data to display",
            table: {
                type: {
                    summary: "T[]",
                },
            },
        },
    },
} satisfies Meta<typeof ExpandableTable>;

export default meta;
type Story = StoryObj<typeof meta>;

type Fruit = {
    name: string;
    color: string;
    calories: number;
};

const sampleFruits: Fruit[] = [
    { name: "Apple", color: "Red", calories: 95 },
    { name: "Banana", color: "Yellow", calories: 105 },
    { name: "Cherry", color: "Red", calories: 50 },
    { name: "Date", color: "Brown", calories: 66 },
    { name: "Elderberry", color: "Purple", calories: 73 },
    { name: "Fig", color: "Purple", calories: 37 },
    { name: "Grape", color: "Green", calories: 62 },
    { name: "Honeydew", color: "Green", calories: 64 },
];

const fruitColumns = [
    { header: "Name", cell: (row: Fruit) => <span>{row.name}</span> },
    { header: "Color", cell: (row: Fruit) => <span>{row.color}</span> },
    { header: "Calories", cell: (row: Fruit) => <span>{row.calories}</span> },
];

export const Basic: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "500px" }}>
            <ExpandableTable
                title={<h4>Fruit Table</h4>}
                rows={sampleFruits}
                columns={fruitColumns}
            />
        </div>
    ),
    tags: ["!autodocs", "!dev"],
};

export const CustomThreshold: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "500px" }}>
            <ExpandableTable
                title={<h4>Show 5 rows initially</h4>}
                rows={sampleFruits}
                columns={fruitColumns}
                threshold={5}
            />
        </div>
    ),
};

export const CustomText: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "500px" }}>
            <ExpandableTable
                title={<h4>Custom expand/collapse text</h4>}
                rows={sampleFruits}
                columns={fruitColumns}
                expandText={(count) => `Show ${count} more fruits...`}
                collapseText="Hide rows"
            />
        </div>
    ),
};

export const NoHeader: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "500px" }}>
            <ExpandableTable
                title={<h4>Table without header</h4>}
                rows={sampleFruits}
                columns={fruitColumns}
            />
        </div>
    ),
};

export const ShortTable: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "500px" }}>
            <ExpandableTable
                title="Table shorter than threshold (no toggle button)"
                rows={sampleFruits.slice(0, 2)}
                columns={fruitColumns}
            />
        </div>
    ),
};

export const SingleRow: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "500px" }}>
            <ExpandableTable
                title="Show only 1 row initially"
                rows={sampleFruits}
                columns={fruitColumns}
                threshold={1}
            />
        </div>
    ),
};

export const NoTitle: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "500px" }}>
            <ExpandableTable rows={sampleFruits} columns={fruitColumns} />
        </div>
    ),
};

export const EmptyTable: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "500px" }}>
            <ExpandableTable title="Empty table" rows={[]} columns={fruitColumns} />
        </div>
    ),
};

type Equation = {
    variable: string;
    expression: string;
};

const sampleEquations: Equation[] = [
    {
        variable: "I",
        expression:
            "((-1) \\cdot r_{\\text{recover}}) \\cdot I + r_{\\text{infect}} \\cdot I \\cdot S",
    },
    {
        variable: "R",
        expression: "(r_{\\text{recover}}) \\cdot I + ((-1) \\cdot r_{\\text{wane}}) \\cdot R",
    },
    {
        variable: "S",
        expression:
            "((-1) \\cdot r_{\\text{infect}}) \\cdot I \\cdot S + r_{\\text{wane}} \\cdot R",
    },
    { variable: "X", expression: "(\\alpha) \\cdot X + ((-1) \\cdot \\beta) \\cdot X \\cdot Y" },
    { variable: "Y", expression: "(\\gamma) \\cdot X \\cdot Y + ((-1) \\cdot \\delta) \\cdot Y" },
];

export const WithKatex: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "700px" }}>
            <ExpandableTable
                title={<h4>Differential Equations</h4>}
                rows={sampleEquations}
                columns={[
                    {
                        cell: (row: Equation) => <KatexDisplay math={`\\dot{${row.variable}}`} />,
                    },
                    {
                        cell: (_: Equation) => <KatexDisplay math={"="} />,
                    },
                    {
                        cell: (row: Equation) => <KatexDisplay math={row.expression} />,
                    },
                ]}
            />
        </div>
    ),
};

type User = {
    id: number;
    name: string;
    email: string;
    role: string;
    status: "active" | "inactive";
};

const sampleUsers: User[] = [
    { id: 1, name: "Alice Johnson", email: "alice@example.com", role: "Admin", status: "active" },
    { id: 2, name: "Bob Smith", email: "bob@example.com", role: "User", status: "active" },
    { id: 3, name: "Carol White", email: "carol@example.com", role: "User", status: "inactive" },
    { id: 4, name: "David Brown", email: "david@example.com", role: "Moderator", status: "active" },
    { id: 5, name: "Eve Davis", email: "eve@example.com", role: "User", status: "active" },
    { id: 6, name: "Frank Miller", email: "frank@example.com", role: "User", status: "inactive" },
];

export const StyledCells: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "700px" }}>
            <ExpandableTable
                title={<h4>User Management</h4>}
                rows={sampleUsers}
                columns={[
                    {
                        header: "ID",
                        cell: (row: User) => <span style={{ opacity: 0.6 }}>#{row.id}</span>,
                    },
                    { header: "Name", cell: (row: User) => <strong>{row.name}</strong> },
                    {
                        header: "Email",
                        cell: (row: User) => (
                            <span style={{ "font-family": "monospace" }}>{row.email}</span>
                        ),
                    },
                    { header: "Role", cell: (row: User) => <span>{row.role}</span> },
                    {
                        header: "Status",
                        cell: (row: User) => (
                            <span
                                style={{
                                    padding: "2px 8px",
                                    "border-radius": "12px",
                                    "font-size": "0.75rem",
                                    background:
                                        row.status === "active"
                                            ? "var(--color-button-positive-bg)"
                                            : "var(--color-button-danger-bg)",
                                    color:
                                        row.status === "active"
                                            ? "var(--color-button-positive-text)"
                                            : "var(--color-button-danger-text)",
                                }}
                            >
                                {row.status}
                            </span>
                        ),
                    },
                ]}
                threshold={4}
            />
        </div>
    ),
};
