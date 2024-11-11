import { splitProps, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";
import { P, match } from "ts-pattern";

import type { Ob, ObType, Uuid } from "catlog-wasm";
import { IdInput, type IdInputOptions } from "../components";
import { LiveModelContext } from "./context";

type ObInputProps = {
    ob: Ob | null;
    setOb: (ob: Ob | null) => void;
    obType?: ObType;
};

/** Input an object that already exists in a model.
 */
export function ObInput(allProps: ObInputProps & IdInputOptions) {
    const [props, otherProps] = splitProps(allProps, ["obType"]);

    return (
        <Dynamic
            component={props.obType ? object_input_components[props.obType.tag] : () => <></>}
            obType={props.obType}
            {...otherProps}
        />
    );
}

/** Input a basic object via its human-readable name.
 */
function BasicObInput(allProps: ObInputProps & IdInputOptions) {
    const [props, inputProps] = splitProps(allProps, ["ob", "setOb", "obType"]);

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const completions = (): Uuid[] => {
        const result = liveModel.validationResult();
        return props.obType && result && result.tag !== "notsupported"
            ? result.model
                  .objectsWithType(props.obType)
                  .map(getId)
                  .filter((id) => id !== null)
            : [];
    };

    const getId = (ob: Ob | null): string | null =>
        match(ob)
            .with(
                {
                    tag: "Basic",
                    content: P.select(),
                },
                (id) => id,
            )
            .otherwise(() => null);

    const id = (): string | null => getId(props.ob);

    const setId = (id: string | null) => {
        props.setOb(
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
            nameMap={liveModel.objectIndex()}
            completions={completions()}
            {...inputProps}
        />
    );
}

/** Input an object that is a tabulated morphism.

TODO: Assumes that the morphism is basic and thus will be input by its
human-readable name. However, there is no such restriction on tabulators.
 */
function TabulatedMorInput(allProps: ObInputProps & IdInputOptions) {
    const [props, inputProps] = splitProps(allProps, ["ob", "setOb", "obType"]);

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const id = (): string | null =>
        match(props.ob)
            .with(
                {
                    tag: "Tabulated",
                    content: {
                        tag: "Basic",
                        content: P.select(),
                    },
                },
                (id) => id,
            )
            .otherwise(() => null);

    const setId = (id: string | null) => {
        props.setOb(
            id === null
                ? null
                : {
                      tag: "Tabulated",
                      content: {
                          tag: "Basic",
                          content: id,
                      },
                  },
        );
    };

    return <IdInput id={id()} setId={setId} nameMap={liveModel.morphismIndex()} {...inputProps} />;
}

const object_input_components = {
    Basic: BasicObInput,
    Tabulator: TabulatedMorInput,
};
