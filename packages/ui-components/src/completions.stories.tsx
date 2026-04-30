import ArrowDown from "lucide-solid/icons/arrow-down";
import ArrowUp from "lucide-solid/icons/arrow-up";
import Copy from "lucide-solid/icons/copy";
import Trash2 from "lucide-solid/icons/trash-2";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Completions } from "./completions";

const meta = {
    title: "Forms & Inputs/Completions",
    component: Completions,
} satisfies Meta<typeof Completions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => {
        const [text, setText] = createSignal("");
        const completions = [
            {
                name: "Delete",
                icon: <Trash2 size={16} />,
            },
            {
                name: "Duplicate",
                icon: <Copy size={16} />,
            },
            {
                name: "Move Up",
                icon: <ArrowUp size={16} />,
            },
            {
                name: "Move Down",
                icon: <ArrowDown size={16} />,
            },
        ];
        return (
            <div>
                <input
                    type="text"
                    value={text()}
                    onInput={(e) => setText(e.currentTarget.value)}
                    placeholder="Type to filter..."
                    style={{ "margin-bottom": "8px", padding: "4px", width: "200px" }}
                />
                <Completions completions={completions} text={text()} />
            </div>
        );
    },
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => {
        const completions = [
            { name: "Text", description: "Start writing text" },
            { name: "Model", description: "Create a new model" },
            { name: "Diagram", description: "Create a new diagram" },
            { name: "Analysis", description: "Add an analysis" },
        ];
        return <Completions completions={completions} />;
    },
};

export const WithIcons: Story = {
    render: () => {
        const completions = [
            {
                name: "Delete",
                icon: <Trash2 size={16} />,
            },
            {
                name: "Duplicate",
                icon: <Copy size={16} />,
            },
            {
                name: "Move Up",
                icon: <ArrowUp size={16} />,
            },
        ];
        return <Completions completions={completions} />;
    },
};

export const WithShortcuts: Story = {
    render: () => {
        const completions = [
            {
                name: "Text",
                description: "Start writing text",
                shortcut: ["T"],
            },
            {
                name: "Model",
                description: "Create a new model",
                shortcut: ["M"],
            },
            {
                name: "Diagram",
                description: "Create a new diagram",
                shortcut: ["D"],
            },
        ];
        return <Completions completions={completions} />;
    },
};

export const WithFiltering: Story = {
    render: () => {
        const [text, setText] = createSignal("");
        const completions = [
            { name: "Text", description: "Start writing text" },
            { name: "Model", description: "Create a new model" },
            { name: "Diagram", description: "Create a new diagram" },
            { name: "Analysis", description: "Add an analysis" },
        ];
        return (
            <div>
                <input
                    type="text"
                    value={text()}
                    onInput={(e) => setText(e.currentTarget.value)}
                    placeholder="Type to filter..."
                    style={{ "margin-bottom": "8px", padding: "4px" }}
                />
                <Completions completions={completions} text={text()} />
            </div>
        );
    },
};

export const WithNameClass: Story = {
    render: () => {
        const completions = [
            { name: "My Document", description: "Last edited: 2 hours ago" },
            {
                name: "Untitled",
                nameClass: "dimmed",
                description: "Last edited: yesterday",
            },
            { name: "Another Document", description: "Last edited: 3 days ago" },
        ];
        return (
            <>
                <style>{".dimmed { color: gray; }"}</style>
                <Completions completions={completions} />
            </>
        );
    },
};

export const Empty: Story = {
    render: () => {
        return <Completions completions={[]} />;
    },
};

export const CustomEmptyText: Story = {
    render: () => {
        return <Completions completions={[]} emptyText="No results" />;
    },
};

type ColoredItem = {
    name: string;
    tags: string[];
    color: string;
};

const COLORED_ITEMS: ColoredItem[] = [
    { name: "Apple", tags: ["fruit", "red"], color: "#e23" },
    { name: "Avocado", tags: ["fruit", "green"], color: "#5a3" },
    { name: "Banana", tags: ["fruit", "yellow"], color: "#dc4" },
    { name: "Carrot", tags: ["vegetable", "orange"], color: "#e72" },
    { name: "Cabbage", tags: ["vegetable", "green"], color: "#7a5" },
];

// Custom filter: match if any tag starts with the input, or the name
// contains it.
const filterColoredItems = (xs: ColoredItem[], q: string) => {
    const lower = q.toLowerCase();
    return xs.filter(
        (it) => it.name.toLowerCase().includes(lower) || it.tags.some((t) => t.startsWith(lower)),
    );
};

const renderColoredItem = (item: ColoredItem) => (
    <div style={{ display: "flex", "align-items": "center", gap: "0.5em" }}>
        <div
            style={{
                width: "1em",
                height: "1em",
                "background-color": item.color,
                "border-radius": "50%",
            }}
        />
        <strong>{item.name}</strong>
        <span style={{ color: "#888", "font-size": "0.85em" }}>{item.tags.join(", ")}</span>
    </div>
);

export const CustomFilterAndRenderer: Story = {
    render: () => {
        const [text, setText] = createSignal("");
        return (
            <div>
                <input
                    type="text"
                    value={text()}
                    onInput={(e) => setText(e.currentTarget.value)}
                    placeholder="Try `fruit`, `green`, `app`..."
                    style={{ "margin-bottom": "8px", padding: "4px", width: "260px" }}
                />
                <Completions<ColoredItem>
                    completions={COLORED_ITEMS}
                    text={text()}
                    filter={filterColoredItems}
                    renderItem={renderColoredItem}
                    onSelect={(it) => alert(`Selected ${it.name}`)}
                />
            </div>
        );
    },
};
