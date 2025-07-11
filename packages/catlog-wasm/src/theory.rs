//! Wasm bindings for double theories.

use std::collections::HashMap;
use std::rc::Rc;

use all_the_same::all_the_same;
use derive_more::From;
use ustr::Ustr;

use wasm_bindgen::prelude::*;

use catlog::dbl::theory;
use catlog::dbl::theory::{DblTheory as _, TabMorType, TabObType};
use catlog::one::Path;
use notebook_types::current::theory::*;

use super::notation::*;

/// Elaborates into object type in a discrete double theory.
impl CanElaborate<ObType, Ustr> for Elaborator {
    fn elab(&self, x: &ObType) -> Result<Ustr, String> {
        match x {
            ObType::Basic(name) => Ok(*name),
            _ => Err(format!("Cannot cast object type for discrete double theory: {x:#?}")),
        }
    }
}

/// Elaborates into morphism type in a discrete double theory.
impl CanElaborate<MorType, Path<Ustr, Ustr>> for Elaborator {
    fn elab(&self, x: &MorType) -> Result<Path<Ustr, Ustr>, String> {
        match x {
            MorType::Basic(ustr) => Ok(Path::single(*ustr)),
            MorType::Composite(fs) => {
                let fs: Result<Vec<_>, _> = fs.iter().map(|f| self.elab(f)).collect();
                let path = Path::from_vec(fs?).ok_or("Composite should not be empty")?;
                Ok(path.flatten())
            }
            MorType::Hom(ob_type) => Ok(Path::Id(self.elab(&**ob_type)?)),
        }
    }
}

/// Elaborates into object type in a discrete tabulator theory.
impl CanElaborate<ObType, TabObType<Ustr, Ustr>> for Elaborator {
    fn elab(&self, x: &ObType) -> Result<TabObType<Ustr, Ustr>, String> {
        match x {
            ObType::Basic(name) => Ok(TabObType::Basic(*name)),
            ObType::Tabulator(mor_type) => {
                Ok(TabObType::Tabulator(Box::new(self.elab(&**mor_type)?)))
            }
        }
    }
}

/// Elaborates into morphism type in a discrete tabulator theory.
impl CanElaborate<MorType, TabMorType<Ustr, Ustr>> for Elaborator {
    fn elab(&self, x: &MorType) -> Result<TabMorType<Ustr, Ustr>, String> {
        match x {
            MorType::Basic(ustr) => Ok(TabMorType::Basic(*ustr)),
            MorType::Composite(_) => {
                Err("Composites not yet implemented for tabulator theories".into())
            }
            MorType::Hom(ob_type) => Ok(TabMorType::Hom(Box::new(self.elab(&**ob_type)?))),
        }
    }
}

/// Quotes an object type in a discrete double theory.
impl CanQuote<Ustr, ObType> for Quoter {
    fn quote(&self, id: &Ustr) -> ObType {
        ObType::Basic(*id)
    }
}

/// Quotes a morphism type in a discrete double theory.
impl CanQuote<Path<Ustr, Ustr>, MorType> for Quoter {
    fn quote(&self, path: &Path<Ustr, Ustr>) -> MorType {
        match path {
            Path::Id(v) => MorType::Hom(Box::new(ObType::Basic(*v))),
            Path::Seq(edges) => {
                if edges.len() == 1 {
                    MorType::Basic(edges.head)
                } else {
                    MorType::Composite(edges.iter().map(|e| MorType::Basic(*e)).collect())
                }
            }
        }
    }
}

/// Quotes an object type in a discrete tabulator theory.
impl CanQuote<TabObType<Ustr, Ustr>, ObType> for Quoter {
    fn quote(&self, ob_type: &TabObType<Ustr, Ustr>) -> ObType {
        match ob_type {
            TabObType::Basic(name) => ObType::Basic(*name),
            TabObType::Tabulator(m) => ObType::Tabulator(Box::new(self.quote(&**m))),
        }
    }
}

/// Quotes a morphism type in a discrete tabulator theory.
impl CanQuote<TabMorType<Ustr, Ustr>, MorType> for Quoter {
    fn quote(&self, mor_type: &TabMorType<Ustr, Ustr>) -> MorType {
        match mor_type {
            TabMorType::Basic(name) => MorType::Basic(*name),
            TabMorType::Hom(x) => MorType::Hom(Box::new(self.quote(&**x))),
        }
    }
}

/** A box containing a double theory of any kind.

Ideally the Wasm-bound [`DblTheory`] would just have a type parameter for the
underlying double theory, but `wasm-bindgen` does not support
[generics](https://github.com/rustwasm/wasm-bindgen/issues/3309). Instead, we
explicitly enumerate the supported kinds of double theories in this enum.
 */
#[derive(From)]
pub enum DblTheoryBox {
    Discrete(Rc<theory::UstrDiscreteDblTheory>),
    DiscreteTab(Rc<theory::UstrDiscreteTabTheory>),
}

/** Wasm bindings for a double theory.
 */
#[wasm_bindgen]
pub struct DblTheory(#[wasm_bindgen(skip)] pub DblTheoryBox);

#[wasm_bindgen]
impl DblTheory {
    /// Kind of double theory ("double doctrine").
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> String {
        // TODO: Should return an enum so that we get type defs.
        match &self.0 {
            DblTheoryBox::Discrete(_) => "Discrete",
            DblTheoryBox::DiscreteTab(_) => "DiscreteTab",
        }
        .into()
    }

    /// Source of a morphism type.
    #[wasm_bindgen]
    pub fn src(&self, mor_type: MorType) -> Result<ObType, String> {
        all_the_same!(match &self.0 {
            DblTheoryBox::[Discrete, DiscreteTab](th) => {
                let m = Elaborator.elab(&mor_type)?;
                Ok(Quoter.quote(&th.src_type(&m)))
            }
        })
    }

    /// Target of a morphism type.
    #[wasm_bindgen]
    pub fn tgt(&self, mor_type: MorType) -> Result<ObType, String> {
        all_the_same!(match &self.0 {
            DblTheoryBox::[Discrete, DiscreteTab](th) => {
                let m = Elaborator.elab(&mor_type)?;
                Ok(Quoter.quote(&th.tgt_type(&m)))
            }
        })
    }
}

/** Mapping from object types to numerical indices.

Like [`MorTypeIndex`], this struct just compensates for the lack of hash maps
with arbitrary keys in JavaScript.
 */
#[wasm_bindgen]
#[derive(Clone, Default)]
pub struct ObTypeIndex(HashMap<ObType, usize>);

#[wasm_bindgen]
impl ObTypeIndex {
    /// Creates a new object type index.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Default::default()
    }

    /// Gets the index of an object type, if set.
    #[wasm_bindgen]
    pub fn get(&self, x: &ObType) -> Option<usize> {
        self.0.get(x).copied()
    }

    /// Sets the index of an object type.
    #[wasm_bindgen]
    pub fn set(&mut self, x: ObType, i: usize) {
        self.0.insert(x, i);
    }
}

/** Mapping from morphism types to numerical indices.

Like [`ObTypeIndex`], this struct just compensates for the lack of hash maps
with arbitrary keys in JavaScript.
 */
#[wasm_bindgen]
#[derive(Clone, Default)]
pub struct MorTypeIndex(HashMap<MorType, usize>);

#[wasm_bindgen]
impl MorTypeIndex {
    /// Creates a new morphism type index.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Default::default()
    }

    /// Gets the index of a morphism type, if set.
    #[wasm_bindgen]
    pub fn get(&self, m: &MorType) -> Option<usize> {
        self.0.get(m).copied()
    }

    /// Sets the index of a morphism type.
    #[wasm_bindgen]
    pub fn set(&mut self, m: MorType, i: usize) {
        self.0.insert(m, i);
    }
}
