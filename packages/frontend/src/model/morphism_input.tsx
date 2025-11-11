import type { Mor, MorType, QualifiedName } from "catlog-wasm";
import { splitProps, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { type IdInputOptions, MorIdInput } from "../components";
import { LiveModelContext } from "./context";

/** Input a basic morphism via its human-readable name.
 */
export function BasicMorInput(
    allProps: {
        mor: Mor | null;
        setMor: (mor: Mor | null) => void;
        morType?: MorType;
    } & IdInputOptions,
) {
    const [props, otherProps] = splitProps(allProps, ["morType"]);

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const completions = (): QualifiedName[] | undefined =>
        props.morType && liveModel().elaboratedModel()?.morGeneratorsWithType(props.morType);

    return (
        <MorIdInput
            completions={completions()}
            idToLabel={(id) => liveModel().elaboratedModel()?.morGeneratorLabel(id)}
            labelToId={(label) => liveModel().elaboratedModel()?.morGeneratorWithLabel(label)}
            {...otherProps}
        />
    );
}
