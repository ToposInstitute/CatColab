import { type Component, onCleanup, onMount } from "solid-js";

/** Mount a React subtree inside a SolidJS component.

This helper exists so that we can embed a third-party React component (e.g.
the Petrinaut editor) inside CatColab's SolidJS frontend. It creates a host
`<div>` in the Solid render tree and, on mount, attaches a React root to it.
The React tree is created exactly once per mount; reactivity on the Solid side
is intentionally not bridged here — callers who need to push updates into the
React tree should build that on top (or just remount).

React and ReactDOM are imported dynamically so they live in the lazy chunk of
whatever module first uses `<ReactIsland>`, rather than the main bundle.
 */
export const ReactIsland: Component<{
    /** Factory invoked once at mount time to produce the React element. */
    render: () => unknown;
    /** Optional CSS class for the host element. */
    class?: string;
}> = (props) => {
    let host: HTMLDivElement | undefined;

    onMount(async () => {
        if (!host) {
            return;
        }
        const { createRoot } = await import("react-dom/client");
        // `render` should return a ReactNode; we keep the signature loose so
        // callers don't have to import React types at the call site.
        const root = createRoot(host);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        root.render(props.render() as any);
        onCleanup(() => {
            // Defer unmount so React can run cleanups outside of a render.
            queueMicrotask(() => root.unmount());
        });
    });

    return <div ref={host} class={props.class} />;
};
