declare module "*.mdx" {
    import type { Component } from "solid-js";
    const MDXComponent: Component;
    export default MDXComponent;
}

declare module "mdx/types" {
    export interface MDXProps {
        children?: never;
    }
}
