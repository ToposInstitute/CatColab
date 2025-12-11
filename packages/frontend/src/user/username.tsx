import Plus from "lucide-solid/icons/plus";
import X from "lucide-solid/icons/x";
import { createSignal, onMount, Show } from "solid-js";

import { Button, InputField } from "catcolab-ui-components";

import "./username.css";

/** Name a user by their username and/or display name. */
export const NameUser = (props: { username: string | null; displayName: string | null }) => (
    <div class="name-user">
        <Show when={props.username} fallback="[No username]">
            {(username) => <span class="username">{username()}</span>}
        </Show>
        <Show when={props.displayName}>
            {(displayName) => <span class="display-name">{displayName()}</span>}
        </Show>
    </div>
);

/** Input for adding a user by username with explicit submit. */
export function AddUserInput(props: {
    onSubmit: (username: string) => void;
    onCancel: () => void;
    error: string | undefined;
}) {
    const [username, setUsername] = createSignal("");
    let inputRef: HTMLInputElement | undefined;

    onMount(() => {
        inputRef?.focus();
    });

    const handleSubmit = () => {
        const value = username().trim();
        if (value) {
            props.onSubmit(value);
        }
    };

    const handleKeyDown = (evt: KeyboardEvent) => {
        if (evt.key === "Enter") {
            evt.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div class="add-user-input">
            <div>
                <InputField
                    ref={inputRef}
                    label="User name:"
                    type="text"
                    class="input-user"
                    placeholder=""
                    value={username()}
                    onInput={(evt) => setUsername(evt.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                    error={props.error}
                />
            </div>
            <div class="add-user-input-buttons">
                <Button variant="positive" onClick={handleSubmit}>
                    <Plus size={20} /> Add
                </Button>
                <Button variant="utility" onClick={props.onCancel}>
                    <X size={20} /> Cancel
                </Button>
            </div>
        </div>
    );
}
