import { Repo } from "@automerge/automerge-repo";
import { createDoc } from "./automerge-solid";
import { Notebook } from "./model/notebook";
import { ModelJudgment } from "./model/model_judgments";
import { ModelEditor } from "./view/model_editor";

import './App.css';

function App() {
  const repo = new Repo({});
  const [notebook, modifyNotebook] = createDoc<Notebook<ModelJudgment>>(repo, {
    name: "Untitled",
    cells: [],
  });

  return (
    <div>
      <ModelEditor notebook={notebook()} modifyNotebook={modifyNotebook} />
    </div>
  );
}

export default App;
