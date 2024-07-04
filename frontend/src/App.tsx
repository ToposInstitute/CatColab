import { Repo } from "@automerge/automerge-repo";
import { createDoc } from "./automerge-solid";
import { createShortcut } from "@solid-primitives/keyboard";

import { Cell, newFormalCell, Notebook } from "./model/notebook";
import { ModelJudgment, newMorphismDecl, newObjectDecl } from "./model/model_judgments";
import { ModelEditor } from "./view/model_editor";

import './App.css';


function App() {
  const repo = new Repo({});
  const [notebook, modifyNotebook] = createDoc<Notebook<ModelJudgment>>(repo, {
    name: "Untitled",
    cells: [],
  });

  const pushCell = (cell: Cell<ModelJudgment>) =>
    modifyNotebook((nb) => {
      nb.cells.push(cell);
    });

  createShortcut(
    ["Alt", "0"],
    () => pushCell(newFormalCell(newObjectDecl("default"))),
  );
  createShortcut(
    ["Alt", "1"],
    () => pushCell(newFormalCell(newMorphismDecl("default"))),
  );

  return (
    <div>
      <ModelEditor notebook={notebook()} modifyNotebook={modifyNotebook} />
      <br/>
      <ModelEditor notebook={notebook()} modifyNotebook={modifyNotebook} />
    </div>
  );
}

export default App;
