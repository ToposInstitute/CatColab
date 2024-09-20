/*! Wasm bindings for double theories from the `catlog` standard library.

Each struct in this modules provides a [`DblTheory`] plus possibly
theory-specific analysis methods.
 */

use std::sync::Arc;

use ustr::ustr;
use wasm_bindgen::prelude::*;

use catlog::dbl::{model::DiscreteDblModel, theory};
use catlog::one::fin_category::FinMor;
use catlog::stdlib::{analyses, models, theories};

use super::model_morphism::motifs;
use super::{analyses::*, model::DblModel, theory::DblTheory};

/// The theory of categories.
#[wasm_bindgen]
pub struct ThCategory(Arc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThCategory {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Arc::new(theories::th_category()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        self.0.clone().into()
    }
}

/// The theory of database schemas with attributes.
#[wasm_bindgen]
pub struct ThSchema(Arc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThSchema {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Arc::new(theories::th_schema()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        self.0.clone().into()
    }
}

/// The theory of signed categories.
#[wasm_bindgen]
pub struct ThSignedCategory(Arc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThSignedCategory {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Arc::new(theories::th_signed_category()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        self.0.clone().into()
    }

    /// Find positive feedback loops in a model.
    #[wasm_bindgen(js_name = "positiveLoops")]
    pub fn positive_loops(&self, model: &DblModel) -> Result<Vec<DblModel>, String> {
        let positive_loop = models::positive_loop(self.0.clone());
        motifs(&positive_loop, model)
    }

    /// Find negative feedback loops in a model.
    #[wasm_bindgen(js_name = "negativeLoops")]
    pub fn negative_loops(&self, model: &DblModel) -> Result<Vec<DblModel>, String> {
        let negative_loop = models::negative_loop(self.0.clone());
        motifs(&negative_loop, model)
    }

    /// Simulate Lotka-Volterra system derived from a model.
    #[wasm_bindgen(js_name = "lotkaVolterra")]
    pub fn lotka_volterra(
        &self,
        model: &DblModel,
        data: LotkaVolterraModelData,
    ) -> Result<ODEModelResult, String> {
        let model: &DiscreteDblModel<_, _> = model.try_into()?;
        analyses::ode::LotkaVolterraAnalysis::new(ustr("Object"))
            .add_positive(FinMor::Id(ustr("Object")))
            .add_negative(FinMor::Generator(ustr("Negative")))
            .solve(model, data.0)
            .map(ODEModelResult)
            .map_err(|err| format!("Integration error: {:?}", err))
    }
}

/// The theory of nullable signed categories.
#[wasm_bindgen]
pub struct ThNullableSignedCategory(Arc<theory::UstrDiscreteDblTheory>);

#[wasm_bindgen]
impl ThNullableSignedCategory {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Arc::new(theories::th_nullable_signed_category()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        self.0.clone().into()
    }
}

/// The theory of categories with links.
#[wasm_bindgen]
pub struct ThCategoryLinks(Arc<theory::UstrDiscreteTabTheory>);

#[wasm_bindgen]
impl ThCategoryLinks {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Arc::new(theories::th_category_links()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        self.0.clone().into()
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
