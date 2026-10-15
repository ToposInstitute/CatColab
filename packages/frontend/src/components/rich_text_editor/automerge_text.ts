import type { Patch, Prop } from "@automerge/automerge";
import type { DocHandle, DocHandleChangePayload } from "@automerge/automerge-repo";

/** Whether the text field still exists (including an empty string). */
export function hasTextAtPath(doc: unknown, path: Prop[]): boolean {
    let value = doc;
    for (const part of path) {
        if (value === null || typeof value !== "object") {
            return false;
        }
        value = (value as Record<Prop, unknown>)[part];
    }
    return typeof value === "string";
}

/** Detect replacement or deletion of the text field or one of its ancestors. */
export function hasStructuralReplacement(patches: Patch[], textPath: Prop[]): boolean {
    return patches.some(
        (patch) =>
            (patch.action === "put" || patch.action === "del") &&
            patch.path.length <= textPath.length &&
            patch.path.every((part, index) => part === textPath[index]),
    );
}

/**
 * Wraps a document handle to filter change notifications for the ProseMirror
 * binding at the given text path. All other operations use the original handle.
 *
 * The ProseMirror binding only handles edits within an existing text field.
 * CatColab handles structural changes by destroying/recreating the editor.
 * Hide those notifications from the binding, which can otherwise throw
 * while reading spans for a deleted path. Also ignore callbacks already in an
 * emitter's listener snapshot when the editor is destroyed.
 */
export function textSyncHandle(handle: DocHandle<unknown>, path: Prop[]): DocHandle<unknown> {
    type Listener = (payload: DocHandleChangePayload<unknown>) => void;
    const listeners = new Map<Listener, Listener>();
    const on: DocHandle<unknown>["on"] = (event, listener, context) => {
        if (event !== "change") {
            return handle.on(event, listener, context);
        }
        const callback = listener as Listener;
        const guarded: Listener = (payload) => {
            if (
                listeners.get(callback) === guarded &&
                hasTextAtPath(payload.doc, path) &&
                !hasStructuralReplacement(payload.patches, path)
            ) {
                callback.call(context ?? handle, payload);
            }
        };
        listeners.set(callback, guarded);
        return handle.on(event, guarded as typeof listener, context);
    };
    const off: DocHandle<unknown>["off"] = (event, listener, context, once) => {
        if (event !== "change" || !listener) {
            return handle.off(event, listener, context, once);
        }
        const callback = listener as Listener;
        const guarded = listeners.get(callback);
        listeners.delete(callback);
        return handle.off(event, (guarded ?? listener) as typeof listener, context, once);
    };

    return new Proxy(handle, {
        get(target, property) {
            if (property === "on") {
                return on;
            }
            if (property === "off") {
                return off;
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
}
