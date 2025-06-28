import { Context, createContext, For } from "solid-js";

export type Buffers = {
    buffers: Map<string, BufferState>;
};

export type BufferState = {
    cells: string[];
};

export const BUFFERS: Context<Buffers | undefined> = createContext();

export function Buffer({ state }: { state: BufferState }) {
    return (
        <ul>
            <For each={state.cells}>
                {(text) => <li>{text}</li>}
            </For>
        </ul>
    );
}
