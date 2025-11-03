import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Download from "lucide-solid/icons/download";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Foldable } from "./foldable";
import { IconButton } from "./icon_button";

const meta = {
    title: "Components/Foldable",
    component: Foldable,
} satisfies Meta<typeof Foldable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => (
        <div>
            <Foldable title="Expandable Section">
                <div style={{ padding: "16px" }}>
                    <p>This content can be expanded or collapsed.</p>
                    <p>Click the chevron icon to toggle visibility.</p>
                </div>
            </Foldable>
        </div>
    ),
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => (
        <Foldable title="Basic Foldable">
            <div style={{ padding: "16px" }}>
                <p>This is the content inside the foldable section.</p>
            </div>
        </Foldable>
    ),
};

export const WithHeaderActions: Story = {
    render: () => {
        const header = (
            <IconButton onClick={() => alert("Download clicked")} tooltip="Download">
                <Download size={16} />
            </IconButton>
        );

        return (
            <Foldable title="Visualization" header={header}>
                <div style={{ padding: "16px" }}>
                    <p>This foldable has an action button in the header.</p>
                    <p>The button remains visible even when the section is collapsed.</p>
                </div>
            </Foldable>
        );
    },
};

export const WithNavigationButtons: Story = {
    render: () => {
        const indexButtons = (
            <div style={{ display: "flex", gap: "4px" }}>
                <IconButton onClick={() => alert("Previous")} tooltip="Previous">
                    <ChevronLeft size={16} />
                </IconButton>
                <span style={{ padding: "0 8px" }}>1 / 3</span>
                <IconButton onClick={() => alert("Next")} tooltip="Next">
                    <ChevronRight size={16} />
                </IconButton>
            </div>
        );

        return (
            <Foldable title="Items" header={indexButtons}>
                <div style={{ padding: "16px" }}>
                    <p>This foldable has navigation buttons in the header.</p>
                    <p>Navigate through items using the chevron buttons.</p>
                </div>
            </Foldable>
        );
    },
};

export const WithoutTitle: Story = {
    render: () => {
        const header = <IconButton onClick={() => alert("Action")}>Action</IconButton>;

        return (
            <Foldable header={header}>
                <div style={{ padding: "16px" }}>
                    <p>This foldable has no title, only a header with actions.</p>
                </div>
            </Foldable>
        );
    },
};

export const NestedFoldables: Story = {
    render: () => (
        <Foldable title="Parent Section">
            <div style={{ padding: "16px" }}>
                <p>This is the parent content.</p>
                <Foldable title="Child Section 1">
                    <div style={{ padding: "16px" }}>
                        <p>This is nested content inside the first child.</p>
                    </div>
                </Foldable>
                <Foldable title="Child Section 2">
                    <div style={{ padding: "16px" }}>
                        <p>This is nested content inside the second child.</p>
                    </div>
                </Foldable>
            </div>
        </Foldable>
    ),
};

export const WithLongContent: Story = {
    render: () => (
        <Foldable title="Long Content Section">
            <div style={{ padding: "16px" }}>
                <p>This section contains a lot of content.</p>
                <p>Paragraph 1: Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                <p>
                    Paragraph 2: Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                </p>
                <p>
                    Paragraph 3: Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
                </p>
                <p>Paragraph 4: Duis aute irure dolor in reprehenderit in voluptate velit.</p>
                <p>
                    Paragraph 5: Excepteur sint occaecat cupidatat non proident, sunt in culpa qui
                    officia.
                </p>
            </div>
        </Foldable>
    ),
};
