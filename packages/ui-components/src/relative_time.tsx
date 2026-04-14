import _ from "@github/relative-time-element";

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

/** Display a timestamp as relative text, with the exact time as a tooltip. Auto-updates. */
export function RelativeTime(props: { timestamp: number }) {
    const datetime = () => new Date(props.timestamp).toISOString();

    return <relative-time datetime={datetime()} />;
}
