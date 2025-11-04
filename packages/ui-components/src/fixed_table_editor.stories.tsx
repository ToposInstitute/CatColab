import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
    type BooleanColumnSchema,
    type EnumColumnSchema,
    FixedTableEditor,
    type TextColumnSchema,
    createNumericalColumn,
} from "./fixed_table_editor";

const meta = {
    title: "FixedTableEditor",
    component: FixedTableEditor,
} satisfies Meta<typeof FixedTableEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

type Person = {
    name: string;
    age: number;
    active: boolean;
    role: string | null;
};

export const Summary: Story = {
    render: () => {
        const [people, setPeople] = createSignal<Person[]>([
            { name: "Alice", age: 30, active: true, role: "Admin" },
            { name: "Bob", age: 25, active: false, role: "User" },
            { name: "Charlie", age: 35, active: true, role: "Moderator" },
        ]);

        const nameColumn: TextColumnSchema<Person> = {
            contentType: "string",
            name: "Name",
            header: true,
            content: (row) => row.name,
            setContent: (row, content) => {
                setPeople((prev) => prev.map((p) => (p === row ? { ...p, name: content } : p)));
                return true;
            },
        };

        const ageColumn = createNumericalColumn<Person>({
            name: "Age",
            data: (row) => row.age,
            setData: (row, data) => {
                setPeople((prev) => prev.map((p) => (p === row ? { ...p, age: data } : p)));
            },
        });

        const activeColumn: BooleanColumnSchema<Person> = {
            contentType: "boolean",
            name: "Active",
            content: (row) => row.active,
            setContent: (row, content) => {
                setPeople((prev) => prev.map((p) => (p === row ? { ...p, active: content } : p)));
            },
        };

        const roleColumn: EnumColumnSchema<Person> = {
            contentType: "enum",
            name: "Role",
            variants: () => ["Admin", "Moderator", "User"],
            content: (row) => row.role,
            setContent: (row, content) => {
                setPeople((prev) => prev.map((p) => (p === row ? { ...p, role: content } : p)));
            },
        };

        return (
            <FixedTableEditor
                rows={people()}
                schema={[nameColumn, ageColumn, activeColumn, roleColumn]}
            />
        );
    },
    tags: ["!autodocs", "!dev"],
};

export const TextColumns: Story = {
    render: () => {
        const [data, setData] = createSignal([
            { firstName: "Alice", lastName: "Smith" },
            { firstName: "Bob", lastName: "Jones" },
        ]);

        const firstNameColumn: TextColumnSchema<{ firstName: string; lastName: string }> = {
            contentType: "string",
            name: "First Name",
            header: true,
            content: (row) => row.firstName,
            setContent: (row, content) => {
                setData((prev) => prev.map((p) => (p === row ? { ...p, firstName: content } : p)));
                return true;
            },
        };

        const lastNameColumn: TextColumnSchema<{ firstName: string; lastName: string }> = {
            contentType: "string",
            name: "Last Name",
            content: (row) => row.lastName,
            setContent: (row, content) => {
                setData((prev) => prev.map((p) => (p === row ? { ...p, lastName: content } : p)));
                return true;
            },
        };

        return <FixedTableEditor rows={data()} schema={[firstNameColumn, lastNameColumn]} />;
    },
};

export const NumericalColumns: Story = {
    render: () => {
        const [data, setData] = createSignal([
            { item: "Item 1", quantity: 5, price: 10.5 },
            { item: "Item 2", quantity: 3, price: 25.0 },
            { item: "Item 3", quantity: 7, price: 15.75 },
        ]);

        const itemColumn: TextColumnSchema<{ item: string; quantity: number; price: number }> = {
            contentType: "string",
            name: "Item",
            header: true,
            content: (row) => row.item,
        };

        const quantityColumn = createNumericalColumn<{
            item: string;
            quantity: number;
            price: number;
        }>({
            name: "Quantity",
            data: (row) => row.quantity,
            validate: (_, data) => data >= 0,
            setData: (row, data) => {
                setData((prev) => prev.map((p) => (p === row ? { ...p, quantity: data } : p)));
            },
        });

        const priceColumn = createNumericalColumn<{
            item: string;
            quantity: number;
            price: number;
        }>({
            name: "Price",
            data: (row) => row.price,
            validate: (_, data) => data > 0,
            setData: (row, data) => {
                setData((prev) => prev.map((p) => (p === row ? { ...p, price: data } : p)));
            },
        });

        return (
            <FixedTableEditor rows={data()} schema={[itemColumn, quantityColumn, priceColumn]} />
        );
    },
};

export const BooleanColumn: Story = {
    render: () => {
        const [data, setData] = createSignal([
            { task: "Write code", completed: false },
            { task: "Review PR", completed: true },
            { task: "Deploy", completed: false },
        ]);

        const taskColumn: TextColumnSchema<{ task: string; completed: boolean }> = {
            contentType: "string",
            name: "Task",
            header: true,
            content: (row) => row.task,
        };

        const completedColumn: BooleanColumnSchema<{ task: string; completed: boolean }> = {
            contentType: "boolean",
            name: "Completed",
            content: (row) => row.completed,
            setContent: (row, content) => {
                setData((prev) => prev.map((p) => (p === row ? { ...p, completed: content } : p)));
            },
        };

        return <FixedTableEditor rows={data()} schema={[taskColumn, completedColumn]} />;
    },
};

export const EnumColumn: Story = {
    render: () => {
        const [data, setData] = createSignal([
            { name: "Feature A", priority: "High" },
            { name: "Feature B", priority: null },
            { name: "Feature C", priority: "Low" },
        ]);

        const nameColumn: TextColumnSchema<{ name: string; priority: string | null }> = {
            contentType: "string",
            name: "Feature",
            header: true,
            content: (row) => row.name,
        };

        const priorityColumn: EnumColumnSchema<{ name: string; priority: string | null }> = {
            contentType: "enum",
            name: "Priority",
            variants: () => ["High", "Medium", "Low"],
            content: (row) => row.priority,
            setContent: (row, content) => {
                setData((prev) => prev.map((p) => (p === row ? { ...p, priority: content } : p)));
            },
        };

        return <FixedTableEditor rows={data()} schema={[nameColumn, priorityColumn]} />;
    },
};

export const ReadOnlyTable: Story = {
    render: () => {
        const data = [
            { name: "Alice", score: 95 },
            { name: "Bob", score: 87 },
            { name: "Charlie", score: 92 },
        ];

        const nameColumn: TextColumnSchema<{ name: string; score: number }> = {
            contentType: "string",
            name: "Name",
            header: true,
            content: (row) => row.name,
        };

        const scoreColumn = createNumericalColumn<{ name: string; score: number }>({
            name: "Score",
            data: (row) => row.score,
        });

        return <FixedTableEditor rows={data} schema={[nameColumn, scoreColumn]} />;
    },
};
