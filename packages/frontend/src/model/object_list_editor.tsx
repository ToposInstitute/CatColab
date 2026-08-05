import { createEffect, type JSX, splitProps, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { InlineListEditor, type TextInputOptions } from "catcolab-ui-components";
import type { Ob } from "catlog-wasm";
import { removeProxyAndCopy } from "../util/remove_proxy_and_copy";
import { LiveModelContext } from "./context";
import { buildObList, extractObList } from "./ob_operations";
import { ObInput, type ObInputProps } from "./object_input";

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
        <InlineListEditor items={obList()} setItems={setObList} {...listProps}>
            {(ob, setOb, options) => (
                <ObInput
                    obType={modeAppType().content.obType}
                    ob={ob()}
                    setOb={setOb}
                    placeholder={props.placeholder}
                    {...options}
                />
            )}
        </InlineListEditor>
    );
}
