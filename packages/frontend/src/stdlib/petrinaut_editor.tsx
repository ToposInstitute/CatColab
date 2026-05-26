import { Petrinaut, createJsonDocHandle } from "@hashintel/petrinaut";
import { createElement } from "react";
import type { Component } from "solid-js";

import type { LiveModelDoc } from "../model/document";
import { ReactIsland } from "../util/react_island";

import "@hashintel/petrinaut/styles.css";
import styles from "./petrinaut_editor.module.css";

/** Editor variant that swaps the entire petri-net model editor for a Petrinaut
embed.

This is currently a pure visual demo: an empty Petrinaut canvas is mounted
inside a React island. No data is exchanged with the surrounding CatColab
model document — switching variants is reversible and lossless because the
CatColab notebook continues to live behind the scenes.

The whole module (and therefore React, ReactDOM, and the Petrinaut bundle)
loads lazily; it is registered through `lazy(() => import(...))` in the
petri-net theory.
 */
const PetrinautEditor: Component<{ liveModel: LiveModelDoc }> = (_props) => {
    return (
        <div class={styles.container}>
            <ReactIsland class={styles.island} render={renderPetrinaut} />
        </div>
    );
};

function renderPetrinaut() {
    const handle = createJsonDocHandle({
        initial: {
            places: [],
            transitions: [],
            types: [],
            differentialEquations: [],
            parameters: [],
        },
    });

    // Use `createElement` because this file is compiled with the Solid JSX
    // runtime; constructing the React tree by hand avoids per-file JSX
    // pragma gymnastics.
    return createElement(Petrinaut, {
        handle,
        title: "Petrinaut (preview)",
        hideNetManagementControls: true,
    });
}

export default PetrinautEditor;
