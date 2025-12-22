import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { ExpandableList } from "./expandable_list";

const meta = {
    title: "Layout/ExpandableList",
    component: ExpandableList,
} satisfies Meta<typeof ExpandableList>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleItems = ["Apple", "Banana", "Cherry", "Date", "Elderberry", "Fig", "Grape", "Honeydew"];

const sampleUsers = [
    { name: "Alice Johnson", email: "alice@example.com" },
    { name: "Bob Smith", email: "bob@example.com" },
    { name: "Charlie Brown", email: "charlie@example.com" },
    { name: "Diana Prince", email: "diana@example.com" },
    { name: "Eve Adams", email: "eve@example.com" },
    { name: "Frank Castle", email: "frank@example.com" },
];

export const Summary: Story = {
    render: () => (
        <ExpandableList
            items={sampleItems}
            threshold={3}
            renderItem={(item) => <div style={{ padding: "4px 0" }}>{item}</div>}
        />
    ),
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "400px" }}>
            <ExpandableList
                title={<h4>Fruit List</h4>}
                items={sampleItems}
                threshold={3}
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
                threshold={5}
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
                threshold={3}
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
                items={sampleUsers}
                threshold={3}
                renderItem={(user) => (
                    <div
                        style={{
                            padding: "8px",
                            border: "1px solid var(--color-button-utility-border)",
                            "border-radius": "4px",
                            background: "var(--color-button-utility-bg)",
                        }}
                    >
                        <div style={{ "font-weight": "bold" }}>{user.name}</div>
                        <div style={{ "font-size": "0.875rem", opacity: 0.7 }}>{user.email}</div>
                    </div>
                )}
            />
        </div>
    ),
};

export const ShortList: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "400px" }}>
            <ExpandableList
                title="List shorter than initial count (no toggle button)"
                items={["Apple", "Banana"]}
                threshold={3}
                renderItem={(item) => <div style={{ padding: "4px 0" }}>{item}</div>}
            />
        </div>
    ),
};

export const SingleInitialItem: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "400px" }}>
            <ExpandableList
                title="Show only 1 item initially"
                items={sampleItems}
                threshold={1}
                renderItem={(item) => <div style={{ padding: "4px 0" }}>{item}</div>}
            />
        </div>
    ),
};

export const TitleOnlyShortList: Story = {
    render: () => (
        <div style={{ padding: "16px", "max-width": "400px" }}>
            <ExpandableList
                title="Short List (title not clickable)"
                items={["Apple", "Banana"]}
                threshold={3}
                renderItem={(item) => <div style={{ padding: "4px 0" }}>{item}</div>}
            />
        </div>
    ),
};
