import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Download from "lucide-solid/icons/download";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { BlockTitle } from "./block_title";
import { IconButton } from "./icon_button";

const meta = {
    title: "Layout/BlockTitle",
    component: BlockTitle,
} satisfies Meta<typeof BlockTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => {
        const actions = (
            <IconButton onClick={() => alert("Download clicked")} tooltip="Download">
                <Download size={16} />
            </IconButton>
        );

        return (
            <BlockTitle
                title="Visualization"
                actions={actions}
                settingsPane={<div style={{ padding: "16px" }}>These are some settings.</div>}
            />
        );
    },
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => (
        <BlockTitle
            title="Basic Block Title"
            settingsPane={
                <div style={{ padding: "16px" }}>
                    <p>This is the settings pane inside the block title section.</p>
                </div>
            }
        />
    ),
};

export const WithActions: Story = {
    render: () => {
        const actions = (
            <IconButton onClick={() => alert("Download clicked")} tooltip="Download">
                <Download size={16} />
            </IconButton>
        );

        return (
            <BlockTitle
                title="Visualization"
                actions={actions}
                settingsPane={<div style={{ padding: "16px" }}>These are some settings.</div>}
            />
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
            <BlockTitle
                title="Items"
                actions={indexButtons}
                settingsPane={
                    <div style={{ padding: "16px" }}>
                        <p>This block title has navigation buttons in the header.</p>
                        <p>Navigate through items using the chevron buttons.</p>
                    </div>
                }
            />
        );
    },
};

export const WithoutSettingsPane: Story = {
    render: () => {
        const actions = (
            <IconButton onClick={() => alert("Download clicked")} tooltip="Download">
                <Download size={16} />
            </IconButton>
        );

        return <BlockTitle title="Simple Title" actions={actions} />;
    },
};

export const Nested: Story = {
    render: () => (
        <BlockTitle
            title="Parent Section"
            settingsPane={
                <div style={{ padding: "16px" }}>
                    <p>This is the parent content.</p>
                    <BlockTitle
                        title="Child Section 1"
                        settingsPane={
                            <div style={{ padding: "16px" }}>
                                <p>This is nested content inside the first child.</p>
                            </div>
                        }
                    />
                    <BlockTitle
                        title="Child Section 2"
                        settingsPane={
                            <div style={{ padding: "16px" }}>
                                <p>This is nested content inside the second child.</p>
                            </div>
                        }
                    />
                </div>
            }
        />
    ),
};
