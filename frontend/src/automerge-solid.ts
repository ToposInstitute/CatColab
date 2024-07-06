import { DocHandle } from "@automerge/automerge-repo";
import { createStore, reconcile } from "solid-js/store";

/** Create Solid-compatible getter/setter from an Automerge document handle.

Internally, a Solid Store is used along with the
[`reconcile`](https://www.solidjs.com/tutorial/stores_immutable) function to
diff the data and thus avoid re-rendering the whole DOM.
 */
export function createDoc<T extends object>(
  handle: DocHandle<T>,
  init: T,
): [() => T, (f: (d: T) => void) => void] {
  const [store, setStore] = createStore<T>(init);

  const get = () => store;

  async function set(f: (d: T) => void): Promise<void> {
    return handle.change(f);
  }

  handle.on("change", (payload) => {
    setStore(reconcile(payload.doc));
  });

  return [get, set];
}
