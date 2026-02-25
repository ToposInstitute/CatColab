import type { PermissionInfo, UserState } from "catcolab-api/src/user_state";
import { createContext, useContext } from "solid-js";
import invariant from "tiny-invariant";

export const INITIAL_USER_STATE: UserState = { documents: {} };

export const UserStateContext = createContext<UserState>(INITIAL_USER_STATE);

/** Retrieve user state from application context. */
export function useUserState(): UserState {
    const userState = useContext(UserStateContext);
    invariant(userState, "User state should be provided as context");
    return userState;
}

/** Get the display name for a permission entry's user. */
export function permissionUserName(p: PermissionInfo, currentUserId: string | undefined): string {
    if (p.user === null) {
        return "anyone";
    }
    if (p.user.id === currentUserId) {
        return "me";
    }
    return p.user.username ?? p.user.displayName ?? "unknown";
}

/** Format a list of owners for display. */
export function formatOwners(
    permissions: Array<PermissionInfo>,
    currentUserId: string | undefined,
): string {
    const owners = permissions.filter((p) => p.level === "Own");
    if (owners.length === 0) {
        return "none";
    }
    return owners.map((o) => permissionUserName(o, currentUserId)).join(", ");
}

/** Get the current user's permission level from the permissions list. */
export function currentUserPermission(
    permissions: Array<PermissionInfo>,
    currentUserId: string | undefined,
): string {
    const userPerm = permissions.find((p) => p.user !== null && p.user.id === currentUserId);
    if (userPerm) {
        return userPerm.level;
    }
    const publicPerm = permissions.find((p) => p.user === null);
    if (publicPerm) {
        return publicPerm.level;
    }
    return "none";
}
