import type { JSX } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import type { LLMInteraction } from "catcolab-document-types";
import { LLMConversationEditor } from "./llm_conversation_editor";

const interactions = [
    {
        tag: "user-message",
        timestamp: "2026-09-14T09:00:00Z",
        id: "user-message",
        content: "Can you compute **two plus two**?",
        files: [
            {
                filename: "two-plus-two.txt",
                mediaType: "text/plain",
                content: Array.from("2 + 2".repeat(100), (char) => char.charCodeAt(0)),
            },
        ],
    },
    {
        tag: "llm-code-execution",
        timestamp: "2026-09-14T09:00:01Z",
        id: "code-execution",
        toolCallId: "tool-call",
        code: "return 2 + 2;",
        result: { tag: "Ok", value: "4" },
    },
    {
        tag: "llm-message",
        timestamp: "2026-09-14T09:00:02Z",
        id: "llm-message",
        content: "The result is $2 + 2 = 4$.",
    },
    {
        tag: "user-feedback-request",
        timestamp: "2026-09-14T09:00:03Z",
        id: "feedback-request",
        codeExecution: "code-execution",
        content: "Apply this result to the document?",
        resolution: "unresolved",
    },
] as LLMInteraction[];

const meta = {
    title: "LLM Conversation/LLM Conversation Editor",
    component: LLMConversationEditor,
    args: {
        interactions,
        status: "Idle",
        busy: false,
        available: true,
        validateAttachments: () => undefined,
        onSubmit: fn(async () => true),
        onResolveFeedback: fn(),
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
    play: async ({
        canvasElement,
        args,
    }: {
        canvasElement: HTMLElement;
        args: typeof meta.args;
    }) => {
        const canvas = within(canvasElement);

        await expect(canvas.getByText("two-plus-two.txt")).toBeVisible();

        const collapseMessage = canvas.getByRole("button", { name: "Collapse message" });
        await userEvent.click(collapseMessage);
        await expect(canvas.getByRole("button", { name: "Expand message" })).toHaveAttribute(
            "aria-expanded",
            "false",
        );

        await userEvent.click(canvas.getByRole("button", { name: "Approve" }));
        await expect(args.onResolveFeedback).toHaveBeenCalledWith("feedback-request", "approved");

        await userEvent.type(canvas.getByRole("textbox"), "A follow-up question{Enter}");
        await expect(args.onSubmit).toHaveBeenCalledWith({
            content: "A follow-up question",
            files: [],
        });
        await waitFor(() => expect(canvas.getByRole("textbox")).toHaveValue(""));
        await expect(canvas.getByRole("textbox")).toHaveFocus();
    },
    // excluding from autodocs and dev seems to be the way to have this
    // component as the first thing in the docs and only there
    tags: ["!autodocs", "!dev"],
};

export const RejectedSubmissionPreservesDraft: Story = {
    args: {
        interactions: [],
        onSubmit: fn(async () => false),
    },
    play: async ({
        canvasElement,
        args,
    }: {
        canvasElement: HTMLElement;
        args: typeof meta.args;
    }) => {
        const canvas = within(canvasElement);
        const textbox = canvas.getByRole("textbox");

        await userEvent.type(textbox, "Keep this draft{Enter}");
        await waitFor(() => expect(args.onSubmit).toHaveBeenCalled());
        await expect(textbox).toHaveValue("Keep this draft");
    },
};

export const AttachmentValidation: Story = {
    args: {
        interactions: [],
        validateAttachments: () => "This file cannot be attached.",
    },
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        const input = canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
        if (!input) {
            throw new Error("File input not found");
        }

        await userEvent.upload(input, new File(["content"], "example.txt", { type: "text/plain" }));
        await userEvent.type(canvas.getByRole("textbox"), "Message");
        await waitFor(() =>
            expect(canvas.getByText("This file cannot be attached.")).toBeInTheDocument(),
        );
        await userEvent.click(canvas.getByRole("button", { name: "Remove example.txt" }));
        await expect(canvas.queryByText("example.txt")).not.toBeInTheDocument();
    },
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
