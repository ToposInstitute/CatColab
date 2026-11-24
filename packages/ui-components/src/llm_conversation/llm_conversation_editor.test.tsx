import { type ComponentProps, createSignal } from "solid-js";
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

test("Interrupt via button", async () => {
    const [busy, setBusy] = createSignal(true);
    const onInterrupt = vi.fn<() => void>(() => setBusy(false));
    const canvasElement = mount(() => (
        <>
            <button type="button">Outside editor</button>
            <LLMConversationEditor
                interactions={[]}
                status={busy() ? "Running..." : "Idle"}
                busy={busy()}
                available={!busy()}
                validateAttachments={() => undefined}
                onSubmit={() => Promise.resolve(true)}
                onInterrupt={onInterrupt}
                onResolveFeedback={() => undefined}
            />
        </>
    ));
    const canvas = within(canvasElement);

    const interrupt = canvas.getByRole("button", { name: "Interrupt" });
    expect(interrupt).toHaveTextContent("Interrupt");
    expect(interrupt).not.toHaveAttribute("aria-keyshortcuts");
    await userEvent.click(canvas.getByRole("textbox"));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(canvas.getByRole("button", { name: "Outside editor" }));
    await userEvent.keyboard("{Escape}");
    expect(onInterrupt).not.toHaveBeenCalled();
    await userEvent.click(interrupt);
    expect(onInterrupt).toHaveBeenCalledOnce();
    expect(canvas.queryByRole("button", { name: "Interrupt" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("textbox"));
    await userEvent.keyboard("{Escape}");
    expect(onInterrupt).toHaveBeenCalledOnce();
});

test("StreamingReasoning", () => {
    const args = {
        interactions: [],
        streamingReasoning: "Considering the theory signature...",
        status: "Running...",
        busy: true,
        available: false,
        validateAttachments: () => undefined,
        onSubmit: vi.fn<EditorProps["onSubmit"]>(async () => true),
        onResolveFeedback: vi.fn<EditorProps["onResolveFeedback"]>(),
    };
    const canvasElement = mount(() => <LLMConversationEditor {...args} />);
    const canvas = within(canvasElement);

    const reasoning = canvas.getByText("Considering the theory signature...");
    expect(reasoning).toHaveAttribute("aria-hidden", "true");
    expect(
        canvas.getByText("Running...").compareDocumentPosition(reasoning) &
            Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
