import type { Component } from "solid-js";

import type { FocusHandle } from "catcolab-ui-components";
import type { MorDecl, ObDecl } from "catlog-wasm";
import type { CellActions } from "../notebook";
import type { Theory } from "../theory";
import type { MorTypeMap, ObTypeMap } from "../theory/types";
import type { LiveModelDoc } from "./document";

/** Editor overrides for an editor variant of a theory.

Specifies which editor components should replace the defaults for particular
object or morphism types.

A variant can also provide `replaceModelEditor`, which short-circuits the
entire model notebook editor and renders a custom component instead. This is
intended for variants that don't map onto per-cell editing — for example,
embedding a third-party whole-graph editor.
 */
export type EditorVariantOverrides = {
    obEditors?: ObTypeMap<Component<ObjectEditorProps>>;
    morEditors?: MorTypeMap<Component<MorphismEditorProps>>;
    replaceModelEditor?: Component<ReplaceModelEditorProps>;
};

/** Props for a component that replaces the model notebook editor entirely. */
export type ReplaceModelEditorProps = {
    liveModel: LiveModelDoc;
};

/** Props for an object cell editor component in a model. */
export type ObjectEditorProps = {
    object: ObDecl;
    modifyObject: (f: (decl: ObDecl) => void) => void;
    focus: FocusHandle;
    actions: CellActions;
    theory: Theory;
};

/** Props for a morphism cell editor component in a model. */
export type MorphismEditorProps = {
    morphism: MorDecl;
    modifyMorphism: (f: (decl: MorDecl) => void) => void;
    focus: FocusHandle;
    actions: CellActions;
    theory: Theory;
};
