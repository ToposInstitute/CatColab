import { deepEqual } from "fast-equals";
import { type Component, splitProps, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";
import { match, P } from "ts-pattern";

import type { TextInputOptions } from "catcolab-ui-components";
import type { MorType, Ob, ObOp, ObType, QualifiedName, Uuid } from "catlog-wasm";
import { IdInput, type IdInputOptions, ObIdInput } from "../components";
import { LiveModelContext } from "./context";
import { ObListEditor } from "./object_list_editor";

/** Props passed to any object input component. */
export type ObInputProps = {
    /** Current value of object, if any. */
    ob: Ob | null;

    /** Handler to set a new value of the object. */
    setOb: (ob: Ob | null) => void;

    /** Type of object being edited. */
    obType: ObType;

    /** Placeholder text to show when no object has been chosen. */
    placeholder?: string;

    /** Whether the choice of object is invalid, say by having wrong type.

    This is a stub; we should propagate error messages from the core.
     */
    isInvalid?: boolean;
};

/** Input an object that already exists in a model. */
export function ObInput(
    allProps: ObInputProps &
        TextInputOptions & {
            /** Operation to apply to the object afterwards, if any. */
            applyOp?: ObOp;
        },
) {
    const [props, otherProps] = splitProps(allProps, ["ob", "setOb", "obType", "applyOp"]);

    const ob = () => {
        if (props.applyOp) {
            return props.ob?.tag === "App" && deepEqual(props.ob.content.op, props.applyOp)
                ? props.ob.content.ob
                : null;
        } else {
            return props.ob;
        }
    };

    const setOb = (ob: Ob | null) => {
        if (ob && props.applyOp) {
            props.setOb({
                tag: "App",
                content: {
                    op: props.applyOp,
                    ob,
                },
            });
        } else {
            props.setOb(ob);
        }
    };

    return (
        <Dynamic
            component={obEditorForType(props.obType)}
            ob={ob()}
            setOb={setOb}
            obType={props.obType}
            {...otherProps}
        />
    );
}

function obEditorForType(obType: ObType): Component<ObInputProps> {
    if (obType.tag === "Basic") {
        return BasicObInput;
    } else if (obType.tag === "Tabulator") {
        return TabulatedMorInput;
    } else if (obType.tag === "ModeApp") {
        switch (obType.content.modality) {
            case "Discrete":
            case "Codiscrete":
                return obEditorForType(obType.content.obType);
            case "List":
            case "SymmetricList":
            case "CocartesianList":
            case "CartesianList":
            case "AdditiveList": {
                return ObListEditor;
            }
        }
    }
    throw new Error(`No editor for object of type: ${obType}`);
}

/** Input a basic object via its human-readable name. */
function BasicObInput(allProps: ObInputProps & IdInputOptions) {
    const [props, otherProps] = splitProps(allProps, ["obType"]);

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const completions = (): QualifiedName[] | undefined =>
        liveModel().elaboratedModel()?.obGeneratorsWithType(props.obType);
    console.log(props.obType);

    return (
        <ObIdInput
            completions={completions()}
            idToLabel={(id) => liveModel().elaboratedModel()?.obGeneratorLabel(id)}
            labelToId={(label) => liveModel().elaboratedModel()?.obGeneratorWithLabel(label)}
            {...otherProps}
        />
    );
}

/** Input an object that is a tabulated morphism.

TODO: We are assuming that the morphism is basic and so will be specified by its
human-readable name. However, in a general double theory, there is no such
restriction on tabulated morphisms.
 */
function TabulatedMorInput(allProps: ObInputProps & IdInputOptions) {
    const [props, inputProps] = splitProps(allProps, ["ob", "setOb", "obType"]);

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const tabulatedType = (): MorType | null =>
        match(props.obType)
            .with(
                {
                    tag: "Tabulator",
                    content: P.select(),
                },
                (content) => content,
            )
            .otherwise(() => null);

    const completions = (): QualifiedName[] | undefined => {
        const morType = tabulatedType();
        if (!morType) {
            return undefined;
        }
        return liveModel().elaboratedModel()?.morGeneratorsWithType(morType);
    };

    const id = (): Uuid | null =>
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

    const setId = (id: Uuid | null) => {
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

    return (
        <IdInput
            id={id()}
            setId={setId}
            idToLabel={(id) => liveModel().elaboratedModel()?.morGeneratorLabel(id)}
            labelToId={(label) => liveModel().elaboratedModel()?.morGeneratorWithLabel(label)}
            completions={completions()}
            {...inputProps}
        />
    );
}
