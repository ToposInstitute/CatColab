import type { Doc } from "@automerge/automerge-repo";
import { createContext, useContext } from "solid-js";
import invariant from "tiny-invariant";

export type UserState = {
    documents: Array<{
        name: string;
        typeName: string;
        refId: Uint8Array; // UUID stored as bytes in Automerge
        permissionLevel: string;
        owner: { id: string; username: string | null; displayName: string | null } | null;
        createdAt: number;
    }>;
};

export const INITIAL_USER_STATE = { documents: [] };

export const UserStateContext = createContext<Doc<UserState>>(INITIAL_USER_STATE);

/** Retrieve user state from application context. */
export function useUserState(): Doc<UserState> {
    const userState = useContext(UserStateContext);
    invariant(userState, "User state should be provided as context");
    return userState;
}
