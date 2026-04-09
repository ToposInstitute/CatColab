import { createSignal, onCleanup } from "solid-js";

/** Format a timestamp as a human-readable relative string (e.g. "5 min ago", "yesterday"). */
export function formatRelativeTime(ms: number, now: number): string {
    const diffMs = now - ms;
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) {
        return "just now";
    }
    if (minutes < 60) {
        return `${minutes} min ago`;
    }
    if (minutes < 120) {
        const remainMin = minutes % 60;
        return remainMin === 0 ? "1 hour ago" : `1 hour ${remainMin} min ago`;
    }
    if (hours < 24) {
        const hourLabel = hours === 1 ? "hour" : "hours";
        return `${hours} ${hourLabel} ago`;
    }
    if (days === 1) {
        return "yesterday";
    }
    if (days < 7) {
        return `${days} days ago`;
    }

    const d = new Date(ms);
    return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

/** Format a timestamp as an exact localized string (e.g. "Apr 9, 2026, 03:42 PM"). */
export function formatExactTimestamp(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** Display a timestamp as relative text, with the exact time as a tooltip. Auto-updates. */
export function RelativeTime(props: { timestamp: number }) {
    const [now, setNow] = createSignal(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    onCleanup(() => clearInterval(timer));

    return (
        <span title={formatExactTimestamp(props.timestamp)}>
            {formatRelativeTime(props.timestamp, now())}
        </span>
    );
}
