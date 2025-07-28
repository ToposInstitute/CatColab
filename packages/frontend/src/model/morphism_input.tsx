import { splitProps, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { Mor, MorType } from "catlaborator";
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

    const completions = (): Mor[] | undefined =>
        props.morType && liveModel().validatedModel()?.model.morphismsWithType(props.morType);

    return (
        <MorIdInput
            completions={completions()}
            idToName={liveModel().morphismIndex()}
            {...otherProps}
        />
    );
}
