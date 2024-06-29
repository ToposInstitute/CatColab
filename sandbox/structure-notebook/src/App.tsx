import { createSignal, For } from "solid-js";
import { createDoc } from "./automerge-solid";
import { Notebook } from "./notebook";
import {
  EdgeCell,
  GraphCell,
  newEdgeCell,
  newVertexCell,
  VertexCell,
} from "./graphcell";
import { Repo } from "@automerge/automerge-repo";
import { newCell } from "./cell";

function VertexCellEditor(props: {
  cell: VertexCell;
  modifyCell: (f: (c: VertexCell) => void) => void;
  delete: () => void;
}) {
  return (
    <div>
      <div>Vertex</div>
      <div>
        <span>Name: </span>
        <input
          type="text"
          onChange={(ev) => props.modifyCell((c) => (c.name = ev.target.value))}
          value={props.cell.name}
        ></input>
        <button onClick={props.delete}>Delete Me</button>
      </div>
    </div>
  );
}

function EdgeCellEditor(props: {
  cell: EdgeCell;
  modifyCell: (f: (c: EdgeCell) => void) => void;
  delete: () => void;
}) {
  return (
    <div>
      <div>Edge</div>
      <div>
        <span>Name: </span>
        <input
          type="text"
          onChange={(ev) => props.modifyCell((c) => (c.name = ev.target.value))}
          value={props.cell.name}
        ></input>
        <button onClick={props.delete}>Delete Me</button>
      </div>
      <div>
        <div>
          <span>Source: </span>
          <input type="text" />
        </div>
        <div>
          <span>Target: </span>
          <input type="text" />
        </div>
      </div>
    </div>
  );
}

function NotebookEditor(props: {
  notebook: () => Doc<Notebook<GraphCell>>;
  modifyNotebook: (f: (d: Notebook<GraphCell>) => void) => void;
}) {
  return (
    <div>
      <h1>{props.notebook().name}</h1>
      <ul>
        <For each={props.notebook().cells}>
          {(cell, i) => {
            if (cell.content.tag == "vertex") {
              return (
                <VertexCellEditor
                  cell={cell.content}
                  modifyCell={(f) => {
                    props.modifyNotebook((d) => {
                      f(d.cells[i()].content as VertexCell);
                    });
                  }}
                  delete={() => {
                    props.modifyNotebook((d) => {
                      d.cells.splice(i(), 1);
                    });
                  }}
                />
              );
            } else if (cell.content.tag == "edge") {
              return (
                <EdgeCellEditor
                  cell={cell.content}
                  modifyCell={(f) => {
                    props.modifyNotebook((d) => {
                      f(d.cells[i()].content as EdgeCell);
                    });
                  }}
                  delete={() => {
                    props.modifyNotebook((d) => {
                      d.cells.splice(i(), 1);
                    });
                  }}
                />
              );
            }
          }}
        </For>
      </ul>
      <button
        onClick={(_ev) => {
          props.modifyNotebook((d) => {
            d.cells.push(newCell(newVertexCell()));
          });
        }}
      >
        Add vertex cell
      </button>
      <button
        onClick={(_ev) => {
          props.modifyNotebook((d) => {
            d.cells.push(newCell(newEdgeCell()));
          });
        }}
      >
        Add edge cell
      </button>
    </div>
  );
}

function App() {
  const repo = new Repo({});
  const [notebook, modifyNotebook] = createDoc<Notebook<GraphCell>>(repo, {
    name: "My First Notebook",
    cells: [],
  });

  return (
    <div>
      <NotebookEditor notebook={notebook} modifyNotebook={modifyNotebook} />
      <NotebookEditor notebook={notebook} modifyNotebook={modifyNotebook} />
    </div>
  );
}

export default App;
