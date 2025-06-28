import { JSX, Match, Switch } from "solid-js";
import { Window } from "./window";

type DragState = "ns" | "ew" | "none";

export const dragHandler = {
    onMove: (_x: number, _y: number) => {},
    setDragState: (s: DragState) => {},
};

export type Frame = Full | HorizontalSplit | VerticalSplit;

type FrameProps = {
    frame: Frame;
    close: () => void;
    reset: (newFrame: Frame) => void;
};

export type Full = {
    tag: "full";
    bufferName: string;
};

function asFull(f: Frame): Full | undefined {
    if (f.tag == "full") {
        return f;
    }
}

function Full(props: FrameProps & { frame: Full }): JSX.Element {
    return (
        <div class="frame">
            <button onClick={props.close}>close</button>
            <button
                onClick={() =>
                    props.reset({
                        tag: "vertical",
                        top: props.frame,
                        bottom: props.frame,
                        fraction: 0.5,
                    })}
            >
                vsplit
            </button>
            <button
                onClick={() =>
                    props.reset({
                        tag: "horizontal",
                        left: props.frame,
                        right: props.frame,
                        fraction: 0.5,
                    })}
            >
                hsplit
            </button>
            <Window bufferName={props.frame.bufferName} />
        </div>
    );
}

export type HorizontalSplit = {
    tag: "horizontal";
    left: Frame;
    right: Frame;
    fraction: number;
};

function asHorizontalSplit(f: Frame): HorizontalSplit | undefined {
    if (f.tag == "horizontal") {
        return f;
    }
}

function HorizontalSplit(
    props: FrameProps & { frame: HorizontalSplit },
): JSX.Element {
    let ref: Element;
    return (
        <div
            class="horizontal-split"
            ref={(elt) => {
                ref = elt;
            }}
        >
            <div style={`width:${props.frame.fraction * 100}%`}>
                <Frame
                    close={() => props.reset(props.frame.right)}
                    reset={(newFrame) =>
                        props.reset({ ...props.frame, left: newFrame })}
                    frame={props.frame.left}
                />
            </div>
            <div
                class="horizontal-divider"
                onMouseDown={() => {
                    dragHandler.setDragState("ew");
                    dragHandler.onMove = (x, _) => {
                        const r = ref.getBoundingClientRect();
                        const rx = (x - r.left) / r.width;
                        props.reset({ ...props.frame, fraction: rx });
                    };
                }}
            />
            <div>
                <Frame
                    close={() => props.reset(props.frame.left)}
                    reset={(newFrame) =>
                        props.reset({ ...props.frame, right: newFrame })}
                    frame={props.frame.right}
                />
            </div>
        </div>
    );
}

export type VerticalSplit = {
    tag: "vertical";
    top: Frame;
    bottom: Frame;
    fraction: number;
};

function asVerticalSplit(f: Frame): VerticalSplit | undefined {
    if (f.tag == "vertical") {
        return f;
    }
}

function VerticalSplit(
    props: FrameProps & { frame: VerticalSplit },
): JSX.Element {
    let ref: Element;
    return (
        <div
            class="vertical-split"
            ref={(elt) => {
                ref = elt;
            }}
        >
            <div style={`height:${props.frame.fraction * 100}%`}>
                <Frame
                    close={() => props.reset(props.frame.bottom)}
                    reset={(newFrame) =>
                        props.reset({ ...props.frame, top: newFrame })}
                    frame={props.frame.top}
                />
            </div>
            <div
                class="vertical-divider"
                onMouseDown={() => {
                    dragHandler.setDragState("ns");
                    dragHandler.onMove = (_, y) => {
                        const r = ref.getBoundingClientRect();
                        const ry = (y - r.top) / r.height;
                        props.reset({ ...props.frame, fraction: ry });
                    };
                }}
            />
            <div>
                <Frame
                    close={() => props.reset(props.frame.top)}
                    reset={(newFrame) =>
                        props.reset({ ...props.frame, bottom: newFrame })}
                    frame={props.frame.bottom}
                />
            </div>
        </div>
    );
}

export function Frame(props: FrameProps): JSX.Element {
    return (
        <Switch fallback={<div></div>}>
            <Match when={asFull(props.frame)}>
                {(f) => (
                    <Full close={props.close} reset={props.reset} frame={f()} />
                )}
            </Match>
            <Match when={asHorizontalSplit(props.frame)}>
                {(f) => (
                    <HorizontalSplit
                        close={props.close}
                        reset={props.reset}
                        frame={f()}
                    />
                )}
            </Match>
            <Match when={asVerticalSplit(props.frame)}>
                {(f) => (
                    <VerticalSplit
                        close={props.close}
                        reset={props.reset}
                        frame={f()}
                    />
                )}
            </Match>
        </Switch>
    );
}
