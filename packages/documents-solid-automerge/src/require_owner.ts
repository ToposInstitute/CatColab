import { getOwner } from "solid-js";

export function requireOwner(): void {
    if (!getOwner()) {
        throw new Error("Document views must be created within a Solid owner.");
    }
}
