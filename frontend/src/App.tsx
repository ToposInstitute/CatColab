import { Repo } from "@automerge/automerge-repo";
import { createDoc } from "./automerge-solid";
import { createShortcut } from "@solid-primitives/keyboard";

import { newFormalCell, Notebook } from "./model/notebook";
import { ModelJudgment, newMorphismDecl, newObjectDecl } from "./model/model_judgments";
import { NotebookEditorRef } from "./view/notebook_editor";
import { ModelEditor } from "./view/model_editor";

import './App.css';


function App() {
  const repo = new Repo({});
  const [notebook, modifyNotebook] = createDoc<Notebook<ModelJudgment>>(repo, {
    name: "Untitled",
    cells: [],
  });

  let nbRef!: NotebookEditorRef<ModelJudgment>;

  createShortcut(
    ["Alt", "0"],
    () => nbRef.pushCell(newFormalCell(newObjectDecl("default"))),
  );
  createShortcut(
    ["Alt", "1"],
    () => nbRef.pushCell(newFormalCell(newMorphismDecl("default"))),
  );

  return (
    <div>
      <ModelEditor notebook={notebook()} modifyNotebook={modifyNotebook}
        ref={(ref) => {nbRef = ref;}} />
      <br/>
      <ModelEditor notebook={notebook()} modifyNotebook={modifyNotebook} />
    </div>
  );
}

export default App;
