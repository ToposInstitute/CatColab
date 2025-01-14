import { type ComponentProps, type JSX, splitProps } from "solid-js";

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
    } & ComponentProps<"input">,
) {
    const [props, inputProps] = splitProps(allProps, ["id", "label"]);

    return (
        <>
            <dt>
                <label for={props.id}>{props.label}</label>
            </dt>
            <dd>
                <input {...inputProps} id={props.id} type="text" />
            </dd>
        </>
    );
}
