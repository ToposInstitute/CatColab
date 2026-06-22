import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { SettingsDisclosure } from "./settings_disclosure";

const meta = {
    title: "Layout/SettingsDisclosure",
    component: SettingsDisclosure,
} satisfies Meta<typeof SettingsDisclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => (
        <SettingsDisclosure
            settingsPane={<div style={{ padding: "16px" }}>Settings content here.</div>}
        >
            {(trigger) => (
                <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                    <span>Header with settings</span>
                    {trigger}
                </div>
            )}
        </SettingsDisclosure>
    ),
    tags: ["!autodocs", "!dev"],
};

export const WithSettings: Story = {
    render: () => (
        <SettingsDisclosure
            settingsPane={
                <div style={{ padding: "16px" }}>
                    <p>This pane expands below the trigger.</p>
                </div>
            }
        >
            {(trigger) => (
                <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                    <span>Click the gear icon</span>
                    {trigger}
                </div>
            )}
        </SettingsDisclosure>
    ),
};

export const CustomIconSize: Story = {
    render: () => (
        <SettingsDisclosure
            settingsPane={<div style={{ padding: "16px" }}>Larger gear icon (24px).</div>}
            iconSize={24}
        >
            {(trigger) => (
                <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                    <span>Custom icon size</span>
                    {trigger}
                </div>
            )}
        </SettingsDisclosure>
    ),
};

export const WithoutSettings: Story = {
    render: () => (
        <SettingsDisclosure>
            {(trigger) => (
                <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                    <span>No settings pane — trigger is undefined</span>
                    {trigger}
                </div>
            )}
        </SettingsDisclosure>
    ),
};
