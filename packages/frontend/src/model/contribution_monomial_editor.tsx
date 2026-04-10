import { deepEqual } from "fast-equals";
import {
    batch,
    createEffect,
    createSignal,
    For,
    Index,
    type JSX,
    mergeProps,
    Show,
    untrack,
    useContext,
} from "solid-js";
import invariant from "tiny-invariant";

import type { TextInputOptions } from "catcolab-ui-components";
import type { Ob, QualifiedName } from "catlog-wasm";
import { ObIdInput } from "../components";
import { deepCopyJSON } from "../util/deepcopy";
import { LiveModelContext } from "./context";
import { buildObList, extractObList } from "./ob_operations";
import type { ObInputProps } from "./object_input";

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
export function ContributionMonomialEditor(originalProps: ContributionMonomialEditorProps) {
    const props = mergeProps(
        {
            insertKey: ",",
            startDelimiter: <div class={styles.delimiter}>{"["}</div>,
            endDelimiter: <div class={styles.delimiter}>{"]"}</div>,
            separator: () => <div class={styles.separator}>{","}</div>,
        },
        originalProps,
    );

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const [activeIndex, setActiveIndex] = createSignal<number>(0);

    const modeAppType = () => {
        if (props.obType.tag !== "ModeApp") {
            throw new Error(`Object type should be a list modality, received: ${props.obType}`);
        }
        return props.obType;
    };

    const obList = (): Array<Ob | null> => extractObList(props.ob);

    const setObList = (objects: Array<Ob | null>) => {
        props.setOb(buildObList(modeAppType().content.modality, objects));
    };

    const updateObList = (f: (objects: Array<Ob | null>) => void) => {
        const objects = deepCopyJSON(obList());
        f(objects);
        setObList(objects);
    };

    const insertNewOb = (i: number) => {
        batch(() => {
            updateObList((objects) => {
                objects.splice(i, 0, null);
            });
            setActiveIndex(i);
        });
    };

    const completions = (): QualifiedName[] | undefined =>
        liveModel().elaboratedModel()?.obGeneratorsWithType(modeAppType().content.obType);

    // Make the default value the empty list, rather than null.
    createEffect(() => {
        if (!props.ob) {
            setObList([]);
        }
    });

    // Insert into new object into empty list when focus is gained.
    createEffect(() => {
        if (props.isActive && untrack(obList).length === 0) {
            insertNewOb(0);
        }
    });

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
            <ul
                class={styles.monomial}
                onMouseDown={(evt) => {
                    if (obList().length === 0) {
                        insertNewOb(0);
                        props.hasFocused?.();
                        evt.preventDefault();
                    }
                }}
            >
                {props.startDelimiter}
                <Index each={obList()} fallback={<input class={styles.emptyInput} />}>
                    {(ob, i) => (
                        <li>
                            <Show when={i > 0 && props.separator}>{(sep) => sep()(i)}</Show>
                            <ObIdInput
                                ob={ob()}
                                setOb={(ob) => {
                                    updateObList((objects) => {
                                        objects[i] = ob;
                                    });
                                }}
                                placeholder={props.placeholder}
                                idToLabel={(id) =>
                                    liveModel().elaboratedModel()?.obGeneratorLabel(id)
                                }
                                labelToId={(label) =>
                                    liveModel().elaboratedModel()?.obGeneratorWithLabel(label)
                                }
                                completions={completions()}
                                isActive={props.isActive && activeIndex() === i}
                                deleteBackward={() =>
                                    batch(() => {
                                        updateObList((objects) => {
                                            objects.splice(i, 1);
                                        });
                                        if (i === 0) {
                                            props.deleteBackward?.();
                                        } else {
                                            setActiveIndex(i - 1);
                                        }
                                    })
                                }
                                deleteForward={() => {
                                    batch(() => {
                                        updateObList((objects) => {
                                            objects.splice(i, 1);
                                        });
                                        if (i === 0) {
                                            props.deleteForward?.();
                                        }
                                    });
                                }}
                                exitBackward={() => props.exitBackward?.()}
                                exitForward={() => props.exitForward?.()}
                                exitLeft={() => {
                                    if (i === 0) {
                                        props.exitLeft?.();
                                    } else {
                                        setActiveIndex(i - 1);
                                    }
                                }}
                                exitRight={() => {
                                    if (i === obList().length - 1) {
                                        props.exitRight?.();
                                    } else {
                                        setActiveIndex(i + 1);
                                    }
                                }}
                                interceptKeyDown={(evt) => {
                                    if (evt.key === props.insertKey) {
                                        insertNewOb(i + 1);
                                        return true;
                                    } else if (evt.key === "Home" && !evt.shiftKey) {
                                        setActiveIndex(0);
                                    } else if (evt.key === "End" && !evt.shiftKey) {
                                        setActiveIndex(obList().length - 1);
                                    }
                                    return false;
                                }}
                                hasFocused={() => {
                                    setActiveIndex(i);
                                    props.hasFocused?.();
                                }}
                            />
                        </li>
                    )}
                </Index>
                {props.endDelimiter}
            </ul>
        </Show>
    );
}
