import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { TableEditor, type TableEditorSettings } from "./table_editor";

const meta = {
    title: "Forms & Inputs/TableEditor",
    component: TableEditor,
} satisfies Meta<typeof TableEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const columns: TableEditorSettings["columns"] = [
    { data: "name", type: "text", width: 180 },
    { data: "age", type: "numeric", width: 100 },
    { data: "active", type: "checkbox", width: 100 },
    {
        data: "role",
        type: "dropdown",
        source: ["Admin", "Moderator", "User"],
        width: 180,
    },
];

export const Summary: Story = {
    render: () => {
        const [data, setData] = createSignal([
            { name: "Alice", age: 30, active: true, role: "Admin" },
            { name: "Bob", age: 25, active: false, role: "User" },
            { name: "Charlie", age: 35, active: true, role: "Moderator" },
        ]);

        return (
            <div style={{ display: "grid", gap: "1rem", "justify-items": "start" }}>
                <TableEditor
                    label="People"
                    settings={{
                        data: data(),
                        columns,
                        colHeaders: ["Name", "Age", "Active", "Role"],
                        contextMenu: true,
                    }}
                />
                <button
                    type="button"
                    onClick={() =>
                        setData((current) =>
                            current.map((person, index) =>
                                index === 0 ? { ...person, name: "Alicia" } : person,
                            ),
                        )
                    }
                >
                    Update data
                </button>
            </div>
        );
    },
    tags: ["!autodocs", "!dev"],
};

export const Listbox: Story = {
    render: () => (
        <TableEditor
            label="Assignments"
            settings={{
                data: [
                    { person: "Alice", project: "Atlas" },
                    { person: "Bob", project: "Beacon" },
                ],
                columns: [
                    { data: "person", width: 180 },
                    {
                        data: "project",
                        type: "dropdown",
                        source: [
                            "Atlas",
                            "Beacon",
                            "Canopy",
                            "Delta",
                            "Ember",
                            "Flint",
                            "Grove",
                            "Harbor",
                            "Indigo",
                            "Juniper",
                            "Kestrel",
                            "Lantern",
                        ],
                        strict: true,
                        allowInvalid: false,
                        width: 180,
                    },
                ],
                colHeaders: ["Person", "Project"],
            }}
        />
    ),
};

export const ReadOnly: Story = {
    render: () => (
        <TableEditor
            label="Scores"
            settings={{
                data: [
                    { name: "Alice", score: 95 },
                    { name: "Bob", score: 87 },
                ],
                columns: [
                    { data: "name", width: 180 },
                    { data: "score", type: "numeric", width: 100 },
                ],
                colHeaders: ["Name", "Score"],
                readOnly: true,
            }}
        />
    ),
};
