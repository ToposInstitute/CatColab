import type { JSX } from "solid-js";

import { BrandedToolbar } from "../page/toolbar";

import "./help_layout.css";

export default function HelpLayout(props: { children?: JSX.Element }) {
    return (
        <div class="growable-container">
            <BrandedToolbar />
            <div class="page-container help-container">
                <div class="help-navigation">
                    <span class="help-navigation-title">
                        <a href="/help/">Help and documentation</a>
                    </span>
                    <ul class="help-navigation-links">
                        <li class="help-navigation-link">
                            <a href="/help/">Overview</a>
                        </li>
                        <li class="help-navigation-link">
                            <a href="/help/guides/">Guides</a>
                        </li>
                        <li class="help-navigation-link">
                            <a href="/help/logics/">Logics</a>
                        </li>
                        <li class="help-navigation-link">
                            <a href="/help/credits/">Credits</a>
                        </li>
                    </ul>
                </div>
                {props.children}
            </div>
        </div>
    );
}
