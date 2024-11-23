import { createEffect, createSignal, splitProps } from "solid-js";
import { P, match } from "ts-pattern";

import type { Mor, Ob, Uuid } from "catlog-wasm";
import type { IndexedMap } from "../util/indexing";
import type { Completion } from "./completions";
import { InlineInput, type InlineInputErrorStatus, type InlineInputOptions } from "./inline_input";

/** A name for the purposes of the `IdInput` component.

A name is either a non-numeral string, representing a meaningful name typically
created by a human, or a number, representing a "`gensym`-ed" identifier.
 */
export type Name = string | number;

/** A UUID-name mapping, as expected by the `IdInput` component.
 */
export type IdToNameMap = IndexedMap<Uuid, Name>;

/** Optional props for `IdInput` component.
 */
export type IdInputOptions = {
    idToName?: IdToNameMap;
    invalid?: boolean;
} & Omit<InlineInputOptions, "completions">;

/** Input a UUID by specifying its human-readable name.

The mapping between UUIDs and names is a prop to this component.
 */
export function IdInput(
    allProps: {
        id: Uuid | null;
        setId: (id: Uuid | null) => void;
        completions?: Uuid[];
    } & IdInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, [
        "id",
        "setId",
        "completions",
        "idToName",
        "invalid",
    ]);

    const idToText = (id: Uuid): string | undefined => props.idToName?.map.get(id)?.toString();

    const textToIds = (text: string): Uuid[] => {
        let name: Name = text;
        if (/^\d+$/.test(text)) {
            name = Number.parseInt(text);
        }
        return props.idToName?.index.get(name) ?? [];
    };

    const [text, setText] = createSignal("");

    const updateText = (id: Uuid | null) => {
        let name = "";
        if (id) {
            name = idToText(id) ?? "";
        }
        setText(name);
    };

    createEffect(() => updateText(props.id));

    const handleNewText = (text: string) => {
        const possibleIds = textToIds(text);
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
            name: idToText(id) ?? "",
            onComplete() {
                props.setId(id);
                updateText(id);
            },
        }));

    const isComplete = () => {
        const name = props.id ? idToText(props.id) : "";
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

/** Input a basic object by specifying its human-readable name.
 */
export function ObIdInput(
    allProps: {
        ob: Ob | null;
        setOb: (ob: Ob | null) => void;
        completions?: Ob[];
    } & IdInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, ["ob", "setOb", "completions"]);

    const getId = (ob: Ob | null): Uuid | null =>
        match(ob)
            .with(
                {
                    tag: "Basic",
                    content: P.select(),
                },
                (id) => id,
            )
            .otherwise(() => null);

    const id = (): Uuid | null => getId(props.ob);

    const setId = (id: Uuid | null) => {
        props.setOb(
            id === null
                ? null
                : {
                      tag: "Basic",
                      content: id,
                  },
        );
    };

    const completions = (): Uuid[] | undefined =>
        props.completions?.map(getId).filter((id) => id !== null);

    return <IdInput id={id()} setId={setId} completions={completions()} {...inputProps} />;
}

/** Input a basic morphism by specifying its human-readable name.
 */
export function MorIdInput(
    allProps: {
        mor: Mor | null;
        setMor: (mor: Mor | null) => void;
        completions?: Mor[];
    } & IdInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, ["mor", "setMor", "completions"]);

    const getId = (mor: Mor | null): Uuid | null =>
        match(mor)
            .with(
                {
                    tag: "Basic",
                    content: P.select(),
                },
                (id) => id,
            )
            .otherwise(() => null);

    const id = (): Uuid | null => getId(props.mor);

    const setId = (id: Uuid | null) => {
        props.setMor(
            id === null
                ? null
                : {
                      tag: "Basic",
                      content: id,
                  },
        );
    };

    const completions = (): Uuid[] | undefined =>
        props.completions?.map(getId).filter((id) => id !== null);

    return <IdInput id={id()} setId={setId} completions={completions()} {...inputProps} />;
}
