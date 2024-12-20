import { useParams } from "@solidjs/router";
import type { MDXProps } from "mdx/types";
import { type Component, type JSX, lazy } from "solid-js";
import invariant from "tiny-invariant";

import { BrandedToolbar } from "./toolbar";

import "./help_page.css";

export function HelpContainer(props: {
    children?: JSX.Element;
}) {
    return (
        <div class="growable-container">
            <BrandedToolbar />
            <div class="help-container">{props.children}</div>
        </div>
    );
}

export function lazyMdx(fn: () => Promise<{ default: Component<MDXProps> }>) {
    const MDXPage = lazy(fn);
    return () => <MDXPage />;
}

export function TheoryHelpPage() {
    const params = useParams();
    const page = params.page;
    invariant(page, "Help page must be provided");

    const Page = lazyMdx(() => import(`../help/theory/${page}.mdx`));
    return <Page />;
}
