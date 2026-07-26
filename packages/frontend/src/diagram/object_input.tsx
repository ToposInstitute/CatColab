import { deepEqual } from "fast-equals";
import { type Component, splitProps, useContext, Accessor } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import type { TextInputOptions } from "catcolab-ui-components";
import type {
    Ob,
    ObOp,
    ObType,
    QualifiedName,
    QualifiedLabel,
    Uuid,
    NameLookup,
} from "catlog-wasm";
import { type IdInputOptions, ObIdInput } from "../components";
import { LiveDiagramContext } from "./context";
import type { LiveDiagramDoc } from "./document.ts";
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

/** Object lookup that falls back to formalJudgments when the diagram
 *  cannot be elaborated (e.g. modal theories).
 */
export function createObLookup(liveDiagram: Accessor<LiveDiagramDoc>) {
    const elaborated = () => liveDiagram().elaboratedDiagram();
    const judgments = () => liveDiagram().formalJudgments();

    function completions(obType?: ObType): Uuid[] | undefined {
        const diag = elaborated();
        if (diag && obType) {
            return diag.obGeneratorsWithType(obType);
        }
        if (!obType) {
            return undefined;
        }
        return judgments()
            .filter((j) => j.tag === "object" && deepEqual(j.obType, obType))
            .map((j) => j.id);
    }

    function idToLabel(id: QualifiedName): QualifiedLabel | undefined {
        const diag = elaborated();
        if (diag) {
            return diag.obGeneratorLabel(id);
        }
        const found = judgments().find((j) => j.tag === "object" && j.id === id);
        return found?.tag === "object" && found.name ? [found.name] : undefined;
    }

    function labelToId(label: QualifiedLabel): NameLookup | undefined {
        const diag = elaborated();
        if (diag) {
            return diag.obGeneratorWithLabel(label);
        }
        const name = String(label[0]);
        const matches = judgments().filter((j) => j.tag === "object" && j.name === name);
        const first = matches[0];
        if (first === undefined) {
            return { tag: "None" };
        }
        if (matches.length === 1) {
            return { tag: "Unique", content: first.id };
        }
        return { tag: "Arbitrary", content: first.id };
    }

    return { completions, idToLabel, labelToId };
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

    const lookup = createObLookup(liveDiagram);

    // FIXME: Push diagram labels into Wasm layer.
    return (
        <ObIdInput
            completions={lookup.completions(props.obType)}
            idToLabel={lookup.idToLabel}
            labelToId={lookup.labelToId}
            {...props}
        />
    );
}
