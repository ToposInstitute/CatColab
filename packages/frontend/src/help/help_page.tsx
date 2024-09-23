import type { MDXProps } from "mdx/types";
import type { Component } from "solid-js";

import "./help_page.css";

export function helpPage(HelpContent: Component<MDXProps>) {
    return () => (
        <div class="growable-container">
            <div class="help-container">
                <HelpContent />
            </div>
        </div>
    );
}
