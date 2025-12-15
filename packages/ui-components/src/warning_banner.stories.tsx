import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "./button";
import { WarningBanner } from "./warning_banner";

const meta = {
    title: "Messages/Warning Banner",
    component: WarningBanner,
} satisfies Meta<typeof WarningBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
    render: () => (
        <WarningBanner>
            This is a warning message. Please review the action before proceeding.
        </WarningBanner>
    ),
    // excluding from autodocs and dev seems to be the way to have this
    // component as the first thing in the docs and only there
    tags: ["!autodocs", "!dev"],
};

export const WithAction: Story = {
    render: () => (
        <WarningBanner
            actions={
                <Button variant="utility" onClick={() => alert("Action clicked!")}>
                    Take Action
                </Button>
            }
        >
            This document has been deleted and will not be listed in your documents.
        </WarningBanner>
    ),
};

export const WithMultipleActions: Story = {
    render: () => (
        <WarningBanner
            actions={
                <>
                    <Button variant="utility" onClick={() => alert("Dismissed!")}>
                        Dismiss
                    </Button>
                    <Button variant="utility" onClick={() => alert("Learn more clicked!")}>
                        Learn More
                    </Button>
                </>
            }
        >
            You have unsaved changes. Would you like to save them before leaving?
        </WarningBanner>
    ),
};

export const WithLongContent: Story = {
    render: () => (
        <WarningBanner>
            This banner contains a longer message to demonstrate how the component handles text
            wrapping. The content will wrap naturally and the icon and actions will stay aligned
            properly. This is useful for more detailed messages that require additional explanation
            or context for the user to understand the situation.
        </WarningBanner>
    ),
};
