import { createSignal } from "solid-js";
import solidLogo from "./assets/solid.svg";
import viteLogo from "/vite.svg";
import "./App.css";

import * as wasm from "../wasm-test/pkg/wasm_test";

function App() {
  const [count, _setCount] = createSignal(0);
  const counter = new wasm.Counter(_setCount);

  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} class="logo" alt="Vite logo" />
        </a>
        <a href="https://solidjs.com" target="_blank">
          <img src={solidLogo} class="logo solid" alt="Solid logo" />
        </a>
      </div>
      <h1>Vite + Solid</h1>
      <div class="card">
        <button onClick={() => counter.incr()}>count is {count()}</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p class="read-the-docs">
        Click on the Vite and Solid logos to learn more
      </p>
    </>
  );
}

export default App;
