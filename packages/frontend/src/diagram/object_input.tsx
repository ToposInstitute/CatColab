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
            idToLabel={(id) => liveDiagram().elaboratedDiagram()?.obGeneratorLabel(id)}
            labelToId={(label) => liveDiagram().elaboratedDiagram()?.obGeneratorWithLabel(label)}
            {...props}
        />
    );
}
