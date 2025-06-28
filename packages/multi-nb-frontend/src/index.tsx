/* @refresh reload */
import { render } from "solid-js/web";

import "./reset.css";
import "./index.css";
import { BUFFERS } from "./buffer";
import { dragHandler, Frame } from "./frame";
import { createSignal } from "solid-js";

function App() {
    const buffers = {
        buffers: new Map(),
    };
    buffers.buffers.set("A", { cells: ["blah", "blah"] });
    buffers.buffers.set("B", { cells: ["bleh", "bleh"] });

    const frameF: Frame = { tag: "full", bufferName: "A" };
    const frameV: Frame = {
        tag: "vertical",
        top: frameF,
        bottom: frameF,
        fraction: 0.5,
    };
    const frameInit: Frame = {
        tag: "horizontal",
        left: frameF,
        right: frameV,
        fraction: 0.7,
    };

    const [frame, setFrame] = createSignal(frameInit);

    const [dragState, setDragState] = createSignal("none");

    dragHandler.setDragState = setDragState;

    return (
        <BUFFERS.Provider value={buffers}>
            <div
                class="container"
                onMouseUp={() => {
                    setDragState("none");
                    dragHandler.onMove = (_x, _y) => {};
                }}
                onMouseMove={(ev) => {
                    dragHandler.onMove(ev.clientX, ev.clientY);
                }}
                classList={{
                    dragns: dragState() == "ns",
                    dragew: dragState() == "ew",
                }}
            >
                <Frame
                    close={() => setFrame(frameInit)}
                    reset={setFrame}
                    frame={frame()}
                />
            </div>
        </BUFFERS.Provider>
    );
}

const root = document.getElementById("root");

// biome-ignore lint/style/noNonNullAssertion: we know that root exists
render(() => <App />, root!);
