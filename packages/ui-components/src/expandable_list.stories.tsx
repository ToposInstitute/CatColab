import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { ExpandableList } from "./expandable_list";
import { KatexDisplay } from "./katex_display";

const meta = {
    title: "Layout/ExpandableList",
    component: ExpandableList,
    argTypes: {
        threshold: {
            control: "number",
            description: "Number of items to show before truncation",
            table: {
                defaultValue: { summary: "3" },
            },
        },
        renderItem: {
            description: "Function to render each item",
            control: false,
            type: { name: "function", required: false },
            table: {
                type: {
                    summary: "(item: JSX.Element | string, index: number) => JSX.Element",
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
                defaultValue: { summary: "(count) => `${count} more...`" },
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
        items: {
            description: "Array of items to display",
            table: {
                type: {
                    summary: "(JSX.Element | string)[]",
                },
            },
        },
    },
} satisfies Meta<typeof ExpandableList>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleItems = ["Apple", "Banana", "Cherry", "Date", "Elderberry", "Fig", "Grape", "Honeydew"];

export const Basic: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "400px" }}>
            <ExpandableList
                title={<h4>Fruit List</h4>}
                items={sampleItems}
                renderItem={(item) => <div style={{ padding: "4px 0" }}>{item}</div>}
            />
        </div>
    ),
};

export const CustomInitialCount: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "400px" }}>
            <ExpandableList
                title={<h4>Show 5 items initially</h4>}
                items={sampleItems}
                renderItem={(item) => <div style={{ padding: "4px 0" }}>{item}</div>}
            />
        </div>
    ),
};

export const CustomText: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "400px" }}>
            <ExpandableList
                title={<h4>Custom expand/collapse text</h4>}
                items={sampleItems}
                renderItem={(item) => <div style={{ padding: "4px 0" }}>{item}</div>}
                expandText={(count) => `${count} more fruits...`}
                collapseText="Hide items"
            />
        </div>
    ),
};

export const ComplexItems: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "500px" }}>
            <ExpandableList
                title="User List"
                items={sampleItems}
                renderItem={(item) => (
                    <div
                        style={{
                            padding: "8px",
                            border: "1px solid var(--color-button-utility-border)",
                            "border-radius": "4px",
                            background: "var(--color-button-utility-bg)",
                        }}
                    >
                        <div style={{ "font-weight": "bold" }}>{item}</div>
                        <div style={{ "font-size": "0.875rem", opacity: 0.7 }}>{item}</div>
                    </div>
                )}
            />
        </div>
    ),
};

export const ShortList: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "400px" }}>
            <ExpandableList title="List shorter than initial count (no toggle button)" items={[]} />
        </div>
    ),
};

export const SingleInitialItem: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "400px" }}>
            <ExpandableList title="Show only 1 item initially" items={sampleItems} threshold={1} />
        </div>
    ),
};

export const TitleOnlyShortList: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "400px" }}>
            <ExpandableList
                title={<h4>Short List (title not clickable)</h4>}
                items={["Apple", "Banana"]}
            />
        </div>
    ),
};

export const NoTitle: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "400px" }}>
            <ExpandableList items={sampleItems} />
        </div>
    ),
};

export const WithKatex: Story = {
    render: () => {
        const equations: string[] = [
            "dI = ((-1) \\cdot r_{\\text{recover}}) \\cdot I + r_{\\text{infect}} \\cdot I \\cdot S",
            "dR = (r_{\\text{recover}}) \\cdot I + ((-1) \\cdot r_{\\text{wane}}) \\cdot R",
            "dS = ((-1) \\cdot r_{\\text{infect}}) \\cdot I \\cdot S + r_{\\text{wane}} \\cdot R",
            "dX = (\\alpha) \\cdot X + ((-1) \\cdot \\beta) \\cdot X \\cdot Y",
            "dY = (\\gamma) \\cdot X \\cdot Y + ((-1) \\cdot \\delta) \\cdot Y",
            "dN = (r) \\cdot N + ((-1) \\cdot K) \\cdot N^2",
            "dP = ((-1) \\cdot \\mu) \\cdot P + (\\epsilon) \\cdot P \\cdot H",
        ];
        return (
            <div style={{ padding: "16px", "max-width": "600px" }}>
                <ExpandableList
                    items={equations}
                    renderItem={(equation: string) => <KatexDisplay math={equation} />}
                />
            </div>
        );
    },
};
