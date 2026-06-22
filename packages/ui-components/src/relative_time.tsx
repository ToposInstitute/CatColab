import { Show } from "solid-js";

// oxlint-disable-next-line no-unassigned-import -- side-effect import registers the custom element
import "@github/relative-time-element";

declare module "solid-js" {
    namespace JSX {
        interface IntrinsicElements {
            "relative-time": JSX.HTMLAttributes<HTMLElement> & {
                datetime?: string;
                format?: string;
                "format-style"?: string;
                tense?: string;
                precision?: string;
                threshold?: string;
                prefix?: string;
                "no-title"?: boolean;
                lang?: string;
            };
        }
    }
}

const warnedTimestamps = new Set<unknown>();

function toIsoStringSafe(ts: unknown): string | undefined {
    if (typeof ts !== "number" || !Number.isFinite(ts)) {
        if (!warnedTimestamps.has(ts)) {
            warnedTimestamps.add(ts);
            console.warn("RelativeTime: invalid timestamp", ts);
        }
        return undefined;
    }
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) {
        if (!warnedTimestamps.has(ts)) {
            warnedTimestamps.add(ts);
            console.warn("RelativeTime: timestamp produced invalid Date", ts);
        }
        return undefined;
    }
    return d.toISOString();
}

/** Display a timestamp as relative text, with the exact time as a tooltip. Auto-updates. */
export function RelativeTime(props: { timestamp: number }) {
    const datetime = () => toIsoStringSafe(props.timestamp);

    return (
        <Show when={datetime()} fallback={<span aria-hidden="true">—</span>}>
            {(dt) => <relative-time datetime={dt()} />}
        </Show>
    );
}
