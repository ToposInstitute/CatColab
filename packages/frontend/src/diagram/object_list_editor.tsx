import { createEffect, type JSX, splitProps, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { InlineListEditor, type TextInputOptions } from "catcolab-ui-components";
import type { Ob, QualifiedName } from "catlog-wasm";
import { ObIdInput } from "../components";
import { buildObList, extractObList } from "../model/ob_operations";
import { removeProxyAndCopy } from "../util/remove_proxy_and_copy";
import { LiveDiagramContext } from "./context";
import type { ObInputProps } from "./object_input";
import { createObLookup } from "./object_input.tsx";

import "./object_list_editor.css";

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

    const liveDiagram = useContext(LiveDiagramContext);
    invariant(liveDiagram, "Live model should be provided as context");

    const lookup = createObLookup(liveDiagram);

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

    const completions = (): QualifiedName[] | undefined =>
        lookup.completions(modeAppType().content.obType);

    // Make the default value the empty list, rather than null.
    createEffect(() => {
        if (!props.ob) {
            setObList([]);
        }
    });

    return (
        <InlineListEditor items={obList()} setItems={setObList} {...listProps}>
            {(ob, setOb, options) => (
                <ObIdInput
                    ob={ob()}
                    setOb={setOb}
                    placeholder={props.placeholder}
                    idToLabel={lookup.idToLabel}
                    labelToId={lookup.labelToId}
                    completions={completions()}
                    {...options}
                />
            )}
        </InlineListEditor>
    );
}
