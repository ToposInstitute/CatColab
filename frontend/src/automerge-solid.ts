import { Repo } from "@automerge/automerge-repo";
import { createStore, reconcile } from "solid-js/store";

/** Create Solid-compatible getter/setter for an automerge document.

Internally, a Solid Store is used along with the
[`reconcile`](https://www.solidjs.com/tutorial/stores_immutable) function to
diff the data and thus avoid re-rendering the whole DOM.
 */
export function createDoc<T extends object>(
  repo: Repo,
  init: T,
): [() => T, (f: (d: T) => void) => void] {
  const handle = repo.create(init);
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
