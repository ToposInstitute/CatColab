import { splitProps, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { P, match } from "ts-pattern";

import type { Mor, MorType, Uuid } from "catlog-wasm";
import { IdInput, type IdInputOptions } from "../components";
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
    const [props, inputProps] = splitProps(allProps, ["mor", "setMor", "morType"]);

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const completions = (): Uuid[] | undefined => {
        const result = liveModel.validationResult();
        if (!(props.morType && result)) {
            return undefined;
        }
        return result.model
            .morphismsWithType(props.morType)
            .map(getId)
            .filter((id) => id !== null);
    };

    const getId = (mor: Mor | null): Uuid | null =>
        match(mor)
            .with(
                {
                    tag: "Basic",
                    content: P.select(),
                },
                (id) => id,
            )
            .otherwise(() => null);

    const id = (): Uuid | null => getId(props.mor);

    const setId = (id: Uuid | null) => {
        props.setMor(
            id === null
                ? null
                : {
                      tag: "Basic",
                      content: id,
                  },
        );
    };

    return (
        <IdInput
            id={id()}
            setId={setId}
            nameMap={liveModel.morphismIndex()}
            completions={completions()}
            {...inputProps}
        />
    );
}
