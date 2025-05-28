/*! Wasm bindings for double theories from the `catlog` standard library.

Each struct in this module provides a [`DblTheory`] plus possibly
theory-specific analysis methods.
 */

use std::collections::HashMap;
use std::rc::Rc;

use ustr::ustr;
use wasm_bindgen::prelude::*;

use catlog::dbl::model::MutDblModel;
use catlog::dbl::model::FgDblModel;
use catlog::dbl::{model, theory};
use catlog::one::FgCategory;
use catlog::one::Path;
use catlog::stdlib::{analyses, models, theories};

use super::model_morphism::{MotifsOptions, motifs};
use super::{analyses::*, model::DblModel, theory::DblTheory};

/// The empty or initial theory.
#[wasm_bindgen]
pub struct ThEmpty(Rc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThEmpty {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_empty()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }
}

/// The theory of categories.
#[wasm_bindgen]
pub struct ThCategory(Rc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThCategory {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_category()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }
}

/// The theory of database schemas with attributes.
#[wasm_bindgen]
pub struct ThSchema(Rc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThSchema {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_schema()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }
}

/// The theory of signed categories.
#[wasm_bindgen]
pub struct ThSignedCategory(Rc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThSignedCategory {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_signed_category()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }

    /// Find positive feedback loops in a model.
    #[wasm_bindgen(js_name = "positiveLoops")]
    pub fn positive_loops(
        &self,
        model: &DblModel,
        options: MotifsOptions,
    ) -> Result<Vec<DblModel>, String> {
        let positive_loop = models::positive_loop(self.0.clone());
        motifs(&positive_loop, model, options)
    }

    /// Find negative feedback loops in a model.
    #[wasm_bindgen(js_name = "negativeLoops")]
    pub fn negative_loops(
        &self,
        model: &DblModel,
        options: MotifsOptions,
    ) -> Result<Vec<DblModel>, String> {
        let negative_loop = models::negative_loop(self.0.clone());
        motifs(&negative_loop, model, options)
    }

    /// Simulate the Lotka-Volterra system derived from a model.
    #[wasm_bindgen(js_name = "lotkaVolterra")]
    pub fn lotka_volterra(
        &self,
        model: &DblModel,
        data: LotkaVolterraModelData,
    ) -> Result<ODEResult, String> {
        let model: &model::DiscreteDblModel<_, _> = (&model.0)
            .try_into()
            .map_err(|_| "Lotka-Volterra simulation expects a discrete double model")?;
        Ok(ODEResult(
            analyses::ode::LotkaVolterraAnalysis::new(ustr("Object"))
                .add_positive(Path::Id(ustr("Object")))
                .add_negative(ustr("Negative").into())
                .create_system(model, data.0)
                .solve_with_defaults()
                .map_err(|err| format!("{:?}", err))
                .into(),
        ))
    }

    /// Simulate the CCLFO system derived from a model.
    #[wasm_bindgen(js_name = "cclfo")]
    pub fn cclfo(&self, model: &DblModel, data: CCLFOModelData) -> Result<ODEResult, String> {
        let model: &model::DiscreteDblModel<_, _> = (&model.0)
            .try_into()
            .map_err(|_| "CCLFO simulation expects a discrete double model")?;
        Ok(ODEResult(
            analyses::ode::CCLFOAnalysis::new(ustr("Object"))
                .add_positive(Path::Id(ustr("Object")))
                .add_negative(ustr("Negative").into())
                .create_system(model, data.0)
                .solve_with_defaults()
                .map_err(|err| format!("{:?}", err))
                .into(),
        ))
    }
}

/// The theory of delayable signed categories.
#[wasm_bindgen]
pub struct ThDelayableSignedCategory(Rc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThDelayableSignedCategory {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_delayable_signed_category()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }

    /// Find (fast) positive feedback loops in a model.
    #[wasm_bindgen(js_name = "positiveLoops")]
    pub fn positive_loops(
        &self,
        model: &DblModel,
        options: MotifsOptions,
    ) -> Result<Vec<DblModel>, String> {
        let positive_loop = models::positive_loop(self.0.clone());
        motifs(&positive_loop, model, options)
    }

    /// Find (fast) negative feedback loops in a model.
    #[wasm_bindgen(js_name = "negativeLoops")]
    pub fn negative_loops(
        &self,
        model: &DblModel,
        options: MotifsOptions,
    ) -> Result<Vec<DblModel>, String> {
        let negative_loop = models::negative_loop(self.0.clone());
        motifs(&negative_loop, model, options)
    }

    /// Find delayed positive feedback loops in a model.
    #[wasm_bindgen(js_name = "delayedPositiveLoops")]
    pub fn delayed_positive_loops(
        &self,
        model: &DblModel,
        options: MotifsOptions,
    ) -> Result<Vec<DblModel>, String> {
        let delayed_positive_loop = models::delayed_positive_loop(self.0.clone());
        motifs(&delayed_positive_loop, model, options)
    }

    /// Find delayed negative feedback loops in a model.
    #[wasm_bindgen(js_name = "delayedNegativeLoops")]
    pub fn delayed_negative_loops(
        &self,
        model: &DblModel,
        options: MotifsOptions,
    ) -> Result<Vec<DblModel>, String> {
        let delayed_negative_loop = models::delayed_negative_loop(self.0.clone());
        motifs(&delayed_negative_loop, model, options)
    }
}

/// The theory of (N x N)-graded signed categories.
#[wasm_bindgen]
pub struct ThNN2Category(Rc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThNN2Category {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_nn2_category()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }

    /// Simulate the LCC system derived from a model.
    #[wasm_bindgen(js_name = "lcc")]
    pub fn lcc(&self, model: &DblModel, data: LCCModelData) -> Result<ODEResult, String> {
        let model: &model::DiscreteDblModel<_, _> = (&model.0)
            .try_into()
            .map_err(|_| "LCC simulation expects a discrete double model")?;

        // Pre-processing the model: creating objects for each derivative and
        // lifting all morphisms to be degree 1

        // TO-DO: actually make a new model (modified_model) and pass THIS into
        // the analysis (remember to e.g. not add anything in degree_zeros)

        // tower_heights: [(base, height of corresponding tower)]
        // in_arrows: [(object, morphisms to this object)]
        // degree_zeros: [morphisms of degree 0]
        let mut tower_heights: HashMap<uuid::Uuid, usize> = HashMap::new();
        let mut in_arrows: HashMap<uuid::Uuid, Vec<uuid::Uuid>> = HashMap::new();
        for x in model.ob_generators() {
            tower_heights.insert(x, 0);
            in_arrows.insert(x, Vec::new());
        };
        let mut degree_zeros: Vec<uuid::Uuid> = Vec::new();

        // To start, we have yet to build any of the towers, so everything is
        // unchecked
        // TO-DO: consider making this a BinaryHeap ?
        let mut unchecked_bases: Vec<uuid::Uuid> = model.ob_generators().collect::<Vec<_>>().clone();

        // Given a morphism, return its degree as a usize
        let deg = |f: uuid::Uuid| {
            model.mor_generator_type(&f)
            .into_iter()
            .filter(|t| *t == ustr("Degree"))
            .count()
        };

        // First pass, calculating maximal incoming degree for each base
        for f in model.mor_generators() {
            let degree = deg(f);
            if degree == 0 {
                degree_zeros.push(f);
            }

            let f_cod = model
                .get_cod(&f)
                .expect("DEV_ERROR: pied wagtail");

            let new_degree = match tower_heights.get(f_cod) {
                Some(height) => std::cmp::max(*height, degree - 1),
                None => degree - 1
            };

            tower_heights.insert(*f_cod, new_degree);

            // While we're here, we might as well also...
            in_arrows.get_mut(f_cod).expect("DEV_ERROR: coot").push(f);
        }

        // If a tower isn't big enough, add more floors
        fn update_tower(x: &uuid::Uuid, h: usize, tower: &mut HashMap<uuid::Uuid, usize>) {
            let current_height = tower.get(&x).expect("DEV_ERROR: chaffinch");
            if h > *current_height {
                tower.insert(*x, h);
            }
            return;
        }

        // Iterate over all unchecked bases, starting with (one of) the one(s)
        // with greatest current height
        while !unchecked_bases.is_empty() {
            unchecked_bases.sort_by(|x, y| {
                let height = |base| tower_heights
                    .get(base)
                    .expect("DEV_ERROR: gosling");
                // we want to sort small to big, so we can pop later on
                height(y).cmp(height(x))
            });

            let current_base = unchecked_bases.pop().expect("DEV_ERROR: emu");
            // TO-DO: why do we need a .clone() here and nowhere else?
            let current_height = tower_heights.get(&current_base).expect("DEV_ERROR: lorikeet").clone();
            for f in in_arrows.get(&current_base).expect("DEV_ERROR: cygnet") {
                update_tower(model.get_dom(&f).expect("DEV_ERROR: rosella"), current_height - deg(*f) + 1, &mut tower_heights);
            }
        }

        let mut derivative_towers: HashMap<uuid::Uuid, Vec<uuid::Uuid>> = HashMap::new();
        for (x, t) in tower_heights.into_iter() {
            // derivative_towers.insert(x, )
        }


        // ----------


        // add_positive(ustr("Degree").into())
        // add_negative(????? something about composites ?????)
        // create_system(&model, degree_zeros, data.0)

        // START TEST CASE
        let mut migrated_model = model.clone();
        let (x, f) = (uuid::Uuid::now_v7(), uuid::Uuid::now_v7());
        migrated_model.add_ob(x, ustr("Object"));
        migrated_model.add_mor(f, x, x, catlog::one::Path::Id(ustr("Object")));
        // END TEST CASE

        Ok(ODEResult(
            analyses::ode::LCCAnalysis::new(ustr("Object"))
                .add_positive(Path::Id(ustr("Object")))
                .add_negative(ustr("Negative").into())
                .create_system(&migrated_model, data.0, x, f)
                .solve_with_defaults()
                .map_err(|err| format!("{:?}", err))
                .into(),
        ))
    }
}

/// The theory of nullable signed categories.
#[wasm_bindgen]
pub struct ThNullableSignedCategory(Rc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThNullableSignedCategory {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_nullable_signed_category()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }
}

/// The theory of categories with scalars.
#[wasm_bindgen]
pub struct ThCategoryWithScalars(Rc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThCategoryWithScalars {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_category_with_scalars()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }
}

/// The theory of categories with links.
#[wasm_bindgen]
pub struct ThCategoryLinks(Rc<theory::UstrDiscreteTabTheory>);

#[wasm_bindgen]
impl ThCategoryLinks {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_category_links()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }

    /// Simulates the mass-action system derived from a model.
    #[wasm_bindgen(js_name = "massAction")]
    pub fn mass_action(
        &self,
        model: &DblModel,
        data: MassActionModelData,
    ) -> Result<ODEResult, String> {
        let model: &model::DiscreteTabModel<_, _, _> = (&model.0)
            .try_into()
            .map_err(|_| "Mass-action simulation expects a discrete tabulator model")?;
        Ok(ODEResult(
            analyses::ode::StockFlowMassActionAnalysis::default()
                .create_numerical_system(model, data.0)
                .solve_with_defaults()
                .map_err(|err| format!("{:?}", err))
                .into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::theory::*;
    use ustr::ustr;

    #[test]
    fn discrete_dbl_theory() {
        let th = ThSchema::new().theory();
        let entity = ObType::Basic(ustr("Entity"));
        let attr_type = ObType::Basic(ustr("AttrType"));
        let attr = MorType::Basic(ustr("Attr"));
        assert_eq!(th.src(attr.clone()), Ok(entity));
        assert_eq!(th.tgt(attr), Ok(attr_type));
    }

    #[test]
    fn discrete_tab_theory() {
        let th = ThCategoryLinks::new().theory();
        let x = ObType::Basic(ustr("Object"));
        let link = MorType::Basic(ustr("Link"));
        assert_eq!(th.src(link.clone()), Ok(x));
        assert!(matches!(th.tgt(link), Ok(ObType::Tabulator(_))));
    }
}
