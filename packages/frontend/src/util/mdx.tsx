import { Title } from "@solidjs/meta";
import type { MDXProps } from "mdx/types";
import { type Component, lazy } from "solid-js";

export function lazyMdx(fn: () => Promise<{ default: Component<MDXProps> }>, title?: string) {
    const MDXPage = lazy(fn);
    const appTitle = import.meta.env.VITE_APP_TITLE;
    return () => (
        <>
            {title && (
                <Title>
                    {title} - {appTitle}
                </Title>
            )}
            <MDXPage />
        </>
    );
}
