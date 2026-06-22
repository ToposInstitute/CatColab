import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { RelativeTime } from "./relative_time";

const meta = {
    title: "Misc/RelativeTime",
    component: RelativeTime,
} satisfies Meta<typeof RelativeTime>;

export default meta;
type Story = StoryObj<typeof meta>;

const now = Date.now();

const examples: { label: string; timestamp: number }[] = [
    { label: "Just now", timestamp: now - 10_000 },
    { label: "5 minutes ago", timestamp: now - 5 * 60_000 },
    { label: "1 hour 30 min ago", timestamp: now - 90 * 60_000 },
    { label: "6 hours ago", timestamp: now - 6 * 3600_000 },
    { label: "Yesterday", timestamp: now - 24 * 3600_000 },
    { label: "4 days ago", timestamp: now - 4 * 24 * 3600_000 },
    { label: "2 weeks ago", timestamp: now - 14 * 24 * 3600_000 },
    { label: "6 months ago", timestamp: now - 180 * 24 * 3600_000 },
];

export const Summary: Story = {
    args: { timestamp: now - 5 * 60_000 },
    tags: ["!autodocs", "!dev"],
};

export const AllRanges: Story = {
    render: () => (
        <table style={{ "border-collapse": "collapse" }}>
            <thead>
                <tr>
                    <th style={{ padding: "8px 16px", "text-align": "left" }}>Offset</th>
                    <th style={{ padding: "8px 16px", "text-align": "left" }}>Rendered</th>
                </tr>
            </thead>
            <tbody>
                <For each={examples}>
                    {(ex) => (
                        <tr>
                            <td style={{ padding: "8px 16px", color: "#888" }}>{ex.label}</td>
                            <td style={{ padding: "8px 16px" }}>
                                <RelativeTime timestamp={ex.timestamp} />
                            </td>
                        </tr>
                    )}
                </For>
            </tbody>
        </table>
    ),
};
