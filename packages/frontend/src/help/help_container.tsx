import type { JSX } from "solid-js";

import { BrandedToolbar } from "../page/toolbar";

import "./help_container.css";

export default function HelpContainer(props: {
    children?: JSX.Element;
}) {
    return (
        <div class="growable-container">
            <BrandedToolbar />
            <div class="page-container help-container">
                <ul class="help-navigation">
                    <li class="help-navigation-link"><a href="/help/">Overview</a></li>
                    <li class="help-navigation-link"><a href="/help/quick-start/">Quick-start</a></li>
                    <li class="help-navigation-link"><a href="/help/logics/">Logics</a></li>
                    <li class="help-navigation-link"><a href="/help/credits/">Credits</a></li>
                </ul>
                {props.children}
            </div>
        </div>
    );
}
