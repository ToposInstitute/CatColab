/** API for editing morphism cells in a model.

The `MorphismEditHandle` and `MultiaryMorphismEditHandle` classes hide the
algebraic plumbing of `ModeApp` list modalities and `applyOp` wrappers, expose
insert/remove/replace methods on dom/cod, and answer error queries by morphism
id. Construct one at the top of an editor component, passing accessors for the
theory, morphism, modify callback, and validated model.
 */

export { BaseMorphismEditHandle, MorphismEditHandle, MultiaryMorphismEditHandle } from "./morphism";
