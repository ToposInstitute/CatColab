import type { JSX as SolidJSX } from "solid-js";

type WiredAttributes<T extends HTMLElement = HTMLElement> = SolidJSX.HTMLAttributes<T> & {
    disabled?: boolean;
    elevation?: number | string;
    "on:selected"?: (event: CustomEvent<{ selected: string }>) => void;
};

declare module "solid-js" {
    namespace JSX {
        interface IntrinsicElements {
            "wired-button": WiredAttributes;
            "wired-card": WiredAttributes & { fill?: string };
            "wired-checkbox": WiredAttributes & { checked?: boolean };
            "wired-combo": WiredAttributes & { selected?: string };
            "wired-dialog": WiredAttributes & { open?: boolean };
            "wired-divider": WiredAttributes;
            "wired-icon-button": WiredAttributes;
            "wired-input": WiredAttributes & {
                value?: string | number;
                type?: string;
                placeholder?: string;
                min?: string;
                max?: string;
                step?: string;
            };
            "wired-item": WiredAttributes & { value?: string; selected?: boolean };
            "wired-listbox": WiredAttributes & { selected?: string; horizontal?: boolean };
            "wired-radio": WiredAttributes & { checked?: boolean; name?: string };
            "wired-radio-group": WiredAttributes & { selected?: string };
            "wired-spinner": WiredAttributes & { spinning?: boolean; duration?: number | string };
            "wired-textarea": WiredAttributes & {
                value?: string;
                rows?: number | string;
                placeholder?: string;
            };
            "wired-toggle": WiredAttributes & { checked?: boolean };
        }
    }
}
