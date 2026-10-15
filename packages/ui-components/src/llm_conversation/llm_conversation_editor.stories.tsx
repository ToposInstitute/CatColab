import type { JSX } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { LLMConversationEditor } from "./llm_conversation_editor";
import { interactions } from "./llm_conversation_editor.fixtures";

const meta = {
    title: "LLM Conversation/LLM Conversation Editor",
    component: LLMConversationEditor,
    args: {
        interactions,
        status: "Idle",
        busy: false,
        available: true,
        validateAttachments: () => undefined,
        onSubmit: async () => true,
        onResolveFeedback: () => {},
    },
    decorators: [
        (Story: () => JSX.Element) => (
            <div style={{ width: "min(40rem, 100%)" }}>
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof LLMConversationEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Complete: Story = {
    // excluding from autodocs and dev seems to be the way to have this
    // component as the first thing in the docs and only there
    tags: ["!autodocs", "!dev"],
};

export const Streaming: Story = {
    args: {
        interactions: interactions.slice(0, 1),
        streamingContent: "Working through the calculation...",
        status: "Running...",
        busy: true,
        available: false,
    },
};

export const ErrorNotice: Story = {
    args: {
        notice: { kind: "error", message: "The inference service is unavailable." },
    },
};

export const Narrow: Story = {
    decorators: [
        (Story: () => JSX.Element) => (
            <div style={{ width: "20rem" }}>
                <Story />
            </div>
        ),
    ],
};
