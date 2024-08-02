import { Match, Switch, splitProps, useContext } from "solid-js";

import type { Ob, ObType } from "catlog-wasm";
import type { TheoryMeta } from "../theory";
import { IdInput, type IdInputOptions } from "./id_input";
import { ObjectIndexContext, TheoryContext } from "./model_context";

/** Input an object that already exists in a model.

FIXME: Don't assume that underlying component is an ID input.
 */
export function ObjectInput(
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
        <Switch>
            <Match when={props.obType?.tag === "Basic"}>
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
            </Match>
        </Switch>
    );
}

export function obClasses(theory: TheoryMeta | undefined, typ?: ObType): string[] {
    const typeMeta = typ ? theory?.getObTypeMeta(typ) : undefined;
    return [...(typeMeta?.cssClasses ?? []), ...(typeMeta?.textClasses ?? [])];
}
