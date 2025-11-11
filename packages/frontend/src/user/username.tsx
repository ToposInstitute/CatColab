import type { UserSummary } from "catcolab-api";
import { type ComponentProps, Show, splitProps } from "solid-js";
import { useApi } from "../api";

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

/** Input a user by specifying their username. */
export function UserInput(
    allProps: {
        user?: UserSummary;
        setUser: (user: UserSummary) => void;
    } & ComponentProps<"input">,
) {
    const [props, inputProps] = splitProps(allProps, ["user", "setUser"]);

    const api = useApi();

    const updateUser = async (username: string) => {
        const result = await api.rpc.user_by_username.query(username);
        if (result.tag === "Ok" && result.content != null) {
            props.setUser(result.content);
        }
    };

    return (
        <input
            type="text"
            class="input-user"
            {...inputProps}
            value={props.user?.username ?? ""}
            onChange={(evt) => updateUser(evt.currentTarget.value)}
        />
    );
}
