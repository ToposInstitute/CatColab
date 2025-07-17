import { Index, type JSX, type JSXElement, Show, mergeProps, useContext } from "solid-js";
import invariant from "tiny-invariant";

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
            return [null];
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

    const completions = (): Ob[] | undefined =>
        liveModel().validatedModel()?.model.objectsWithType(modeAppType().content.obType);

    return (
        <ul class="object-list">
            {props.startDelimiter}
            <Index each={obList()}>
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
                            insertForward={(evt) => {
                                if (evt.key !== props.insertKey) {
                                    return false;
                                }
                                updateObList((objects) => {
                                    objects.splice(i + 1, 0, null);
                                });
                                inputRefs[i + 1]?.focus();
                                return true;
                            }}
                            exitLeft={() => inputRefs[i - 1]?.focus()}
                            exitRight={() => inputRefs[i + 1]?.focus()}
                        />
                    </li>
                )}
            </Index>
            {props.endDelimiter}
        </ul>
    );
}
