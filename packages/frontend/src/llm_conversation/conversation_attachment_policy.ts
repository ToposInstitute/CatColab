import type { JsResult } from "catlog-wasm";

export const ALLOWED_CONVERSATION_FILE_MEDIA_TYPES: ReadonlySet<string> = new Set(["text/csv"]);

const MAX_FILE_BYTES = 8 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024;

export type ConversationAttachmentMetadata = {
    filename: string;
    mediaType: string;
    byteLength: number;
};

/** Validate attachment metadata against the conversation attachment policy. */
export function validateConversationAttachments(
    files: readonly ConversationAttachmentMetadata[],
): JsResult<void, string> {
    for (const file of files) {
        if (!ALLOWED_CONVERSATION_FILE_MEDIA_TYPES.has(file.mediaType)) {
            return { tag: "Err", content: `${file.filename} has an unsupported media type.` };
        }
        if (file.byteLength > MAX_FILE_BYTES) {
            return {
                tag: "Err",
                content: `${file.filename} exceeds the ${formatBytes(MAX_FILE_BYTES)} per-file limit.`,
            };
        }
    }

    if (fileBytes(files) > MAX_TOTAL_BYTES) {
        return {
            tag: "Err",
            content: `Attachments must total no more than ${formatBytes(MAX_TOTAL_BYTES)} per LLM conversation.`,
        };
    }
    return { tag: "Ok", content: undefined };
}

/** Remaining capacity for a complete projected attachment set. */
export function remainingConversationAttachmentBytes(
    files: readonly ConversationAttachmentMetadata[],
): number {
    return MAX_TOTAL_BYTES - fileBytes(files);
}

function fileBytes(files: readonly ConversationAttachmentMetadata[]): number {
    return files.reduce((total, file) => total + file.byteLength, 0);
}

function formatBytes(bytes: number): string {
    return `${bytes / 1024} KiB`;
}
