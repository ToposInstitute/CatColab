import { createEffect, type JSX, splitProps, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { InlineListEditor, type TextInputOptions } from "catcolab-ui-components";
import type { Ob } from "catlog-wasm";
import { ObIdInput } from "../components";
import { removeProxyAndCopy } from "../util/remove_proxy_and_copy";
import { LiveModelContext } from "./context";
import { buildObList, extractObList } from "./ob_operations";
import { type ObInputProps } from "./object_input";

type ObListEditorProps = ObInputProps &
    TextInputOptions & {
        insertKey?: string;
        startDelimiter?: JSX.Element | string;
        endDelimiter?: JSX.Element | string;
        separator?: (index: number) => JSX.Element | string;
    };

/** Edits a list of objects of given type. */
export function ObListEditor(allProps: ObListEditorProps) {
    const [props, listProps] = splitProps(allProps, ["ob", "setOb", "obType", "placeholder"]);

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const modeAppType = () => {
        if (props.obType.tag !== "ModeApp") {
            throw new Error(`Object type should be a list modality, received: ${props.obType}`);
        }
        return props.obType;
    };

    const obList = (): Array<Ob | null> => extractObList(props.ob);

    const setObList = (objects: Array<Ob | null>) => {
        props.setOb(buildObList(modeAppType().content.modality, removeProxyAndCopy(objects)));
    };

    // Make the default value the empty list, rather than null.
    createEffect(() => {
        if (!props.ob) {
            setObList([]);
        }
    });

    return (
<<<<<<< HEAD
        <InlineListEditor items={obList()} setItems={setObList} {...listProps}>
            {(ob, setOb, options) => (
                <ObIdInput
                    ob={ob()}
                    setOb={setOb}
                    placeholder={props.placeholder}
                    idToLabel={(id) => liveModel().elaboratedModel()?.obGeneratorLabel(id)}
                    labelToId={(label) =>
                        liveModel().elaboratedModel()?.obGeneratorWithLabel(label)
                    }
                    completions={completions()}
                    {...options}
                />
            )}
        </InlineListEditor>
=======
        <ul
            class="object-list"
            onMouseDown={(evt) => {
                if (obList().length === 0) {
                    insertNewOb(0);
                    parentFocus.setFocused(true);
                    evt.preventDefault();
                }
            }}
        >
            {props.startDelimiter}
            <Index each={obList()} fallback={<input class="empty-list-input" />}>
                {(ob, i) => (
                    <li>
                        <Show when={i > 0 && props.separator}>{(sep) => sep()(i)}</Show>
                        <ObInput
                            obType={modeAppType().content.obType}
                            ob={ob()}
                            setOb={(ob) => {
                                updateObList((objects) => {
                                    objects[i] = ob;
                                });
                            }}
                            onTextChange={(text) => inputTexts.set(i, text)}
                            placeholder={props.placeholder}
                            focus={focus.childFocus(i)}
                            deleteBackward={() =>
                                batch(() => {
                                    updateObList((objects) => {
                                        objects.splice(i, 1);
                                    });
                                    if (i === 0) {
                                        props.deleteBackward?.();
                                    } else {
                                        focus.setActiveChild(i - 1);
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
                                    focus.setActiveChild(i - 1);
                                }
                            }}
                            exitRight={() => {
                                if (i === obList().length - 1) {
                                    props.exitRight?.();
                                } else {
                                    focus.setActiveChild(i + 1);
                                }
                            }}
                            interceptKeyDown={(evt) => {
                                if (evt.key === props.insertKey) {
                                    insertNewOb(i + 1);
                                    return true;
                                } else if (evt.key === "Home" && !evt.shiftKey) {
                                    // TODO: Should move to beginning of input.
                                    focus.setActiveChild(0);
                                } else if (evt.key === "End" && !evt.shiftKey) {
                                    focus.setActiveChild(obList().length - 1);
                                }
                                return false;
                            }}
                        />
                    </li>
                )}
            </Index>
            {props.endDelimiter}
        </ul>
>>>>>>> e3eed8c1 (Tabulators)
    );
}
