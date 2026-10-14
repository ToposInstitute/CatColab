import Tooltip from "@corvu/tooltip";
import { Index, Show } from "solid-js";

import type { TableIssue } from "catcolab-documents";
import { issueMessage } from "./validation";

import styles from "./table_editor.module.css";

/** Row-level constraints have their own indicator rather than marking every field. */
export function RowHeader(props: { issues: ReadonlyArray<TableIssue> }) {
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
