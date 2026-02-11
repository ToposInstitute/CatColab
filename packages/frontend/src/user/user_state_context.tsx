import { createContext, useContext } from "solid-js";
import invariant from "tiny-invariant";

export type UserState = {
    documents: Array<{
        name: string;
        typeName: string;
        refId: Uint8Array | number[]; // UUID stored as bytes in Automerge
        permissionLevel: string;
        owner: { id: string; username: string | null; displayName: string | null } | null;
        createdAt: number;
    }>;
};

export const INITIAL_USER_STATE: UserState = { documents: [] };

export const UserStateContext = createContext<UserState>(INITIAL_USER_STATE);

/** Retrieve user state from application context. */
export function useUserState(): UserState {
    const userState = useContext(UserStateContext);
    invariant(userState, "User state should be provided as context");
    return userState;
}
