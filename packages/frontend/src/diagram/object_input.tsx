import { deepEqual } from "fast-equals";
import { type Component, splitProps, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import type { TextInputOptions } from "catcolab-ui-components";
import type { Ob, ObType, QualifiedName, ObOp } from "catlog-wasm";
import { type IdInputOptions, ObIdInput } from "../components";
import { LiveDiagramContext } from "./context";
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
