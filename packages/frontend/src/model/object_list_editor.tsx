import { focus } from "@solid-primitives/active-element";
import { Index, type JSX, type JSXElement, Show, mergeProps, useContext } from "solid-js";
import invariant from "tiny-invariant";
focus;

import type { Ob } from "catlog-wasm";
import { ObIdInput } from "../components";
import { deepCopyJSON } from "../util/deepcopy";
import { LiveModelContext } from "./context";
import type { ObInputProps } from "./editor_types";

import "./object_list_editor.css";

type ObListEditorProps = ObInputProps & {
    insertKey?: string;
    startDelimiter?: JSX.Element | string;
    endDelimiter?: JSXElement | string;
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

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const inputRefs: HTMLInputElement[] = [];

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
        updateObList((objects) => {
            objects.splice(i, 0, null);
        });
        inputRefs[i]?.focus();
    };

    const completions = (): Ob[] | undefined =>
        liveModel().validatedModel()?.model.objectsWithType(modeAppType().content.obType);

    const emptyListInput = () => (
        <input class="empty-list-input" use:focus={(isFocused) => isFocused && insertNewOb(0)} />
    );

    return (
        <ul
            class="object-list"
            onMouseDown={(evt) => {
                if (obList().length === 0) {
                    insertNewOb(0);
                    evt.preventDefault();
                }
            }}
        >
            {props.startDelimiter}
            <Index each={obList()} fallback={emptyListInput()}>
                {(ob, i) => (
                    <li>
                        <Show when={i > 0 && props.separator}>{(sep) => sep()(i)}</Show>
                        <ObIdInput
                            ref={(el) => {
                                inputRefs[i] = el;
                            }}
                            ob={ob()}
                            setOb={(ob) => {
                                updateObList((objects) => {
                                    objects[i] = ob;
                                });
                            }}
                            idToName={liveModel().objectIndex()}
                            completions={completions()}
                            deleteBackward={() => {
                                updateObList((objects) => {
                                    objects.splice(i, 1);
                                });
                                inputRefs[i - 1]?.focus();
                            }}
                            deleteForward={() => {
                                updateObList((objects) => {
                                    objects.splice(i, 1);
                                });
                            }}
                            exitLeft={() => inputRefs[i - 1]?.focus()}
                            exitRight={() => inputRefs[i + 1]?.focus()}
                            interceptKeyDown={(evt) => {
                                if (evt.key === props.insertKey) {
                                    insertNewOb(i + 1);
                                } else if (evt.key === "Home" && !evt.shiftKey) {
                                    const ref = inputRefs[0];
                                    if (ref) {
                                        ref.focus();
                                        ref.selectionEnd = 0;
                                    }
                                } else if (evt.key === "End" && !evt.shiftKey) {
                                    const ref = inputRefs[obList().length - 1];
                                    if (ref) {
                                        ref.focus();
                                        ref.selectionStart = ref.value.length;
                                    }
                                } else {
                                    return false;
                                }
                                return true;
                            }}
                        />
                    </li>
                )}
            </Index>
            {props.endDelimiter}
        </ul>
    );
}
