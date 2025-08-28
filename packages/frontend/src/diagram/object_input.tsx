import { useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { Ob, ObType, QualifiedName } from "catlog-wasm";
import { type IdInputOptions, ObIdInput } from "../components";
import { LiveDiagramContext } from "./context";

/** Input a basic object in a diagram via its human-readable name.
 */
export function BasicObInput(
    props: {
        ob: Ob | null;
        setOb: (ob: Ob | null) => void;
        obType?: ObType;
    } & IdInputOptions,
) {
    const liveDiagram = useContext(LiveDiagramContext);
    invariant(liveDiagram, "Live diagram should be provided as context");

    const completions = (): QualifiedName[] | undefined =>
        props.obType && liveDiagram().elaboratedDiagram()?.obGeneratorsWithType(props.obType);

    // FIXME: Push diagram labels into Wasm layer.
    return (
        <ObIdInput
            completions={completions()}
            idToLabel={(id) => {
                const segment = liveDiagram().objectIndex().map.get(id);
                return segment ? [segment] : undefined;
            }}
            labelToId={(label) => {
                const segment = label[0];
                let id = undefined;
                if (segment) {
                    id = liveDiagram().objectIndex().index.get(segment)?.[0];
                }
                return id ? { tag: "Unique", content: id } : { tag: "None" };
            }}
            {...props}
        />
    );
}
