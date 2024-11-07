import { createEffect, createSignal, splitProps } from "solid-js";

import type { Uuid } from "catlog-wasm";
import type { IndexedMap } from "../util/indexing";
import type { Completion } from "./completions";
import { InlineInput, type InlineInputErrorStatus, type InlineInputOptions } from "./inline_input";

/** Optional props for `IdInput` component.
 */
export type IdInputOptions = {
    completions?: Uuid[];
    invalid?: boolean;
} & Omit<InlineInputOptions, "completions">;

/** Input a UUID by specifying its human-readable alias.

The mapping between UUID and human-readable names is a prop to this component.
 */
export function IdInput(
    allProps: {
        id: Uuid | null;
        setId: (id: Uuid | null) => void;
        nameMap?: IndexedMap<Uuid, string>;
    } & IdInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, [
        "id",
        "setId",
        "nameMap",
        "invalid",
        "completions",
    ]);

    const [text, setText] = createSignal("");

    const updateText = (id: Uuid | null) => {
        let name = "";
        if (id) {
            name = props.nameMap?.map.get(id) ?? "";
        }
        setText(name);
    };

    createEffect(() => updateText(props.id));

    const handleNewText = (text: string) => {
        const possibleIds = props.nameMap?.index.get(text);
        const firstId = possibleIds?.[0];
        if (firstId) {
            // TODO: Warn the user when the names are not unique.
            props.setId(firstId);
        } else if (text === "") {
            // To avoid erasing incompletely entered text, only reset the ID
            // to null when the text is also empty.
            props.setId(null);
        }
        setText(text);
    };

    const completions = (): Completion[] | undefined =>
        props.completions?.map((id) => ({
            name: props.nameMap?.map.get(id) ?? "",
            onComplete() {
                props.setId(id);
                updateText(id);
            },
        }));

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

    return (
        <InlineInput
            text={text()}
            setText={handleNewText}
            completions={completions()}
            status={status()}
            {...inputProps}
        />
    );
}
