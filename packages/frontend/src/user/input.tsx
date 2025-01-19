import { type ComponentProps, splitProps } from "solid-js";

import type { UserSummary } from "catcolab-api";
import { useApi } from "../api";

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
            {...inputProps}
            value={props.user?.username ?? ""}
            onChange={(evt) => updateUser(evt.currentTarget.value)}
        />
    );
}
