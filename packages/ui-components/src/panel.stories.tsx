import type { Meta, StoryObj } from "storybook-solidjs-vite";

import Download from "lucide-solid/icons/download";
import Settings from "lucide-solid/icons/settings";
import X from "lucide-solid/icons/x";

import { IconButton } from "./icon_button";
import { PanelHeader } from "./panel";

const meta = {
    title: "PanelHeader",
    component: PanelHeader,
} satisfies Meta<typeof PanelHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => (
        <div style={{ border: "1px solid #ccc", "border-radius": "4px", overflow: "hidden" }}>
            <PanelHeader title="Panel Title">
                <IconButton onClick={() => alert("Settings")} tooltip="Settings">
                    <Settings size={16} />
                </IconButton>
            </PanelHeader>
            <div style={{ padding: "16px" }}>
                <p>Panel content goes here.</p>
            </div>
        </div>
    ),
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => (
        <div style={{ border: "1px solid #ccc" }}>
            <PanelHeader title="Basic Panel" />
            <div style={{ padding: "16px" }}>
                <p>This is a basic panel with just a title.</p>
            </div>
        </div>
    ),
};

export const WithSingleAction: Story = {
    render: () => (
        <div style={{ border: "1px solid #ccc" }}>
            <PanelHeader title="Settings Panel">
                <IconButton onClick={() => alert("Close")} tooltip="Close">
                    <X size={16} />
                </IconButton>
            </PanelHeader>
            <div style={{ padding: "16px" }}>
                <p>Panel with a close button in the header.</p>
            </div>
        </div>
    ),
};

export const WithMultipleActions: Story = {
    render: () => (
        <div style={{ border: "1px solid #ccc" }}>
            <PanelHeader title="Document Panel">
                <div style={{ display: "flex", gap: "4px" }}>
                    <IconButton onClick={() => alert("Download")} tooltip="Download">
                        <Download size={16} />
                    </IconButton>
                    <IconButton onClick={() => alert("Settings")} tooltip="Settings">
                        <Settings size={16} />
                    </IconButton>
                    <IconButton onClick={() => alert("Close")} tooltip="Close">
                        <X size={16} />
                    </IconButton>
                </div>
            </PanelHeader>
            <div style={{ padding: "16px" }}>
                <p>Panel with multiple actions in the header.</p>
            </div>
        </div>
    ),
};

export const WithJSXTitle: Story = {
    render: () => (
        <div style={{ border: "1px solid #ccc" }}>
            <PanelHeader
                title={
                    <span>
                        <strong>Important</strong> Panel
                    </span>
                }
            >
                <IconButton onClick={() => alert("Settings")} tooltip="Settings">
                    <Settings size={16} />
                </IconButton>
            </PanelHeader>
            <div style={{ padding: "16px" }}>
                <p>Panel with a JSX element as the title.</p>
            </div>
        </div>
    ),
};

export const WithoutActions: Story = {
    render: () => (
        <div style={{ border: "1px solid #ccc" }}>
            <PanelHeader title="Simple Panel" />
            <div style={{ padding: "16px" }}>
                <p>Panel without any header actions.</p>
            </div>
        </div>
    ),
};

export const MultiplePanels: Story = {
    render: () => (
        <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
            <div style={{ border: "1px solid #ccc" }}>
                <PanelHeader title="Panel 1">
                    <IconButton onClick={() => alert("Settings 1")}>
                        <Settings size={16} />
                    </IconButton>
                </PanelHeader>
                <div style={{ padding: "16px" }}>
                    <p>First panel content.</p>
                </div>
            </div>
            <div style={{ border: "1px solid #ccc" }}>
                <PanelHeader title="Panel 2">
                    <IconButton onClick={() => alert("Settings 2")}>
                        <Settings size={16} />
                    </IconButton>
                </PanelHeader>
                <div style={{ padding: "16px" }}>
                    <p>Second panel content.</p>
                </div>
            </div>
            <div style={{ border: "1px solid #ccc" }}>
                <PanelHeader title="Panel 3">
                    <IconButton onClick={() => alert("Settings 3")}>
                        <Settings size={16} />
                    </IconButton>
                </PanelHeader>
                <div style={{ padding: "16px" }}>
                    <p>Third panel content.</p>
                </div>
            </div>
        </div>
    ),
};

export const WithCustomContent: Story = {
    render: () => (
        <div style={{ border: "1px solid #ccc" }}>
            <PanelHeader title="Custom Header">
                <span style={{ "margin-right": "8px", color: "#666" }}>Last saved: 2 min ago</span>
                <IconButton onClick={() => alert("Save")}>Save</IconButton>
            </PanelHeader>
            <div style={{ padding: "16px" }}>
                <p>Panel with custom text and button in the header.</p>
            </div>
        </div>
    ),
};
