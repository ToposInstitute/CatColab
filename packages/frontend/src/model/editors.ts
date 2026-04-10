import type { Component } from "solid-js";

import type { MorDecl, ObDecl } from "catlog-wasm";
import type { CellActions } from "../notebook";
import type { Theory } from "../theory";
import type { MorTypeMap, ObTypeMap } from "../theory/types";

/** Editor overrides for an editor variant of a theory.

Specifies which editor components should replace the defaults for particular
object or morphism types.
 */
export type EditorVariantOverrides = {
    obEditors?: ObTypeMap<Component<ObjectEditorProps>>;
    morEditors?: MorTypeMap<Component<MorphismEditorProps>>;
};

/** Props for an object cell editor component in a model. */
export type ObjectEditorProps = {
    object: ObDecl;
    modifyObject: (f: (decl: ObDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
    theory: Theory;
};

/** Props for a morphism cell editor component in a model. */
export type MorphismEditorProps = {
    morphism: MorDecl;
    modifyMorphism: (f: (decl: MorDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
    theory: Theory;
};
