import type { ComponentProps } from "solid-js";
import { userEvent, waitFor, within } from "storybook/test";
import { test, expect, vi } from "vitest";

import { mount } from "../test/mount";
import { LLMConversationEditor } from "./llm_conversation_editor";
import { interactions } from "./llm_conversation_editor.fixtures";

type EditorProps = ComponentProps<typeof LLMConversationEditor>;

test("Complete", async () => {
    const args = {
        interactions,
        status: "Idle",
        busy: false,
        available: true,
        validateAttachments: () => undefined,
        onSubmit: vi.fn<EditorProps["onSubmit"]>(async () => true),
        onResolveFeedback: vi.fn<EditorProps["onResolveFeedback"]>(),
    };
    const canvasElement = mount(() => <LLMConversationEditor {...args} />);

    const canvas = within(canvasElement);

    expect(canvas.getByText("two-plus-two.txt")).toBeVisible();

    const collapseMessage = canvas.getByRole("button", { name: "Collapse message" });
    await userEvent.click(collapseMessage);
    expect(canvas.getByRole("button", { name: "Expand message" })).toHaveAttribute(
        "aria-expanded",
        "false",
    );

    await userEvent.click(canvas.getByRole("button", { name: "Approve" }));
    expect(args.onResolveFeedback).toHaveBeenCalledWith("feedback-request", "approved");

    await userEvent.type(canvas.getByRole("textbox"), "A follow-up question{Enter}");
    expect(args.onSubmit).toHaveBeenCalledWith({
        content: "A follow-up question",
        files: [],
    });
    await waitFor(() => expect(canvas.getByRole("textbox")).toHaveValue(""));
    expect(canvas.getByRole("textbox")).toHaveFocus();
});

test("RejectedSubmissionPreservesDraft", async () => {
    const args = {
        interactions: [],
        status: "Idle",
        busy: false,
        available: true,
        validateAttachments: () => undefined,
        onSubmit: vi.fn<EditorProps["onSubmit"]>(async () => false),
        onResolveFeedback: vi.fn<EditorProps["onResolveFeedback"]>(),
    };
    const canvasElement = mount(() => <LLMConversationEditor {...args} />);

    const canvas = within(canvasElement);
    const textbox = canvas.getByRole("textbox");

    await userEvent.type(textbox, "Keep this draft{Enter}");
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalled());
    expect(textbox).toHaveValue("Keep this draft");
});

test("AttachmentValidation", async () => {
    const args = {
        interactions: [],
        status: "Idle",
        busy: false,
        available: true,
        validateAttachments: () => "This file cannot be attached.",
        onSubmit: vi.fn<EditorProps["onSubmit"]>(async () => true),
        onResolveFeedback: vi.fn<EditorProps["onResolveFeedback"]>(),
    };
    const canvasElement = mount(() => <LLMConversationEditor {...args} />);

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
    expect(canvas.queryByText("example.txt")).not.toBeInTheDocument();
});
