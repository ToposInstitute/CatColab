import type { MDXProps } from "mdx/types";
import { type Component, lazy } from "solid-js";

export function lazyMdx(fn: () => Promise<{ default: Component<MDXProps> }>) {
    const MDXPage = lazy(fn);
    return () => <MDXPage />;
}
