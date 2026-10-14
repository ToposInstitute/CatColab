import Tooltip from "@corvu/tooltip";
import { Index, Show } from "solid-js";

import type { TableIssue } from "catcolab-documents";
import { issueMessage } from "./validation";

import styles from "./table_editor.module.css";

/** Tooltip listing the issues that apply to a row as a whole, shown on its row header. */
export function RowIssueTooltip(props: { issues: ReadonlyArray<TableIssue> }) {
    return (
        <Show when={props.issues.length > 0} fallback={<th class={styles.rowHeader} scope="row" />}>
            <Tooltip hoverableContent={false} openOnFocus={false}>
                <Tooltip.Trigger
                    as="th"
                    class={`${styles.rowHeader} ${styles.invalid}`}
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
