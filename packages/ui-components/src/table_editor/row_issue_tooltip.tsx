import Tooltip from "@corvu/tooltip";
import { type ComponentProps, Index, Show, splitProps } from "solid-js";

import type { TableIssue } from "catcolab-documents";
import { issueMessage } from "./validation";

import styles from "./table_editor.module.css";

/** Tooltip listing the issues that apply to a row as a whole, shown on its row header. */
export function RowIssueTooltip(
    allProps: ComponentProps<"th"> & { issues: ReadonlyArray<TableIssue> },
) {
    const [props, cellProps] = splitProps(allProps, ["issues", "class", "classList"]);
    return (
        <Show
            when={props.issues.length > 0}
            fallback={
                <th
                    {...cellProps}
                    class={`${styles.rowHeader} ${props.class ?? ""}`}
                    classList={props.classList}
                    scope="row"
                />
            }
        >
            <Tooltip hoverableContent={false} openOnFocus={false}>
                <Tooltip.Trigger
                    as="th"
                    {...cellProps}
                    class={`${styles.rowHeader} ${styles.invalid} ${props.class ?? ""}`}
                    classList={props.classList}
                    scope="row"
                    role="rowheader"
                    tabindex={-1}
                />
                <Tooltip.Portal>
                    <Tooltip.Content class="tooltip-content">
                        <ul class={styles.rowIssues}>
                            <Index each={props.issues}>
                                {(issue) => <li>{issueMessage(issue())}</li>}
                            </Index>
                        </ul>
                    </Tooltip.Content>
                </Tooltip.Portal>
            </Tooltip>
        </Show>
    );
}
