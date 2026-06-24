import { createEffect, createSignal, splitProps } from "solid-js";
import { match, P } from "ts-pattern";

import {
    type Completion,
    InlineInput,
    type InlineInputErrorStatus,
    type InlineInputOptions,
    PlaceholderInlineInput,
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
    /** Called when the displayed text changes. */
    onTextChange?: (text: string) => void;
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
        "onTextChange",
    ]);

    const idToLabel = (id: QualifiedName): QualifiedLabel | undefined => props.idToLabel?.(id);
    const idToText = (id: QualifiedName): string | undefined => idToLabel(id)?.join(".");

    const textToId = (text: string): NameLookup => {
        let label: LabelSegment = text;
        if (/^\d+$/.test(text)) {
            label = Number.parseInt(text, 10);
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

    // Re-check if we can match an id when the elaborated model changes
    createEffect(() => {
        const currentText = text();
        if (currentText !== "" && !isComplete()) {
            const lookup = textToId(currentText);
            if (lookup.tag !== "None") {
                props.setId(lookup.content);
            }
        }
    });

    createEffect(() => props.onTextChange?.(text()));

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

/** Options specific to inputting object generators, e.g. for identity morphisms. */
export type MorIdInputObjectOptions = {
    /** Map an object generator id to its human-readable label. */
    obIdToLabel?: (id: QualifiedName) => QualifiedLabel | undefined;
    /** Look up an object generator by its human-readable label. */
    obLabelToId?: (label: QualifiedLabel) => NameLookup | undefined;
    /** Object generators offered as `id(...)` completions. */
    obCompletions?: Uuid[];
};

const ID_PREFIX = "id(";
const ID_SUFFIX = ")";

/** Extract the object generator of an identity morphism, if any. */
function identityOb(mor: Mor | null): Uuid | null {
    return match(mor)
        .with(
            {
                tag: "Composite",
                content: {
                    tag: "Id",
                    content: { tag: "Basic", content: P.select() },
                },
            },
            (id) => id,
        )
        .otherwise(() => null);
}

/** Build an identity morphism on a basic object generator. */
function identityMor(obId: Uuid): Mor {
    return {
        tag: "Composite",
        content: {
            tag: "Id",
            content: { tag: "Basic", content: obId },
        },
    };
}

/** Parse the object label out of `id(<label>)` text, if it matches. */
function parseIdentityLabel(text: string): string | null {
    const trimmed = text.trim();
    if (trimmed.startsWith(ID_PREFIX) && trimmed.endsWith(ID_SUFFIX)) {
        return trimmed.slice(ID_PREFIX.length, trimmed.length - ID_SUFFIX.length).trim();
    }
    return null;
}

/** Input a morphism by specifying its human-readable name.

Supports basic morphism generators, entered by name, as well as identity
morphisms, entered as `id(<object name>)` and displayed the same way.
 */
export function MorIdInput(
    allProps: {
        mor: Mor | null;
        setMor: (mor: Mor | null) => void;
    } & IdInputOptions &
        MorIdInputObjectOptions,
) {
    const [props, idProps, inputProps] = splitProps(
        allProps,
        ["mor", "setMor"],
        ["obIdToLabel", "obLabelToId", "obCompletions", "idToLabel", "labelToId", "completions"],
    );

    const basicId = (mor: Mor | null): Uuid | null =>
        match(mor)
            .with(
                {
                    tag: "Basic",
                    content: P.select(),
                },
                (id) => id,
            )
            .otherwise(() => null);

    // Render an identity morphism on `obId` as `id(<object label>)`.
    const obIdToText = (obId: Uuid): string => {
        const label = idProps.obIdToLabel?.(obId);
        const text = label && label.length > 0 ? label.join(".") : "?";
        return `${ID_PREFIX}${text}${ID_SUFFIX}`;
    };

    // The "id" managed by the underlying `IdInput` is the morphism's basic
    // generator id, with identity morphisms encoded as a synthetic key.
    const idToLabel = (id: QualifiedName): QualifiedLabel | undefined => {
        const obId = identityObFromKey(id);
        if (obId !== null) {
            return [obIdToText(obId)];
        }
        return idProps.idToLabel?.(id);
    };

    const labelToId = (label: QualifiedLabel): NameLookup | undefined => {
        const text = label.length === 1 && typeof label[0] === "string" ? label[0] : null;
        const obLabelText = text !== null ? parseIdentityLabel(text) : null;
        if (obLabelText !== null) {
            const obLabel: LabelSegment = /^\d+$/.test(obLabelText)
                ? Number.parseInt(obLabelText, 10)
                : obLabelText;
            const lookup = idProps.obLabelToId?.([obLabel]);
            if (lookup && lookup.tag !== "None") {
                return { ...lookup, content: identityKey(lookup.content) };
            }
            return { tag: "None" };
        }
        return idProps.labelToId?.(label);
    };

    const completions = (): Uuid[] | undefined => {
        const basic = idProps.completions ?? [];
        const identities = (idProps.obCompletions ?? []).map((obId) => identityKey(obId));
        if (idProps.completions === undefined && idProps.obCompletions === undefined) {
            return undefined;
        }
        return [...basic, ...identities];
    };

    const id = (): Uuid | null => {
        const obId = identityOb(props.mor);
        if (obId !== null) {
            return identityKey(obId);
        }
        return basicId(props.mor);
    };

    const setId = (id: Uuid | null) => {
        if (id === null) {
            props.setMor(null);
            return;
        }
        const obId = identityObFromKey(id);
        if (obId !== null) {
            props.setMor(identityMor(obId));
            return;
        }
        props.setMor({ tag: "Basic", content: id });
    };

    return (
        <IdInput
            id={id()}
            setId={setId}
            idToLabel={idToLabel}
            labelToId={labelToId}
            completions={completions()}
            {...inputProps}
        />
    );
}

// Encode an identity morphism on object generator `obId` as an opaque key,
// distinguishable from a basic morphism generator id.
const IDENTITY_KEY_PREFIX = "\u0000id\u0000";

function identityKey(obId: Uuid): Uuid {
    return `${IDENTITY_KEY_PREFIX}${obId}`;
}

function identityObFromKey(key: Uuid): Uuid | null {
    return key.startsWith(IDENTITY_KEY_PREFIX) ? key.slice(IDENTITY_KEY_PREFIX.length) : null;
}

/** A non-editable placeholder shaped like an `IdInput`.

Use this where an `IdInput` would normally appear but the input cannot yet be
edited (e.g. because a related id is unset). The placeholder occupies the same
space and aligns on the same baseline as a real `IdInput`.
 */
export const IdInputPlaceholder = (props: { placeholder?: string }) => (
    <div class="id-input">
        <PlaceholderInlineInput placeholder={props.placeholder ?? "..."} />
    </div>
);
