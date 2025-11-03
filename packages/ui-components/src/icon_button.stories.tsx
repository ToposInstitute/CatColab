import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ChevronsRight from "lucide-solid/icons/chevrons-right";
import Globe from "lucide-solid/icons/globe";
import Plus from "lucide-solid/icons/plus";
import Settings from "lucide-solid/icons/settings";
import Trash2 from "lucide-solid/icons/trash-2";
import X from "lucide-solid/icons/x";

import { IconButton } from "./icon_button";

const meta = {
    title: "Buttons/IconButton",
    component: IconButton,
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
            <IconButton onClick={() => alert("Plus clicked")} tooltip="Add new item">
                <Plus size={20} />
            </IconButton>
            <IconButton onClick={() => alert("Settings clicked")} tooltip="Settings">
                <Settings size={20} />
            </IconButton>
            <IconButton variant="danger" onClick={() => alert("Delete clicked")} tooltip="Delete">
                <Trash2 size={20} />
            </IconButton>
        </div>
    ),
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => (
        <IconButton onClick={() => alert("Button clicked")}>
            <Plus size={20} />
        </IconButton>
    ),
};

export const WithTooltip: Story = {
    render: () => (
        <IconButton onClick={() => alert("Settings clicked")} tooltip="Open settings">
            <Settings size={20} />
        </IconButton>
    ),
};

export const WithComplexTooltip: Story = {
    render: () => (
        <IconButton
            onClick={() => alert("Button clicked")}
            tooltip={
                <div>
                    <strong>Create new cell</strong>
                    <div>Press Enter to create below this one</div>
                </div>
            }
        >
            <Plus size={20} />
        </IconButton>
    ),
};

export const Disabled: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px" }}>
            <IconButton onClick={() => alert("Previous")} disabled tooltip="Previous (disabled)">
                <ChevronLeft size={20} />
            </IconButton>
            <IconButton onClick={() => alert("Next")} tooltip="Next">
                <ChevronRight size={20} />
            </IconButton>
        </div>
    ),
};

export const DisabledState: Story = {
    render: () => {
        const [index, setIndex] = createSignal(0);
        const maxIndex = 4;

        return (
            <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
                <IconButton
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    disabled={index() <= 0}
                    tooltip="Previous"
                >
                    <ChevronLeft size={20} />
                </IconButton>
                <span>
                    {index() + 1} / {maxIndex + 1}
                </span>
                <IconButton
                    onClick={() => setIndex((i) => Math.min(maxIndex, i + 1))}
                    disabled={index() >= maxIndex}
                    tooltip="Next"
                >
                    <ChevronRight size={20} />
                </IconButton>
            </div>
        );
    },
};

export const ToolbarButtons: Story = {
    render: () => (
        <div
            style={{
                display: "flex",
                gap: "4px",
                padding: "8px",
                background: "#f0f0f0",
                "border-radius": "4px",
            }}
        >
            <IconButton onClick={() => alert("Close sidebar")} tooltip="Close sidebar">
                <ChevronsRight size={20} />
            </IconButton>
            <IconButton onClick={() => alert("Settings")} tooltip="Settings">
                <Settings size={20} />
            </IconButton>
            <IconButton onClick={() => alert("Share")} tooltip="Share">
                <Globe size={20} />
            </IconButton>
        </div>
    ),
};

export const DifferentSizes: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "16px", "align-items": "center" }}>
            <IconButton onClick={() => alert("Small")} tooltip="Small icon">
                <Settings size={16} />
            </IconButton>
            <IconButton onClick={() => alert("Medium")} tooltip="Medium icon">
                <Settings size={20} />
            </IconButton>
            <IconButton onClick={() => alert("Large")} tooltip="Large icon">
                <Settings size={24} />
            </IconButton>
        </div>
    ),
};

export const WithCustomStyling: Story = {
    render: () => {
        const [visible, setVisible] = createSignal(true);

        return (
            <div style={{ display: "flex", gap: "8px" }}>
                <IconButton
                    onClick={() => alert("Add item")}
                    style={{ visibility: visible() ? "visible" : "hidden" }}
                    tooltip="Create a new cell below this one"
                >
                    <Plus size={20} />
                </IconButton>
                <button type="button" onClick={() => setVisible(!visible())}>
                    Toggle Visibility
                </button>
            </div>
        );
    },
};

export const CloseButton: Story = {
    render: () => (
        <div
            style={{
                position: "relative",
                padding: "32px",
                border: "1px solid #ccc",
                "border-radius": "4px",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                }}
            >
                <IconButton onClick={() => alert("Close")} tooltip="Close">
                    <X size={20} />
                </IconButton>
            </div>
            <p>Content with a close button in the corner</p>
        </div>
    ),
};

export const ActionButtons: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px" }}>
            <IconButton onClick={() => alert("Create")} tooltip="Create new">
                <Plus size={20} />
            </IconButton>
            <IconButton variant="danger" onClick={() => alert("Delete")} tooltip="Delete selected">
                <Trash2 size={20} />
            </IconButton>
        </div>
    ),
};

export const DangerVariant: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
            <IconButton variant="danger" onClick={() => alert("Delete")} tooltip="Delete item">
                <Trash2 size={20} />
            </IconButton>
            <IconButton variant="danger" onClick={() => alert("Close")} tooltip="Close">
                <X size={20} />
            </IconButton>
            <IconButton variant="danger" onClick={() => alert("Remove")} tooltip="Remove" disabled>
                <Trash2 size={20} />
            </IconButton>
        </div>
    ),
};
