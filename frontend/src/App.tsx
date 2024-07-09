import { DocHandle, isValidAutomergeUrl, Repo } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { createShortcut } from "@solid-primitives/keyboard";

import { newFormalCell, newRichTextCell, Notebook } from "./model/notebook";
import { ModelJudgment, newMorphismDecl, newObjectDecl } from "./model/model_judgments";
import { NotebookEditorRef } from "./view/notebook_editor";
import { ModelEditor } from "./view/model_editor";


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

  let notebookRef!: NotebookEditorRef<ModelJudgment>;

  // On Mac, the Alt/Option key remaps keys, whereas on other platforms Control
  // tends to be already bound in other shortcuts.
  const modifier = navigator.userAgent.includes("Mac") ? "Control" : "Alt";
  createShortcut(
    [modifier, "T"],
    () => notebookRef.pushCell(newRichTextCell()),
  );
  createShortcut(
    [modifier, "0"],
    () => notebookRef.pushCell(newFormalCell(newObjectDecl("default"))),
  );
  createShortcut(
    [modifier, "1"],
    () => notebookRef.pushCell(newFormalCell(newMorphismDecl("default"))),
  );

  return (
    <ModelEditor handle={handle} init={init}
        ref={(ref) => {notebookRef = ref;}} />
  );
}

export default App;
