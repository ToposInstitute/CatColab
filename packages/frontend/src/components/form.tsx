import { type ComponentProps, type JSX, Show, createUniqueId, splitProps } from "solid-js";

import "./form.css";

/** Group of related fields in a form. */
export function FormGroup(props: {
    children: JSX.Element;
    compact?: boolean;
}) {
    return <dl class={props.compact ? "compact-form-group" : "form-group"}>{props.children}</dl>;
}

/** Text input field in a form group. */
export function TextInputField(
    allProps: {
        label: string | JSX.Element;
        error?: string;
    } & Omit<ComponentProps<"input">, "id">,
) {
    const fieldId = createUniqueId();

    const [props, inputProps] = splitProps(allProps, ["label", "error"]);

    return (
        <>
            <dt>
                <label for={fieldId}>{props.label}</label>
            </dt>
            <dd>
                <input {...inputProps} id={fieldId} type="text" />
                <InputError error={props.error} />
            </dd>
        </>
    );
}

const InputError = (props: { error?: string }) => (
    <Show when={props.error}>
        <div class="error">{props.error}</div>
    </Show>
);

/** Select field in a form group.

XXX: The props exposed from `select` are limited to a fixed set to work around a
bad bug in Solid, where using a spread breaks the `value` prop:
<https://github.com/solidjs/solid/issues/1754>
 */
export function SelectField(
    allProps: {
        label: string | JSX.Element;
        children?: JSX.Element;
    } & Pick<ComponentProps<"select">, "value" | "disabled" | "onChange" | "onInput">,
) {
    const fieldId = createUniqueId();

    const [props, selectProps] = splitProps(allProps, ["label", "children"]);

    return (
        <>
            <dt>
                <label for={fieldId}>{props.label}</label>
            </dt>
            <dd>
                <select
                    id={fieldId}
                    value={selectProps.value}
                    disabled={selectProps.disabled}
                    onChange={selectProps.onChange}
                    onInput={selectProps.onInput}
                >
                    {props.children}
                </select>
            </dd>
        </>
    );
}
