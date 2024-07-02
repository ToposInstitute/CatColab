import { Repo } from "@automerge/automerge-repo";
import { createDoc } from "./automerge-solid";
import { createShortcut } from "@solid-primitives/keyboard";

import { newFormalCell, Notebook } from "./model/notebook";
import { ModelJudgment, newObjectDecl } from "./model/model_judgments";
import { ModelEditor } from "./view/model_editor";

import './App.css';


function App() {
  const repo = new Repo({});
  const [notebook, modifyNotebook] = createDoc<Notebook<ModelJudgment>>(repo, {
    name: "Untitled",
    cells: [],
  });

  createShortcut(
    ["Alt", "0"],
    () => {
      modifyNotebook((nb) => {
        nb.cells.push(newFormalCell(newObjectDecl("default")));
      });
    }
  );

  return (
    <div>
      <ModelEditor notebook={notebook()} modifyNotebook={modifyNotebook} />
    </div>
  );
}

export default App;
