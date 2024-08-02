import { splitProps, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";

import type { Ob, ObType } from "catlog-wasm";
import type { TheoryMeta } from "../theory";
import { IdInput, type IdInputOptions } from "./id_input";
import { MorphismIndexContext, ObjectIndexContext, TheoryContext } from "./model_context";

/** Input an object that already exists in a model.

FIXME: Don't assume that underlying component is an ID input.
 */
export function ObInput(
    allProps: {
        ob: Ob | null;
        setOb: (ob: Ob | null) => void;
        obType?: ObType;
    } & IdInputOptions,
) {
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
function BasicObInput(
    allProps: {
        ob: Ob | null;
        setOb: (ob: Ob | null) => void;
        obType?: ObType;
    } & IdInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, ["ob", "setOb", "obType"]);

    const objectIndex = useContext(ObjectIndexContext);
    const theory = useContext(TheoryContext);
    const cssClasses = () => obClasses(theory?.(), props.obType);

    return (
        <div class={cssClasses().join(" ")}>
            <IdInput
                id={props.ob?.tag === "Basic" ? props.ob.content : null}
                setId={(id) => {
                    props.setOb(
                        id === null
                            ? null
                            : {
                                  tag: "Basic",
                                  content: id,
                              },
                    );
                }}
                nameMap={objectIndex?.()}
                {...inputProps}
            />
        </div>
    );
}

export function obClasses(theory: TheoryMeta | undefined, typ?: ObType): string[] {
    const typeMeta = typ ? theory?.getObTypeMeta(typ) : undefined;
    return [...(typeMeta?.cssClasses ?? []), ...(typeMeta?.textClasses ?? [])];
}

/** Input an object that is a tabulated morphism.

TODO: Assumes that the morphism is basic and thus will be input by its
human-readable name. However, there is no such restriction on tabulators.
 */
function TabulatedMorInput(
    allProps: {
        ob: Ob | null;
        setOb: (ob: Ob | null) => void;
        obType?: ObType;
    } & IdInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, ["ob", "setOb", "obType"]);

    const morphismIndex = useContext(MorphismIndexContext);

    return (
        <IdInput
            id={
                /// XXX: Would be nice to have a match statement here!
                props.ob?.tag === "Tabulated" && props.ob.content.tag === "Basic"
                    ? props.ob.content.content
                    : null
            }
            setId={(id) => {
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
            }}
            nameMap={morphismIndex?.()}
            {...inputProps}
        />
    );
}

const object_input_components = {
    Basic: BasicObInput,
    Tabulator: TabulatedMorInput,
};
