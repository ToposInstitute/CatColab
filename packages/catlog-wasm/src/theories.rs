/*! Wasm bindings for double theories from the `catlog` standard library.

Each struct in this module provides a [`DblTheory`] plus possibly
theory-specific analysis methods.
 */

use std::rc::Rc;

use ustr::ustr;
use wasm_bindgen::prelude::*;

use catlog::dbl::theory;
use catlog::one::Path;
use catlog::stdlib::{analyses, models, theories, theory_morphisms};

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

    /// Sigma migrates a category to a schema.
    #[wasm_bindgen(js_name = "toSchema")]
    pub fn to_schema(mut model: DblModel, th_schema: &DblTheory) -> Result<DblModel, String> {
        let th = th_schema.discrete()?;
        model.discrete_mut()?.push_forward(
            &theory_morphisms::th_category_to_schema().functor_into(&th.0),
            th.clone(),
        );
        Ok(model)
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

    /// Sigma migrates a schema to a category.
    #[wasm_bindgen(js_name = "toCategory")]
    pub fn to_category(mut model: DblModel, th_category: &DblTheory) -> Result<DblModel, String> {
        let th = th_category.discrete()?;
        model.discrete_mut()?.push_forward(
            &theory_morphisms::th_schema_to_category().functor_into(&th.0),
            th.clone(),
        );
        Ok(model)
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
        Ok(ODEResult(
            analyses::ode::SignedCoefficientBuilder::new(ustr("Object"))
                .add_positive(Path::Id(ustr("Object")))
                .add_negative(ustr("Negative").into())
                .lotka_volterra_analysis(model.discrete()?, data.0)
                .solve_with_defaults()
                .map_err(|err| format!("{err:?}"))
                .into(),
        ))
    }

    /// Simulate the linear ODE system derived from a model.
    #[wasm_bindgen(js_name = "linearODE")]
    pub fn linear_ode(
        &self,
        model: &DblModel,
        data: LinearODEModelData,
    ) -> Result<ODEResult, String> {
        Ok(ODEResult(
            analyses::ode::SignedCoefficientBuilder::new(ustr("Object"))
                .add_positive(Path::Id(ustr("Object")))
                .add_negative(ustr("Negative").into())
                .linear_ode_analysis(model.discrete()?, data.0)
                .solve_with_defaults()
                .map_err(|err| format!("{err:?}"))
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

    /// Sigma migrates a delayable signed category to a signed category.
    #[wasm_bindgen(js_name = "toSignedCategory")]
    pub fn to_signed_category(mut model: DblModel, th: &DblTheory) -> Result<DblModel, String> {
        let th = th.discrete()?;
        model.discrete_mut()?.push_forward(
            &theory_morphisms::th_delayable_signed_category_to_signed_category()
                .functor_into(&th.0),
            th.clone(),
        );
        Ok(model)
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

    /// Simulates the mass-action ODE system derived from a model.
    #[wasm_bindgen(js_name = "massAction")]
    pub fn mass_action(
        &self,
        model: &DblModel,
        data: MassActionModelData,
    ) -> Result<ODEResult, String> {
        Ok(ODEResult(
            analyses::ode::StockFlowMassActionAnalysis::default()
                .build_numerical_system(model.discrete_tab()?, data.0)
                .solve_with_defaults()
                .map_err(|err| format!("{err:?}"))
                .into(),
        ))
    }
}

/// The theory of strict symmetric monoidal categories.
#[wasm_bindgen]
pub struct ThSymMonoidalCategory(Rc<theory::UstrModalDblTheory>);

#[wasm_bindgen]
impl ThSymMonoidalCategory {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_sym_monoidal_category()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }

    /// Simulates the mass-action ODE system derived from a model.
    #[wasm_bindgen(js_name = "massAction")]
    pub fn mass_action(
        &self,
        model: &DblModel,
        data: MassActionModelData,
    ) -> Result<ODEResult, String> {
        Ok(ODEResult(
            analyses::ode::PetriNetMassActionAnalysis::default()
                .build_numerical_system(model.modal()?, data.0)
                .solve_with_defaults()
                .map_err(|err| format!("{err:?}"))
                .into(),
        ))
    }
}

/// The theory of state/aux interactions
pub struct ThModalStateAuxCategory(Rc<theory::UstrModalDblTheory>);

#[wasm_bindgen]
impl ThModalStateAuxCategory {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_modal_sf()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }

    /// Simulates a mass-action ODE system with additional configurations.
    #[wasm_bindgen(js_name = "stateAuxMassAction")]
    pub fn state_aux_mass_action(
        &self,
        model: &DblModel,
        data: AnotherMassActionModelData,
    ) -> Result<_, String> {
        let model: &model::ModalDblModel<_, > = (&model.0).try_into().map_err(|_| "Model should be of a modal theory")?;
        Ok(())
    }

#[cfg(test)]
mod tests {
    use super::*;
    use notebook_types::current::theory::*;
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

    #[test]
    fn modal_theory() {
        let th = ThSymMonoidalCategory::new().theory();
        let x = ObType::Basic(ustr("Object"));
        let list_x = ObType::ModeApp {
            modality: Modality::SymmetricList,
            ob_type: x.clone().into(),
        };
        let tensor = ObOp::Basic(ustr("tensor"));
        assert_eq!(th.src(MorType::Hom(list_x.clone().into())), Ok(list_x.clone()));
        assert_eq!(th.dom(tensor.clone()), Ok(list_x));
        assert_eq!(th.cod(tensor), Ok(x));
    }
}
