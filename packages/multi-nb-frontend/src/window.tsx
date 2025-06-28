import { For, Show, useContext } from "solid-js";
import { Buffer, BUFFERS } from "./buffer";
import { createMemo } from "solid-js";

function BufferSelect() {
    const buffers = useContext(BUFFERS);

    if (buffers === undefined) {
        return <div>Must provide buffers context</div>;
    }

    return (
        <ul>
            <For each={[...buffers.buffers.keys()]}>
                {(name) => <li>{name}</li>}
            </For>
        </ul>
    );
}

export function Window(props: { bufferName: string }) {
    const buffers = useContext(BUFFERS);

    if (buffers === undefined) {
        return <div>Must provide buffers context</div>;
    }

    const buffer = createMemo(() => {
        const n = props.bufferName;
        if (n != null) {
            return buffers.buffers.get(n);
        } else {
            return null;
        }
    });

    return (
        <Show
            when={buffer()}
            fallback={<BufferSelect />}
        >
            {(b) => <Buffer state={b()} />}
        </Show>
    );
}
