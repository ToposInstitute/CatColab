import type { Patch, Prop } from "@automerge/automerge";
import type { DocHandle, DocHandleChangePayload } from "@automerge/automerge-repo";

/** True when `candidate` is a prefix of (or equal to) `target`. */
export function isPathPrefixOf(candidate: Prop[], target: Prop[]): boolean {
    if (candidate.length > target.length) {
        return false;
    }
    for (let i = 0; i < candidate.length; i++) {
        if (candidate[i] !== target[i]) {
            return false;
        }
    }
    return true;
}

/**
 * True when the given patches replace (`put`) or destroy (`del`) the text
 * object at `textPath` or any of its ancestors.
 *
 * `@automerge/prosemirror`'s `gatherPatches` skips these patches, but its
 * `patchesToTr` calls `automerge.spans` unconditionally on `textPath` first,
 * which throws when the path no longer resolves in the post-change doc.
 */
export function hasStructuralReplacement(patches: Patch[], textPath: Prop[]): boolean {
    return patches.some(
        (p) => (p.action === "put" || p.action === "del") && isPathPrefixOf(p.path, textPath),
    );
}

/**
 * Wrap a `DocHandle` so that listeners registered on the `change` event are
 * **not** invoked for patches that structurally replace `getPath()` or any of
 * its ancestors. All other events (and methods) pass through unchanged.
 *
 * This works around an upstream bug in `@automerge/prosemirror`'s syncPlugin
 * (v0.2.0): its `onPatch` listener calls `automerge.spans(view, path)`
 * unconditionally, which throws `RangeError: invalid object id` when an
 * ancestor of `path` has been replaced by the change. By suppressing those
 * specific change events for the syncPlugin's listener, the host's separate
 * listener (registered on the unwrapped handle) can detect the structural
 * replacement and tear down or reinitialize the editor against the new
 * ObjIds.
 */
export function wrapHandleForPath<T>(handle: DocHandle<T>, getPath: () => Prop[]): DocHandle<T> {
    type Listener = (payload: DocHandleChangePayload<T>) => void;
    const wrappedListeners = new WeakMap<Listener, Listener>();

    const wrappedOn = (event: string, listener: (...args: unknown[]) => void): DocHandle<T> => {
        if (event !== "change") {
            (handle.on as (e: string, l: (...args: unknown[]) => void) => void)(event, listener);
            return proxy;
        }
        const original = listener as unknown as Listener;
        const guarded: Listener = (payload) => {
            if (hasStructuralReplacement(payload.patches, getPath())) {
                return;
            }
            original(payload);
        };
        wrappedListeners.set(original, guarded);
        handle.on("change", guarded);
        return proxy;
    };

    const wrappedOff = (event: string, listener: (...args: unknown[]) => void): DocHandle<T> => {
        if (event !== "change") {
            (handle.off as (e: string, l: (...args: unknown[]) => void) => void)(event, listener);
            return proxy;
        }
        const original = listener as unknown as Listener;
        const guarded = wrappedListeners.get(original);
        if (guarded) {
            handle.off("change", guarded);
            wrappedListeners.delete(original);
        } else {
            // Fall through in case the same listener was registered directly.
            handle.off("change", original);
        }
        return proxy;
    };

    const proxy = new Proxy(handle, {
        get(target, prop, receiver) {
            if (prop === "on") {
                return wrappedOn;
            }
            if (prop === "off") {
                return wrappedOff;
            }
            const value = Reflect.get(target, prop, receiver);
            // Bind methods to the original handle so private fields still work.
            if (typeof value === "function") {
                return value.bind(target);
            }
            return value;
        },
    });

    return proxy;
}
