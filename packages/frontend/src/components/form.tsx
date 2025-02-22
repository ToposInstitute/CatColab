import { type ComponentProps, type JSX, Show, createUniqueId, splitProps } from "solid-js";

import "./form.css";

/** Group of related fields in a form. */
export function FormGroup(props: {
    children: JSX.Element;
    compact?: boolean;
}) {
    return <dl class={props.compact ? "compact-form-group" : "form-group"}>{props.children}</dl>;
}

type InputFieldProps = {
    label: string | JSX.Element;
    error?: string;
};

/** Input field in a form group. */
export function InputField(allProps: InputFieldProps & Omit<ComponentProps<"input">, "id">) {
    const fieldId = createUniqueId();

    const [props, inputProps] = splitProps(allProps, ["label", "error"]);

    return (
        <>
            <dt>
                <label for={fieldId}>{props.label}</label>
            </dt>
            <dd>
                <input {...inputProps} id={fieldId} />
                <InputError error={props.error} />
            </dd>
        </>
    );
}

/** Text input field in a form group. */
export function TextInputField(
    props: InputFieldProps & Omit<ComponentProps<"input">, "id" | "type">,
) {
    return <InputField type="text" {...props} />;
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

/** Text area field in a form group. */
export function TextAreaField(
    allProps: {
        label: string | JSX.Element;
    } & Omit<ComponentProps<"textarea">, "id">,
) {
    const fieldId = createUniqueId();

    const [props, textProps] = splitProps(allProps, ["label"]);

    return (
        <>
            <dt>
                <label for={fieldId}>{props.label}</label>
            </dt>
            <dd>
                <textarea id={fieldId} {...textProps} />
            </dd>
        </>
    );
}
