import type { DocHandle, Repo } from "@automerge/automerge-repo";

/** The `llm:skill` module contract, as consumed by the Patchwork chat tool.

Copied rather than imported: the chat package defines it, and Patchwork
packages only depend on each other at runtime, through the plugin registry.
 */
export type LlmSkillModule = {
    /** Markdown appended to the system prompt while the skill is active. */
    instructions: string;

    /** Extra tool schemas offered to the model while the skill is active. */
    tools?: LlmSkillTool[];

    /** Implementation of this skill's tools. */
    runTool?: (name: string, args: unknown, ctx: LlmSkillToolCtx) => unknown;
};

export type LlmSkillTool = {
    name: string;
    description: string;
    parameters?: object;
};

export type LlmSkillToolCtx = {
    repo: Repo;
    handle: DocHandle<unknown>;
    element: HTMLElement;
    focusedUrl: string | undefined;
};
