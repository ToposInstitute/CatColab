import {
    batch,
    createEffect,
    createSignal,
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
import { LiveDiagramContext } from "./context";
import type { ObInputProps } from "./object_input";

import "./object_list_editor.css";

type ObListEditorProps = ObInputProps &
    TextInputOptions & {
        insertKey?: string;
        startDelimiter?: JSX.Element | string;
        endDelimiter?: JSX.Element | string;
        separator?: (index: number) => JSX.Element | string;
    };

/** Edits a list of objects of given type. */
export function ObListEditor(props: ObListEditorProps) {
    props = mergeProps(
        {
            insertKey: ",",
            startDelimiter: <div class="default-delimiter">{"["}</div>,
            endDelimiter: <div class="default-delimiter">{"]"}</div>,
            separator: () => <div class="default-separator">{","}</div>,
        },
        props,
    );

    const liveDiagram = useContext(LiveDiagramContext);
    invariant(liveDiagram, "Live model should be provided as context");

    const [activeIndex, setActiveIndex] = createSignal<number>(0);

    const modeAppType = () => {
        if (props.obType.tag !== "ModeApp") {
            throw new Error(`Object type should be a list modality, received: ${props.obType}`);
        }
        return props.obType;
    };

    const obList = (): Array<Ob | null> => {
        if (!props.ob) {
            return [];
        }
        if (props.ob.tag !== "List") {
            throw new Error(`Object should be a list, received: ${props.ob}`);
        }
        return props.ob.content.objects;
    };

    const setObList = (objects: Array<Ob | null>) => {
        props.setOb({
            tag: "List",
            content: {
                modality: modeAppType().content.modality,
                objects,
            },
        });
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

	console.log("HERE!", liveDiagram());
    const completions = (): QualifiedName[] | undefined =>
        liveDiagram().elaboratedDiagram()?.obGeneratorsWithType(modeAppType().content.obType);

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

    return (
        <ul
            class="object-list"
            onMouseDown={(evt) => {
                if (obList().length === 0) {
                    insertNewOb(0);
                    props.hasFocused?.();
                    evt.preventDefault();
                }
            }}
        >
            {props.startDelimiter}
            <Index each={obList()} fallback={<input class="empty-list-input" />}>
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
                            idToLabel={(id) => liveDiagram().elaboratedDiagram()?.obGeneratorLabel(id)}
                            labelToId={(label) =>
                                liveDiagram().elaboratedDiagram()?.obGeneratorWithLabel(label)
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
                                    // TODO: Should move to beginning of input.
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
    );
}
