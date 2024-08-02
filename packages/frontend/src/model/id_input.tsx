import { createEffect, createSignal, splitProps, useContext } from "solid-js";

import type { ObType, Uuid } from "catlog-wasm";
import { InlineInput, type InlineInputErrorStatus, type InlineInputOptions } from "../components";
import type { TheoryMeta } from "../theory";
import type { IndexedMap } from "../util/indexing";
import { ObjectIndexContext, TheoryContext } from "./model_context";

/** Optional props for `IdInput` component.
 */
export type IdInputOptions = {
    invalid?: boolean;
} & InlineInputOptions;

/** Input an ID by specifying its human-readable name.
 */
export function IdInput(
    allProps: {
        id: Uuid | null;
        setId: (id: Uuid | null) => void;
        nameMap?: IndexedMap<Uuid, string>;
    } & IdInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, ["id", "setId", "nameMap", "invalid"]);

    const [text, setText] = createSignal("");

    createEffect(() => {
        let name = "";
        if (props.id) {
            name = props.nameMap?.map.get(props.id) ?? "";
        }
        setText(name);
    });

    const handleNewText = (text: string) => {
        const possibleIds = props.nameMap?.index.get(text);
        if (possibleIds && possibleIds.length > 0) {
            // TODO: Warn the user when the names are not unique.
            props.setId(possibleIds[0]);
        } else if (text === "") {
            // To avoid erasing incompletely entered text, only reset the ID
            // to null when the text is also empty.
            props.setId(null);
        }
        setText(text);
    };

    const isComplete = () => {
        const name = props.id ? props.nameMap?.map.get(props.id) : "";
        return text() === name;
    };
    const status = (): InlineInputErrorStatus => {
        if (!isComplete()) {
            return "incomplete";
        }
        if (props.invalid) {
            return "invalid";
        }
        return null;
    };

    return <InlineInput text={text()} setText={handleNewText} status={status()} {...inputProps} />;
}

/** Input the ID of an object in a model.
 */
export function ObjectIdInput(
    allProps: {
        objectId: Uuid | null;
        setObjectId: (id: Uuid | null) => void;
        objectType?: ObType;
    } & IdInputOptions,
) {
    const [props, idProps] = splitProps(allProps, ["objectId", "setObjectId", "objectType"]);

    const objectIndex = useContext(ObjectIndexContext);
    const theory = useContext(TheoryContext);
    const cssClasses = () => obClasses(theory?.(), props.objectType);

    return (
        <div class={cssClasses().join(" ")}>
            <IdInput
                id={props.objectId}
                setId={props.setObjectId}
                nameMap={objectIndex?.()}
                {...idProps}
            />
        </div>
    );
}

export function obClasses(theory: TheoryMeta | undefined, typ?: ObType): string[] {
    const typeMeta = typ ? theory?.getObTypeMeta(typ) : undefined;
    return [...(typeMeta?.cssClasses ?? []), ...(typeMeta?.textClasses ?? [])];
}
