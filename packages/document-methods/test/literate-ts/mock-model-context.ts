/**
 * A stand-in for the browser-supplied `document.modelContext`, used by the
 * `notebook_webmcp` literate spec so its examples run outside a browser. It
 * implements the slice of the WebMCP imperative API the examples exercise:
 * `registerTool`, `getTools`, and `executeTool`.
 */

/** The minimal slice of a registered WebMCP tool the helper relies on. */
export type RegisteredTool = {
    name: string;
    description: string;
    inputSchema: object;
    execute: (args: Record<string, unknown>) => Promise<string> | string;
};

/** A stand-in `document.modelContext` exposing the imperative-API surface. */
export type MockModelContext = {
    /** Register a tool, removing it when an optional `AbortSignal` fires. */
    registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }): void;
    /** All registered tools, ordered alphabetically by name (as the real API). */
    getTools(): Promise<RegisteredTool[]>;
    /** Run a tool by name with a JSON-string argument, as an agent would. */
    executeTool(ref: { name: string }, args: string): Promise<string>;
};

/** Create a fresh, empty {@link MockModelContext}. */
export function createMockModelContext(): MockModelContext {
    const tools = new Map<string, RegisteredTool>();
    return {
        registerTool(tool, options) {
            tools.set(tool.name, tool);
            options?.signal?.addEventListener("abort", () => tools.delete(tool.name));
        },
        async getTools() {
            return [...tools.values()].toSorted((a, b) => a.name.localeCompare(b.name));
        },
        async executeTool(ref, args) {
            const tool = tools.get(ref.name);
            if (!tool) {
                throw new Error(`Unknown tool '${ref.name}'.`);
            }
            return tool.execute(JSON.parse(args));
        },
    };
}
