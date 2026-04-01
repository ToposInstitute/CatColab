import type { Component } from "solid-js";

import type { MorDecl, MorType, ObDecl, ObType } from "catlog-wasm";
import type { CellActions } from "../notebook";
import type { Theory } from "../theory";

/** Editor overrides for an editor variant of a theory.

Specifies which editor components should replace the defaults for particular
object or morphism types.
 */
export type EditorVariantOverrides = {
    obEditors?: Array<{ obType: ObType; editor: Component<ObjectEditorProps> }>;
    morEditors?: Array<{ morType: MorType; editor: Component<MorphismEditorProps> }>;
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
