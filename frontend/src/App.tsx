import { DocHandle, isValidAutomergeUrl, Repo } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { createShortcut } from "@solid-primitives/keyboard";

import { useAutomergeDoc } from "./util/automerge_solid";
import { newFormalCell, Notebook } from "./model/notebook";
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

  const [notebook, modifyNotebook] = useAutomergeDoc(() => handle, init);

  let editorRef!: NotebookEditorRef<ModelJudgment>;

  createShortcut(
    ["Alt", "0"],
    () => editorRef.pushCell(newFormalCell(newObjectDecl("default"))),
  );
  createShortcut(
    ["Alt", "1"],
    () => editorRef.pushCell(newFormalCell(newMorphismDecl("default"))),
  );

  return (
    <ModelEditor notebook={notebook()} modifyNotebook={modifyNotebook}
        ref={(ref) => {editorRef = ref;}} />
  );
}

export default App;
