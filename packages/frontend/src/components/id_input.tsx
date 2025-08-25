import { createEffect, createSignal, splitProps } from "solid-js";
import { P, match } from "ts-pattern";

import type { Mor, Ob, Uuid } from "catlog-wasm";
import { type IdToNameMap, type Name, type NameType, nameType } from "../util/indexing";
import type { Completion } from "./completions";
import { InlineInput, type InlineInputErrorStatus, type InlineInputOptions } from "./inline_input";

import "./id_input.css";

/** Optional props for `IdInput` component.
 */
export type IdInputOptions = {
    generateId?: () => Uuid;
    idToName?: IdToNameMap;
    isInvalid?: boolean;
    completions?: Uuid[];
} & Omit<InlineInputOptions, "completions" | "status">;

/** Input a UUID by specifying its human-readable name.

The mapping between UUIDs and names is a prop to this component.
 */
export function IdInput(
    allProps: {
        id: Uuid | null;
        setId: (id: Uuid | null) => void;
    } & IdInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, [
        "id",
        "setId",
        "generateId",
        "completions",
        "idToName",
        "isInvalid",
    ]);

    const idToName = (id: Uuid): Name | undefined => props.idToName?.map.get(id);
    const idToText = (id: Uuid): string | undefined => idToName(id)?.toString();

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
        if (props.isInvalid) {
            return "invalid";
        }
        return null;
    };

    const setNewId = () => props.generateId && props.setId(props.generateId());

    const maybeNameType = (id: Uuid | null): NameType | "undefined" => {
        if (id === null) {
            return "undefined";
        }
        const name = idToName(id);
        return name === undefined ? "undefined" : nameType(name);
    };

    return (
        <div class={`id-input ${maybeNameType(props.id)}`}>
            <InlineInput
                text={text()}
                setText={handleNewText}
                completions={completions()}
                status={status()}
                autofill={props.generateId ? setNewId : undefined}
                {...inputProps}
            />
        </div>
    );
}

/** Input a basic object by specifying its human-readable name.
 */
export function ObIdInput(
    allProps: {
        ob: Ob | null;
        setOb: (ob: Ob | null) => void;
    } & IdInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, ["ob", "setOb"]);

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

    return <IdInput id={id()} setId={setId} {...inputProps} />;
}

/** Input a basic morphism by specifying its human-readable name.
 */
export function MorIdInput(
    allProps: {
        mor: Mor | null;
        setMor: (mor: Mor | null) => void;
    } & IdInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, ["mor", "setMor"]);

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

    return <IdInput id={id()} setId={setId} {...inputProps} />;
}
