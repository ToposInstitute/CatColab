import {
    type JSX,
    Match,
    Switch,
    createEffect,
    createSignal,
    splitProps,
    useContext,
} from "solid-js";
import invariant from "tiny-invariant";
import { P, match } from "ts-pattern";

import {
    type Completion,
    InlineInput,
    type InlineInputErrorStatus,
    type InlineInputOptions,
    StaticInlineInput,
} from "catcolab-ui-components";
import type { DblModel, Mor, QualifiedLabel, Uuid } from "catlog-wasm";
import { UNNAMED } from "../components";
import { LiveModelContext } from "./context";

import "../components/id_input.css";
import idStyles from "../components/id_input.module.css";
import styles from "./path_mor_input.module.css";

/** Optional props for `PathMorInput`. */
export type PathMorInputOptions = {
    /** Basic morphism generators offered as completions. */
    morCompletions?: Uuid[];
    /** Object generators offered as identity morphism completions. */
    obCompletions?: Uuid[];
    /** Whether the current morphism is invalid in context. */
    isInvalid?: boolean;
    /** Called when the displayed text changes. */
    onTextChange?: (text: string) => void;
} & Omit<InlineInputOptions, "completions" | "status">;

/** Input a morphism in a path by its human-readable name.

Unlike the generic `MorIdInput`, this input understands two kinds of morphisms,
both relevant when building a path of composable morphisms:

- basic morphism generators, entered and displayed by name;
- identity morphisms, entered by the name of the object.
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
        "onTextChange",
        "focus",
        "isActive",
        "hasFocused",
        "placeholder",
    ]);

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const model = () => liveModel().elaboratedModel();

    // Display label for a morphism: the name of a basic generator, or of the
    // object of an identity morphism.
    const morLabel = (mor: Mor | null): { text: string; isUnnamed: boolean } => {
        const obId = mor && identityObId(mor);
        if (obId !== null) {
            const name = model()?.obGeneratorLabel(obId)?.join(".");
            return { text: name || UNNAMED, isUnnamed: !name };
        }
        const id = mor && basicMorId(mor);
        if (id !== null) {
            const name = model()?.morGeneratorLabel(id)?.join(".");
            return { text: name || UNNAMED, isUnnamed: !name };
        }
        return { text: "", isUnnamed: false };
    };

    const morToText = (mor: Mor | null): string => morLabel(mor).text;

    const textToMor = (text: string): Mor | null => {
        const currentModel = model();
        return currentModel ? morWithLabel(currentModel, [text.trim()]) : null;
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

    createEffect(() => props.onTextChange?.(text()));

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
        const completion = (mor: Mor): Completion => {
            const label = morLabel(mor);
            return {
                name: label.text,
                nameClass: label.isUnnamed ? idStyles.unnamed : undefined,
                description: mor.tag === "Basic" ? undefined : "Identity",
                onComplete: () => setCompletion(mor),
            };
        };
        const mors = (props.morCompletions ?? []).map(
            (id): Completion => completion({ tag: "Basic", content: id }),
        );
        const identities = (props.obCompletions ?? []).map(
            (obId): Completion => completion(identityMor(obId)),
        );
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

    // Grey out the displayed text when it is the placeholder label for an
    // unnamed generator (but not while the user is typing something else).
    const showsUnnamed = () => isComplete() && morLabel(props.mor).isUnnamed;

    const isActive = () => props.focus?.hasFocus() ?? props.isActive ?? false;

    const activate = (evt: MouseEvent) => {
        props.focus?.setFocused(true);
        props.hasFocused?.();
        evt.preventDefault();
    };

    // Non-editable display of the morphism, shown while the input is inactive.
    const Display = (displayProps: { children: JSX.Element }) => (
        <StaticInlineInput
            class={styles.display}
            status={status()}
            isPlaceholder={text() === ""}
            onMouseDown={activate}
        >
            {displayProps.children}
        </StaticInlineInput>
    );

    return (
        <div class="id-input" classList={{ [idStyles.unnamed]: showsUnnamed() }}>
            <Switch fallback={<Display>{text() || props.placeholder}</Display>}>
                <Match when={isActive()}>
                    <InlineInput
                        text={text()}
                        setText={handleNewText}
                        completions={completions()}
                        status={status()}
                        focus={props.focus}
                        isActive={props.isActive}
                        hasFocused={props.hasFocused}
                        placeholder={props.placeholder}
                        {...inputProps}
                    />
                </Match>
                <Match when={props.mor !== null && isComplete() ? identityObId(props.mor) : null}>
                    {(obId) => (
                        <Display>
                            <span class={styles.identityPrefix}>{"id"}</span>
                            <sub class={styles.subscript}>
                                {model()?.obGeneratorLabel(obId())?.join(".")}
                            </sub>
                        </Display>
                    )}
                </Match>
            </Switch>
        </div>
    );
}

/** Get a morphism for a path item with the given label.

A name can refer to a morphism generator or an object generator, in the latter
case giving the identity morphism on that object. We assume that objects and
morphisms do not share names.
 */
function morWithLabel(model: DblModel, label: QualifiedLabel): Mor | null {
    const morLookup = model.morGeneratorWithLabel(label);
    if (morLookup.tag !== "None") {
        const mor: Mor = { tag: "Basic", content: morLookup.content };
        // FIXME: Objects and morphisms belong to a single namespace, so a
        // lookup by label can return a name of the wrong kind. The kind of the
        // name found is therefore checked against the model. We should probably
        // fix this in `catlog-wasm`.
        if (model.hasMor(mor)) {
            return mor;
        }
    }
    const obLookup = model.obGeneratorWithLabel(label);
    if (obLookup.tag !== "None" && model.hasOb({ tag: "Basic", content: obLookup.content })) {
        return identityMor(obLookup.content);
    }
    return null;
}

/** Extract the object generator of an identity morphism, if any. */
function identityObId(mor: Mor): Uuid | null {
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
function basicMorId(mor: Mor): Uuid | null {
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
