import { createEffect, createSignal, splitProps, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { P, match } from "ts-pattern";

import {
    type Completion,
    InlineInput,
    type InlineInputErrorStatus,
    type InlineInputOptions,
} from "catcolab-ui-components";
import type { LabelSegment, Mor, QualifiedLabel, Uuid } from "catlog-wasm";
import { LiveModelContext } from "./context";

import "../components/id_input.css";

/** Text wrapping the object name of an identity morphism, e.g. `id(X)`. */
const ID_PREFIX = "id(";
const ID_SUFFIX = ")";

/** Optional props for `PathMorInput`. */
export type PathMorInputOptions = {
    /** Basic morphism generators offered as completions. */
    morCompletions?: Uuid[];
    /** Object generators offered as `id(...)` completions. */
    obCompletions?: Uuid[];
    /** Whether the current morphism is invalid in context. */
    isInvalid?: boolean;
} & Omit<InlineInputOptions, "completions" | "status">;

/** Input a morphism in a path by its human-readable name.

Unlike the generic `MorIdInput`, this input understands two kinds of morphisms,
both relevant when building a path of composable morphisms:

- basic morphism generators, entered and displayed by name;
- identity morphisms, entered and displayed as `id(<object name>)`.

Label lookups are read from the live model in context; the caller supplies the
(usually domain-filtered) sets of generators to offer as completions.
 */
export function PathMorInput(
    allProps: {
        mor: Mor | null;
        setMor: (mor: Mor | null) => void;
    } & PathMorInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, [
        "mor",
        "setMor",
        "morCompletions",
        "obCompletions",
        "isInvalid",
    ]);

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const model = () => liveModel().elaboratedModel();

    // Display text for a morphism: a basic generator's name, or `id(<object>)`
    // for an identity morphism.
    const morToText = (mor: Mor | null): string => {
        if (mor === null) {
            return "";
        }
        const obId = identityOb(mor);
        if (obId !== null) {
            const name = labelText(model()?.obGeneratorLabel(obId)) || "?";
            return `${ID_PREFIX}${name}${ID_SUFFIX}`;
        }
        const id = basicMor(mor);
        if (id !== null) {
            return labelText(model()?.morGeneratorLabel(id));
        }
        return "";
    };

    // Resolve display text to a morphism, or `null` if it doesn't name one.
    const textToMor = (text: string): Mor | null => {
        const obName = parseIdentityName(text);
        if (obName !== null) {
            const lookup = model()?.obGeneratorWithLabel([parseSegment(obName)]);
            return lookup && lookup.tag !== "None" ? identityMor(lookup.content) : null;
        }
        const lookup = model()?.morGeneratorWithLabel([parseSegment(text.trim())]);
        return lookup && lookup.tag !== "None" ? { tag: "Basic", content: lookup.content } : null;
    };

    const [text, setText] = createSignal("");

    createEffect(() => setText(morToText(props.mor)));

    // Re-resolve the text against the model when it changes (e.g. a referenced
    // generator gains a name), but only while the value is still incomplete.
    createEffect(() => {
        const currentText = text();
        if (currentText !== "" && !isComplete()) {
            const mor = textToMor(currentText);
            if (mor !== null) {
                props.setMor(mor);
            }
        }
    });

    const handleNewText = (newText: string) => {
        const mor = textToMor(newText);
        if (mor !== null) {
            props.setMor(mor);
        } else if (newText === "") {
            // Avoid erasing partially-entered text: only clear the value when
            // the text is empty too.
            props.setMor(null);
        }
        setText(newText);
    };

    const setCompletion = (mor: Mor) => {
        props.setMor(mor);
        setText(morToText(mor));
    };

    const completions = (): Completion[] | undefined => {
        if (props.morCompletions === undefined && props.obCompletions === undefined) {
            return undefined;
        }
        const mors = (props.morCompletions ?? []).map((id): Completion => {
            const mor: Mor = { tag: "Basic", content: id };
            return { name: morToText(mor), onComplete: () => setCompletion(mor) };
        });
        const identities = (props.obCompletions ?? []).map((obId): Completion => {
            const mor = identityMor(obId);
            return { name: morToText(mor), onComplete: () => setCompletion(mor) };
        });
        return [...mors, ...identities];
    };

    const isComplete = () => text() === morToText(props.mor);

    const status = (): InlineInputErrorStatus => {
        if (!isComplete()) {
            return "incomplete";
        }
        if (props.isInvalid) {
            return "invalid";
        }
        return null;
    };

    return (
        <div class="id-input">
            <InlineInput
                text={text()}
                setText={handleNewText}
                completions={completions()}
                status={status()}
                {...inputProps}
            />
        </div>
    );
}

/** Render a qualified label as dotted display text. */
function labelText(label: QualifiedLabel | undefined): string {
    return label && label.length > 0 ? label.join(".") : "";
}

/** Parse a single label segment, treating all-digit text as an anonymous index. */
function parseSegment(text: string): LabelSegment {
    return /^\d+$/.test(text) ? Number.parseInt(text, 10) : text;
}

/** Extract the object generator of an identity morphism, if any. */
function identityOb(mor: Mor): Uuid | null {
    return match(mor)
        .with(
            {
                tag: "Composite",
                content: { tag: "Id", content: { tag: "Basic", content: P.select() } },
            },
            (id) => id,
        )
        .otherwise(() => null);
}

/** Extract the generator of a basic morphism, if any. */
function basicMor(mor: Mor): Uuid | null {
    return match(mor)
        .with({ tag: "Basic", content: P.select() }, (id) => id)
        .otherwise(() => null);
}

/** Build an identity morphism on a basic object generator. */
function identityMor(obId: Uuid): Mor {
    return {
        tag: "Composite",
        content: { tag: "Id", content: { tag: "Basic", content: obId } },
    };
}

/** Parse the object name out of `id(<name>)` text, if it matches. */
function parseIdentityName(text: string): string | null {
    const trimmed = text.trim();
    if (trimmed.startsWith(ID_PREFIX) && trimmed.endsWith(ID_SUFFIX)) {
        return trimmed.slice(ID_PREFIX.length, trimmed.length - ID_SUFFIX.length).trim();
    }
    return null;
}
