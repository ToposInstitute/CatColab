import type { PermissionInfo, UserInfo, UserState } from "catcolab-api/src/user_state";
import { createContext, useContext } from "solid-js";
import invariant from "tiny-invariant";

export const INITIAL_META_DOCUMENT: UserState = {
    profile: { username: null, displayName: null },
    knownUsers: {},
    documents: {},
};

export const MetaDocumentContext = createContext<UserState>(INITIAL_META_DOCUMENT);

/** Retrieve the meta document from application context. */
export function useMetaDocument(): UserState {
    const metaDocument = useContext(MetaDocumentContext);
    invariant(metaDocument, "Meta document should be provided as context");
    return metaDocument;
}

/** Get the display name for a permission entry's user. */
export function permissionUserName(
    p: PermissionInfo,
    currentUserId: string | undefined,
    known_users: { [key in string]?: UserInfo },
): string {
    if (p.user === null) {
        return "anyone";
    }
    if (p.user === currentUserId) {
        return "me";
    }
    const info = known_users[p.user];
    return info?.username ?? info?.displayName ?? "unknown";
}

/** Format a list of owners for display. */
export function formatOwners(
    permissions: Array<PermissionInfo>,
    currentUserId: string | undefined,
    known_users: { [key in string]?: UserInfo },
): string {
    const owners = permissions.filter((p) => p.level === "Own");
    if (owners.length === 0) {
        return "none";
    }
    return owners.map((o) => permissionUserName(o, currentUserId, known_users)).join(", ");
}

/** Get the current user's permission level from the permissions list. */
export function currentUserPermission(
    permissions: Array<PermissionInfo>,
    currentUserId: string | undefined,
): string {
    const userPerm = permissions.find((p) => p.user !== null && p.user === currentUserId);
    if (userPerm) {
        return userPerm.level;
    }
    const publicPerm = permissions.find((p) => p.user === null);
    if (publicPerm) {
        return publicPerm.level;
    }
    return "none";
}
