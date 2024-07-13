import { DocHandle, isValidAutomergeUrl, Repo } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";

import { ModelEditor, NotebookModel } from "./model";
import { newNotebook } from "./notebook";


function App() {
  const init: NotebookModel = {
    name: "Untitled",
    notebook: newNotebook(),
  };

  const repo = new Repo({
    storage: new IndexedDBStorageAdapter("catcolab-demo"),
    network: [new BrowserWebSocketClientAdapter("wss://sync.automerge.org")],
  });

  const handleId = document.location.hash.substring(1);
  let handle: DocHandle<NotebookModel>;
  if (isValidAutomergeUrl(handleId)) {
    handle = repo.find(handleId);
  } else {
    handle = repo.create<NotebookModel>(init);
    document.location.hash = handle.url;
  }

  return (
    <ModelEditor handle={handle} init={init} />
  );
}

export default App;
