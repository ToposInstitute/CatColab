import type { SimpleIcon as SimpleIconData } from "simple-icons";

export function SimpleIcon(props: { icon: SimpleIconData; size?: number | string }) {
    return (
        <svg
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={props.size ?? 24}
            height={props.size ?? 24}
            fill="currentColor"
        >
            <title>{props.icon.title}</title>
            <path d={props.icon.path} />
        </svg>
    );
}
