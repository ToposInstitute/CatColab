import { Doc, Repo } from "@automerge/automerge-repo";
import { createSignal } from "solid-js";

/** Create Solid-compatible getter/setter for an automerge document.

Loosely inspired by the automerge-React integration in `automerge-repo`.
 */
export function createDoc<T>(
  repo: Repo,
  init: T,
): [() => Doc<T>, (f: (d: T) => void) => void] {
  const handle = repo.create(init);

  const [generation, setGeneration] = createSignal(0);

  function get(): Doc<T> {
    generation();
    return handle.docSync() as Doc<T>;
  }

  async function set(f: (d: T) => void): Promise<void> {
    return handle.change(f);
  }

  handle.on("change", (_) => {
    setGeneration(generation() + 1);
  });

  return [get, set];
}
