import { createEffect, createSignal, splitProps } from "solid-js";
import { P, match } from "ts-pattern";

import {
    type Completion,
    InlineInput,
    type InlineInputErrorStatus,
    type InlineInputOptions,
} from "catcolab-ui-components";
import type {
    LabelSegment,
    Mor,
    NameLookup,
    Ob,
    QualifiedLabel,
    QualifiedName,
    Uuid,
} from "catlog-wasm";

import "./id_input.css";

/** Optional props for `IdInput` component.
 */
export type IdInputOptions = {
    generateId?: () => Uuid;
    idToLabel?: (id: QualifiedName) => QualifiedLabel | undefined;
    labelToId?: (label: QualifiedLabel) => NameLookup | undefined;
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
        "idToLabel",
        "labelToId",
        "isInvalid",
    ]);

    const idToLabel = (id: QualifiedName): QualifiedLabel | undefined => props.idToLabel?.(id);
    const idToText = (id: QualifiedName): string | undefined => idToLabel(id)?.join(".");

    const textToId = (text: string): NameLookup => {
        let label: LabelSegment = text;
        if (/^\d+$/.test(text)) {
            label = Number.parseInt(text);
        }
        return props.labelToId?.([label]) ?? { tag: "None" };
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
        const lookup = textToId(text);
        if (lookup.tag !== "None") {
            // TODO: Warn the user when the names are not unique.
            props.setId(lookup.content);
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

    const labelType = (id: Uuid | null): "named" | "anonymous" | "undefined" => {
        if (id == null) {
            return "undefined";
        }
        const label = idToLabel(id);
        // TODO: Currently punting on labels of length > 1.
        if (label == null || label.length === 0) {
            return "undefined";
        }
        return typeof label[0] === "string" ? "named" : "anonymous";
    };

    return (
        <div class={`id-input ${labelType(props.id)}`}>
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
