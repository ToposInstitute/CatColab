import { Repo } from "@automerge/automerge-repo";
import { createStore, reconcile } from "solid-js/store";

/** Create Solid-compatible getter/setter for an automerge document.

Interally, a Solid Store is used along with the
[`reconcile`](https://www.solidjs.com/tutorial/stores_immutable) function to
avoid re-rendering the whole DOM by diffing the data.
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
