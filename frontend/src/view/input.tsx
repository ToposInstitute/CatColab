import { JSX } from "solid-js/jsx-runtime";

import "./input.css";

export const InlineInput = (props: JSX.InputHTMLAttributes<HTMLInputElement>) =>
    <input class="inline-input" type="text" size="1" {...props}>
    </input>
