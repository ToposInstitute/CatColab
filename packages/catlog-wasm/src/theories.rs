/*! Wasm bindings for double theories from the `catlog` standard library.

Each struct in this module provides a [`DblTheory`] plus possibly
theory-specific analysis methods.
 */

use std::rc::Rc;

use ustr::ustr;
use wasm_bindgen::prelude::*;

use catlog::dbl::{model, theory};
use catlog::dbl::model::MutDblModel;
use catlog::one::Path;
use catlog::stdlib::{analyses, models, theories};

use super::model_morphism::{motifs, MotifsOptions};
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
    pub fn cclfo(
        &self,
        model: &DblModel,
        data: CCLFOModelData,
    ) -> Result<ODEResult, String> {
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
    pub fn lcc(
        &self,
        model: &DblModel,
        data: LCCModelData,
    ) -> Result<ODEResult, String> {
        let model: &model::DiscreteDblModel<_, _> = (&model.0)
            .try_into()
            .map_err(|_| "LCC simulation expects a discrete double model")?;
        let mut migrated_model = model.clone();

        // // 1. build an objects hash
        // for each x in model.objects {
        //     model_objects_hash.insert(x, 1)
        // }

        // // 2. update the hash to have the top-degree morphism's degree
        // for each f in model.morphisms {
        //     if (deg(f) > model_objects_hash[cod(f)]) {
        //         model_objects_hash[cod(f)] = deg(f)
        //     }
        //     if (deg(f) > 1) {
        //         model_morphisms_to_lift.insert(f)
        //     } else if (deg(f) = 0) {
        //         model_morphisms_deg_0.insert(f)
        //         model.morphisms.remove(f)
        //     }
        // }

        // // 3. make all the formal derivative objects and the morphisms between them
        // formal_objects = {}
        // for each x in model.objects {
        //     for (i = 1 .. model_objects_hash[x] - 1) {
        //         model.objects.insert(xi)
        //         model.morphisms.insert(xi->x(i-1))
        //     }
        // }

        // // 4. lift all morphisms to the top of the towers
        // for each f in model_morphisms_to_lift {
        //     model.morphisms.insert(dom(f)->xi) where i = deg(f)-1
        //     model.morphisms.remove(f)
        // }

        // ---------------------------------------------------------------------

        // create_system(&model, data.0, model_morphisms_deg_zero)

        // // 1.
        // for each (x, _) in model.objects {
        //     model_formal_towers.insert(x, [])
        // }

        // // 2.
        // for each f in (map fst model.morphisms) {
        //     case of deg(f):
        //         deg(f) == 0 {
        //             model_morphisms_deg_zero.insert(f)
        //             model.morphisms.remove(f)
        //         }
        //         deg(f) > 1 {
        //             new_cod = get_or_create(cod(f).id, deg(f))
        //             model.morphisms.insert(new_uuid, cod(f).id, dom(f).id, "Deg")
        //             model.morphisms.remove(f)
        //         }
        //         deg(f) == 1 {
        //             return
        //         }
        // }

        // // 3.
        // fn get_or_create(base, deg) {
        //     // TO-DO
        // }



        let (x, f) = (uuid::Uuid::now_v7(), uuid::Uuid::now_v7());
        migrated_model.add_ob(x, ustr("Object"));
        migrated_model.add_mor(f, x, x, catlog::one::Path::Id(ustr("Object")));



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
