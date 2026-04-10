import { deepEqual } from "fast-equals";
import { Index, Show, useContext } from "solid-js";
import type { JSX } from "solid-js";
import invariant from "tiny-invariant";

import type { TextInputOptions } from "catcolab-ui-components";
import type { Ob } from "catlog-wasm";
import { LiveModelContext } from "./context";
import { extractObList } from "./ob_operations";
import type { ObInputProps } from "./object_input";
import { ObListEditor } from "./object_list_editor";

import styles from "./contribution_monomial_editor.module.css";

type ContributionMonomialEditorProps = ObInputProps &
    TextInputOptions & {
        insertKey?: string;
        startDelimiter?: JSX.Element | string;
        endDelimiter?: JSX.Element | string;
        separator?: (index: number) => JSX.Element | string;
    };

/** A run-length encoded entry: the object and how many times it repeats. */
type RunEntry = {
    ob: Ob | null;
    count: number;
};

/** Count occurrences of each distinct object, preserving first-appearance order. */
function countObjects(objects: Array<Ob | null>): RunEntry[] {
    const entries: RunEntry[] = [];
    for (const ob of objects) {
        const existing = entries.find((e) => deepEqual(e.ob, ob));
        if (existing) {
            existing.count++;
        } else {
            entries.push({ ob, count: 1 });
        }
    }
    return entries;
}

/** Edits a list of objects, displaying repeated objects with superscript counts when not editing. */
export function ContributionMonomialEditor(props: ContributionMonomialEditorProps) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const obList = (): Array<Ob | null> => extractObList(props.ob);

    const runs = () => countObjects(obList());

    /** Resolve the label for an object, returning null if not available. */
    const obLabel = (ob: Ob | null): string | null => {
        if (!ob || ob.tag !== "Basic") {
            return null;
        }
        return liveModel().elaboratedModel()?.obGeneratorLabel(ob.content)?.join(".") ?? null;
    };

    return (
        <Show
            when={props.isActive}
            fallback={
                <div
                    class={`${styles.monomial} ${styles.collapsed}`}
                    onMouseDown={(evt) => {
                        props.hasFocused?.();
                        evt.preventDefault();
                    }}
                >
                    <Index each={runs()} fallback={<span class={styles.emptyMonomial} />}>
                        {(run, index) => (
                            <span>
                                {obLabel(run().ob) ?? "?"}
                                <Show when={run().count > 1}>
                                    <sup class={styles.exponent}>{run().count}</sup>
                                </Show>
                                <Show when={index < runs().length - 1}>
                                    <span class={styles.productSeparator}>&middot;</span>
                                </Show>
                            </span>
                        )}
                    </Index>
                </div>
            }
        >
            <div class={styles.monomial}>
                <ObListEditor
                    ob={props.ob}
                    setOb={props.setOb}
                    obType={props.obType}
                    placeholder={props.placeholder}
                    isInvalid={props.isInvalid}
                    isActive={props.isActive}
                    deleteBackward={props.deleteBackward}
                    deleteForward={props.deleteForward}
                    exitBackward={props.exitBackward}
                    exitForward={props.exitForward}
                    exitLeft={props.exitLeft}
                    exitRight={props.exitRight}
                    hasFocused={props.hasFocused}
                    insertKey={props.insertKey ?? ","}
                    startDelimiter={<div class={styles.delimiter}>{"["}</div>}
                    endDelimiter={<div class={styles.delimiter}>{"]"}</div>}
                    separator={() => <div class={styles.separator}>{","}</div>}
                />
            </div>
        </Show>
    );
}
