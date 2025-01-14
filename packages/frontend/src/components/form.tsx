import { type ComponentProps, type JSX, Show, splitProps } from "solid-js";

import "./form.css";

/** Group of related fields in a form. */
export function FormGroup(props: {
    children: JSX.Element;
}) {
    return <dl class="form-group">{props.children}</dl>;
}

/** Text input field in a form group. */
export function TextInputItem(
    allProps: {
        id: string;
        label: string | JSX.Element;
        error?: string;
    } & ComponentProps<"input">,
) {
    const [props, inputProps] = splitProps(allProps, ["id", "label", "error"]);

    return (
        <>
            <dt>
                <label for={props.id}>{props.label}</label>
            </dt>
            <dd>
                <input {...inputProps} id={props.id} type="text" />
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
