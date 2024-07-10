import { DocHandle, isValidAutomergeUrl, Repo } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";

import { Notebook } from "./notebook";
import { ModelEditor, ModelJudgment } from "./model";


function App() {
  const init: Notebook<ModelJudgment> = {
    name: "Untitled",
    cells: [],
  };

  const repo = new Repo({
    storage: new IndexedDBStorageAdapter("catcolab-demo"),
    network: [new BrowserWebSocketClientAdapter("wss://sync.automerge.org")],
  });

  const handleId = document.location.hash.substring(1);
  let handle: DocHandle<Notebook<ModelJudgment>>;
  if (isValidAutomergeUrl(handleId)) {
    handle = repo.find(handleId);
  } else {
    handle = repo.create<Notebook<ModelJudgment>>(init);
    document.location.hash = handle.url;
  }

  return (
    <ModelEditor handle={handle} init={init} />
  );
}

export default App;
