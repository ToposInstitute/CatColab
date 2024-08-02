import { createEffect, createSignal, splitProps } from "solid-js";

import type { Uuid } from "catlog-wasm";
import { InlineInput, type InlineInputErrorStatus, type InlineInputOptions } from "../components";
import type { IndexedMap } from "../util/indexing";

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
