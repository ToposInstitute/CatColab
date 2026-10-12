/**
 * The static system prompt for LLM conversations in CatColab.
 *
 * The prompt describes the `contextExec` tool and the document API exposed to
 * the model through the execution scope, including the errors that API
 * produces. Theory- and conversation-specific details (the documents in scope
 * and their cell-type vocabulary) are appended dynamically as a suffix by the
 * execution scope.
 */
import prompt from "./system_prompt.md?raw";

/**
 * The system prompt, inlined verbatim from the Markdown source file.
 */
export const SYSTEM_PROMPT = prompt.trim();
