import type { JSX } from "solid-js";
import { render } from "solid-js/web";
import { afterEach } from "vitest";

const cleanups: (() => void)[] = [];

/** Mount a component in the browser, disposing its Solid root after each test. */
export function mount(component: () => JSX.Element): HTMLElement {
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(component, container);
    cleanups.push(() => {
        dispose();
        container.remove();
    });
    return container;
}

afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) {
        cleanup();
    }
});
