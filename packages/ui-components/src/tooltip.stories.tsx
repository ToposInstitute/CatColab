import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Tooltip } from "./tooltip";

const meta = {
    title: "Overlays/Tooltip",
    component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

const TriggerButton = (triggerProps: Record<string, unknown>, label: string) => (
    <button type="button" {...triggerProps}>
        {label}
    </button>
);

export const Summary: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "1rem", "align-items": "center" }}>
            <Tooltip
                content="Edit the model"
                openDelay={0}
                trigger={(p) => TriggerButton(p, "Edit")}
            />
            <Tooltip
                content={
                    <div>
                        <strong>Create new cell</strong>
                        <div>Press Enter to create below this one</div>
                    </div>
                }
                openDelay={0}
                trigger={(p) => TriggerButton(p, "Insert")}
            />
            <Tooltip
                content="Placement can be customized"
                placement="left"
                openDelay={0}
                trigger={(p) => TriggerButton(p, "Left")}
            />
        </div>
    ),
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => (
        <Tooltip
            content="Tooltip text"
            openDelay={0}
            trigger={(p) => TriggerButton(p, "Hover me")}
        />
    ),
    play: async () => {
        const canvas = within(document.body);
        const trigger = canvas.getByRole("button", { name: "Hover me" });
        await expect(canvas.queryByText("Tooltip text")).toBeNull();
        await userEvent.hover(trigger);
        const tooltip = await canvas.findByText("Tooltip text");
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toHaveAttribute("role", "tooltip");
    },
};

export const FocusOpen: Story = {
    render: () => (
        <Tooltip
            content="Focus tooltip"
            openDelay={0}
            trigger={(p) => TriggerButton(p, "Focus me")}
        />
    ),
    play: async () => {
        const canvas = within(document.body);
        const trigger = canvas.getByRole("button", { name: "Focus me" });
        await userEvent.tab();
        await expect(trigger).toHaveFocus();
        await expect(await canvas.findByText("Focus tooltip")).toBeVisible();
    },
};

export const RichContent: Story = {
    render: () => (
        <Tooltip
            content={
                <div>
                    <strong>Create new cell</strong>
                    <div>Press Enter to create below this one</div>
                </div>
            }
            openDelay={0}
            trigger={(p) => TriggerButton(p, "Insert")}
        />
    ),
    play: async () => {
        const canvas = within(document.body);
        await userEvent.hover(canvas.getByRole("button", { name: "Insert" }));
        await expect(await canvas.findByText("Create new cell")).toBeVisible();
        await expect(await canvas.findByText("Press Enter to create below this one")).toBeVisible();
    },
};

export const Placement: Story = {
    render: () => (
        <Tooltip
            content="Shown to the left"
            placement="left"
            openDelay={0}
            trigger={(p) => TriggerButton(p, "Left")}
        />
    ),
    play: async () => {
        const canvas = within(document.body);
        await userEvent.hover(canvas.getByRole("button", { name: "Left" }));
        const tooltip = await canvas.findByText("Shown to the left");
        await expect(tooltip).toHaveAttribute("data-placement", "left");
    },
};

export const CustomTrigger: Story = {
    render: () => (
        <Tooltip
            content="Open the document"
            openDelay={0}
            trigger={(triggerProps) => (
                <a href="#" {...triggerProps}>
                    Open document
                </a>
            )}
        />
    ),
    play: async () => {
        const canvas = within(document.body);
        // corvu's trigger assigns `role="button"` to non-button triggers.
        await userEvent.hover(canvas.getByRole("button", { name: "Open document" }));
        await expect(await canvas.findByText("Open the document")).toBeVisible();
    },
};

export const CustomContentClass: Story = {
    render: () => (
        <Tooltip
            content={<button type="button">Popup actions</button>}
            contentClass="popup custom-content"
            placement="bottom"
            openDelay={0}
            trigger={(p) => TriggerButton(p, "Open popup")}
        />
    ),
    play: async () => {
        const canvas = within(document.body);
        await userEvent.hover(canvas.getByRole("button", { name: "Open popup" }));
        const tooltip = await canvas.findByRole("tooltip");
        await expect(tooltip).not.toHaveClass("tooltip-content");
        await expect(tooltip).toHaveClass("popup", "custom-content");
        await expect(await canvas.findByText("Popup actions")).toBeVisible();
    },
};
