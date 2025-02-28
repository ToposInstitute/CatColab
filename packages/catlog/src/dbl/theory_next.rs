//! Double theories: new version based on VDCs.

use super::{category::VDblCategory, tree::DblTree};
use crate::one::path::Path;

/** A double theory.

A double theory is "just" a virtual double category (VDC) assumed to have units.
Reflecting this, this trait has a blanket implementation for any
[`VDblCategory`]. It is not recommended to implement this trait directly.
 */
pub trait DblTheory {
    /** Rust type of object types in the theory.

    Viewing the double theory as a virtual double category, this is the type of
    objects.
    */
    type ObType: Eq + Clone;

    /** Rust type of morphism types in the theory.

    Viewing the double theory as a virtual double category, this is the type of
    proarrows.
    */
    type MorType: Eq + Clone;

    /** Rust type of operations on objects in the double theory.

    Viewing the double theory as a virtual double category, this is the type of
    arrows.
    */
    type ObOp: Eq + Clone;

    /** Rust type of operations on morphisms in the double theory.

    Viewing the double theory as a virtual double category, this is the type of
    cells.
    */
    type MorOp: Eq + Clone;

    /// Does the object type belong to the theory?
    fn has_ob_type(&self, x: &Self::ObType) -> bool;

    /// Does the morphism type belong to the theory?
    fn has_mor_type(&self, m: &Self::MorType) -> bool;

    /// Does the object operation belong to the theory?
    fn has_ob_op(&self, f: &Self::ObOp) -> bool;

    /// Does the morphism operation belong to the theory?
    fn has_mor_op(&self, α: &Self::MorOp) -> bool;

    /// Source of morphism type.
    fn src(&self, m: &Self::MorType) -> Self::ObType;

    /// Target of morphism type.
    fn tgt(&self, m: &Self::MorType) -> Self::ObType;

    /// Domain of operation on objects.
    fn dom(&self, f: &Self::ObOp) -> Self::ObType;

    /// Codomain of operation on objects.
    fn cod(&self, f: &Self::ObOp) -> Self::ObType;

    /// Source operation of operation on morphisms.
    fn op_src(&self, α: &Self::MorOp) -> Self::ObOp;

    /// Target operation of operation on morphisms.
    fn op_tgt(&self, α: &Self::MorOp) -> Self::ObOp;

    /// Domain of operation on morphisms, a path of morphism types.
    fn op_dom(&self, α: &Self::MorOp) -> Path<Self::ObType, Self::MorType>;

    /// Codomain of operation on morphisms, a single morphism type.
    fn op_cod(&self, α: &Self::MorOp) -> Self::MorType;

    /// Composes a sequence of morphism types, if they have a composite.
    fn compose_types(&self, path: Path<Self::ObType, Self::MorType>) -> Option<Self::MorType>;

    /** Hom morphism type on an object type.

    Viewing the double theory as a virtual double category, this is the unit
    proarrow on an object.
    */
    fn hom_type(&self, x: Self::ObType) -> Self::MorType {
        self.compose_types(Path::Id(x))
            .expect("A double theory should have all hom types")
    }

    /// Compose a sequence of operations on objects.
    fn compose_ob_ops(&self, path: Path<Self::ObType, Self::ObOp>) -> Self::ObOp;

    /** Identity operation on an object type.

    View the double theory as a virtual double category, this is the identity
    arrow on an object.
    */
    fn id_ob_op(&self, x: Self::ObType) -> Self::ObOp {
        self.compose_ob_ops(Path::Id(x))
    }

    /// Compose operations on morphisms.
    fn compose_mor_ops(&self, tree: DblTree<Self::ObOp, Self::MorType, Self::MorOp>)
    -> Self::MorOp;

    /** Identity operation on a morphism type.

    Viewing the double theory as a virtual double category, this is the identity
    cell on a proarrow.
    */
    fn id_mor_op(&self, m: Self::MorType) -> Self::MorOp {
        self.compose_mor_ops(DblTree::empty(m))
    }
}

impl<VDC: VDblCategory> DblTheory for VDC {
    type ObType = VDC::Ob;
    type MorType = VDC::Pro;
    type ObOp = VDC::Arr;
    type MorOp = VDC::Cell;

    fn has_ob_type(&self, x: &Self::ObType) -> bool {
        self.has_ob(x)
    }
    fn has_mor_type(&self, m: &Self::MorType) -> bool {
        self.has_proarrow(m)
    }
    fn has_ob_op(&self, f: &Self::ObOp) -> bool {
        self.has_arrow(f)
    }
    fn has_mor_op(&self, α: &Self::MorOp) -> bool {
        self.has_cell(α)
    }

    fn src(&self, m: &Self::MorType) -> Self::ObType {
        VDblCategory::src(self, m)
    }
    fn tgt(&self, m: &Self::MorType) -> Self::ObType {
        VDblCategory::tgt(self, m)
    }
    fn dom(&self, f: &Self::ObOp) -> Self::ObType {
        VDblCategory::dom(self, f)
    }
    fn cod(&self, f: &Self::ObOp) -> Self::ObType {
        VDblCategory::dom(self, f)
    }

    fn op_src(&self, α: &Self::MorOp) -> Self::ObOp {
        self.cell_src(α)
    }
    fn op_tgt(&self, α: &Self::MorOp) -> Self::ObOp {
        self.cell_tgt(α)
    }
    fn op_dom(&self, α: &Self::MorOp) -> Path<Self::ObType, Self::MorType> {
        self.cell_dom(α)
    }
    fn op_cod(&self, α: &Self::MorOp) -> Self::MorType {
        self.cell_cod(α)
    }

    fn compose_types(&self, path: Path<Self::ObType, Self::MorType>) -> Option<Self::MorType> {
        self.composite(path)
    }
    fn hom_type(&self, x: Self::ObType) -> Self::MorType {
        self.unit(x).expect("A double theory should have all hom types")
    }

    fn compose_ob_ops(&self, path: Path<Self::ObType, Self::ObOp>) -> Self::ObOp {
        self.compose(path)
    }
    fn id_ob_op(&self, x: Self::ObType) -> Self::ObOp {
        self.id(x)
    }

    fn compose_mor_ops(
        &self,
        tree: DblTree<Self::ObOp, Self::MorType, Self::MorOp>,
    ) -> Self::MorOp {
        self.compose_cells(tree)
    }
    fn id_mor_op(&self, m: Self::MorType) -> Self::MorOp {
        self.id_cell(m)
    }
}
