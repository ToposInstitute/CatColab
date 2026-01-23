//! Wasm bindings for the standard library of theories in `catlog`.
//!
//! Each struct in this module provides a [`DblTheory`], possibly with additional
//! methods for theory-specific analyses.

use std::rc::Rc;

use wasm_bindgen::prelude::*;

use catlog::dbl::theory;
use catlog::one::Path;
use catlog::simulate::ode::{LatexEquation, PolynomialSystem};
use catlog::stdlib::{analyses, models, theories, theory_morphisms};
use catlog::zero::{QualifiedName, alg::Polynomial, name};

use super::model_morphism::{MotifOccurrence, MotifsOptions, motifs};
use super::result::JsResult;
use super::{analyses::*, model::DblModel, theory::DblTheory};

fn latex_with_labels(
    system: &PolynomialSystem<QualifiedName, Polynomial<QualifiedName, f32, i8>, i8>,
    model: &DblModel,
) -> Vec<LatexEquation> {
    let ob_name = |id: &QualifiedName| {
        let name = model
            .ob_generator_label(id)
            .map_or_else(|| id.to_string(), |label| label.to_string());

        if name.chars().count() > 1 {
            format!("\\text{{{name}}}")
        } else {
            name
        }
    };
    let mor_name = |id: &QualifiedName| {
        let name = model
            .mor_generator_label(id)
            .map_or_else(|| id.to_string(), |label| label.to_string());
        format!("r_{{\\text{{{name}}}}}")
    };

    system
        .map_variables(ob_name)
        .extend_scalars(|param| param.map_variables(mor_name))
        .to_latex_equations()
}

/// The empty or initial theory.
#[wasm_bindgen]
pub struct ThEmpty(Rc<theory::DiscreteDblTheory>);

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
pub struct ThCategory(Rc<theory::DiscreteDblTheory>);

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
    pub fn to_schema(boxed: &DblModel, th_schema: &DblTheory) -> Result<DblModel, String> {
        let (th, mut model) = (th_schema.discrete()?, boxed.discrete()?.as_ref().clone());
        model.push_forward(
            &theory_morphisms::th_category_to_schema().functor_into(&th.0),
            th.clone(),
        );
        Ok(boxed.replace_box(model.into()))
    }
}

/// The theory of database schemas with attributes.
#[wasm_bindgen]
pub struct ThSchema(Rc<theory::DiscreteDblTheory>);

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
    pub fn to_category(boxed: &DblModel, th_category: &DblTheory) -> Result<DblModel, String> {
        let (th, mut model) = (th_category.discrete()?, boxed.discrete()?.as_ref().clone());
        model.push_forward(
            &theory_morphisms::th_schema_to_category().functor_into(&th.0),
            th.clone(),
        );
        Ok(boxed.replace_box(model.into()))
    }
}

/// The theory of signed categories.
#[wasm_bindgen]
pub struct ThSignedCategory(Rc<theory::DiscreteDblTheory>);

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
    ) -> Result<Vec<MotifOccurrence>, String> {
        let positive_loop = models::positive_loop(self.0.clone());
        motifs(&positive_loop, model, options)
    }

    /// Find negative feedback loops in a model.
    #[wasm_bindgen(js_name = "negativeLoops")]
    pub fn negative_loops(
        &self,
        model: &DblModel,
        options: MotifsOptions,
    ) -> Result<Vec<MotifOccurrence>, String> {
        let negative_loop = models::negative_loop(self.0.clone());
        motifs(&negative_loop, model, options)
    }

    /// Simulate the Lotka-Volterra system derived from a model.
    #[wasm_bindgen(js_name = "lotkaVolterra")]
    pub fn lotka_volterra(
        &self,
        model: &DblModel,
        data: analyses::ode::LotkaVolterraProblemData,
    ) -> Result<ODEResult, String> {
        Ok(ODEResult(
            analyses::ode::SignedCoefficientBuilder::new(name("Object"))
                .add_positive(Path::Id(name("Object")))
                .add_negative(name("Negative").into())
                .lotka_volterra_analysis(model.discrete()?, data)
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
        data: analyses::ode::LinearODEProblemData,
    ) -> Result<ODEResult, String> {
        Ok(ODEResult(
            analyses::ode::SignedCoefficientBuilder::new(name("Object"))
                .add_positive(Path::Id(name("Object")))
                .add_negative(name("Negative").into())
                .linear_ode_analysis(model.discrete()?, data)
                .solve_with_defaults()
                .map_err(|err| format!("{err:?}"))
                .into(),
        ))
    }
}

/// The theory of delayable signed categories.
#[wasm_bindgen]
pub struct ThDelayableSignedCategory(Rc<theory::DiscreteDblTheory>);

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
    ) -> Result<Vec<MotifOccurrence>, String> {
        let positive_loop = models::positive_loop(self.0.clone());
        motifs(&positive_loop, model, options)
    }

    /// Find (fast) negative feedback loops in a model.
    #[wasm_bindgen(js_name = "negativeLoops")]
    pub fn negative_loops(
        &self,
        model: &DblModel,
        options: MotifsOptions,
    ) -> Result<Vec<MotifOccurrence>, String> {
        let negative_loop = models::negative_loop(self.0.clone());
        motifs(&negative_loop, model, options)
    }

    /// Find delayed positive feedback loops in a model.
    #[wasm_bindgen(js_name = "delayedPositiveLoops")]
    pub fn delayed_positive_loops(
        &self,
        model: &DblModel,
        options: MotifsOptions,
    ) -> Result<Vec<MotifOccurrence>, String> {
        let delayed_positive_loop = models::delayed_positive_loop(self.0.clone());
        motifs(&delayed_positive_loop, model, options)
    }

    /// Find delayed negative feedback loops in a model.
    #[wasm_bindgen(js_name = "delayedNegativeLoops")]
    pub fn delayed_negative_loops(
        &self,
        model: &DblModel,
        options: MotifsOptions,
    ) -> Result<Vec<MotifOccurrence>, String> {
        let delayed_negative_loop = models::delayed_negative_loop(self.0.clone());
        motifs(&delayed_negative_loop, model, options)
    }

    /// Sigma migrates a delayable signed category to a signed category.
    #[wasm_bindgen(js_name = "toSignedCategory")]
    pub fn to_signed_category(boxed: &DblModel, th: &DblTheory) -> Result<DblModel, String> {
        let (th, mut model) = (th.discrete()?, boxed.discrete()?.as_ref().clone());
        model.push_forward(
            &theory_morphisms::th_delayable_signed_category_to_signed_category()
                .functor_into(&th.0),
            th.clone(),
        );
        Ok(boxed.replace_box(model.into()))
    }
}

/// The theory of nullable signed categories.
#[wasm_bindgen]
pub struct ThNullableSignedCategory(Rc<theory::DiscreteDblTheory>);

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
pub struct ThCategoryWithScalars(Rc<theory::DiscreteDblTheory>);

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
pub struct ThCategoryLinks(Rc<theory::DiscreteTabTheory>);

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
        data: analyses::ode::MassActionProblemData,
    ) -> Result<ODEResultWithEquations, String> {
        let tab_model = model.discrete_tab()?;
        let analysis = analyses::ode::StockFlowMassActionAnalysis::default();
        let sys = analysis.build_system(tab_model);
        let latex_equations = latex_with_labels(&sys, model);
        let num_sys = analyses::ode::into_numerical_system(sys, data);
        let solution = num_sys.analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
        Ok(ODEResultWithEquations {
            solution: solution.into(),
            latex_equations,
        })
    }

    /// Returns the symbolic mass-action equations in LaTeX format.
    #[wasm_bindgen(js_name = "massActionEquations")]
    pub fn mass_action_equations(&self, model: &DblModel) -> Result<ODELatex, String> {
        let analysis = analyses::ode::StockFlowMassActionAnalysis::default();
        let tab_model = model.discrete_tab()?;
        let sys = analysis.build_system(tab_model);
        Ok(ODELatex(latex_with_labels(&sys, model)))
    }
}

/// The theory of categories with signed links.
#[wasm_bindgen]
pub struct ThCategorySignedLinks(Rc<theory::DiscreteTabTheory>);

#[wasm_bindgen]
impl ThCategorySignedLinks {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_category_signed_links()))
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
        data: analyses::ode::MassActionProblemData,
    ) -> Result<ODEResultWithEquations, String> {
        let tab_model = model.discrete_tab()?;
        let analysis = analyses::ode::StockFlowMassActionAnalysis::default();
        let sys = analysis.build_system(tab_model);
        let latex_equations = latex_with_labels(&sys, model);
        let num_sys = analyses::ode::into_numerical_system(sys, data);
        let solution = num_sys.analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
        Ok(ODEResultWithEquations {
            solution: solution.into(),
            latex_equations,
        })
    }

    /// Returns the symbolic mass-action equations in LaTeX format.
    #[wasm_bindgen(js_name = "massActionEquations")]
    pub fn mass_action_equations(&self, model: &DblModel) -> Result<ODELatex, String> {
        let analysis = analyses::ode::StockFlowMassActionAnalysis::default();
        let tab_model = model.discrete_tab()?;
        let sys = analysis.build_system(tab_model);
        Ok(ODELatex(latex_with_labels(&sys, model)))
    }
}

/// The theory of strict symmetric monoidal categories.
#[wasm_bindgen]
pub struct ThSymMonoidalCategory(Rc<theory::ModalDblTheory>);

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
        data: analyses::ode::MassActionProblemData,
    ) -> Result<ODEResultWithEquations, String> {
        let modal_model = model.modal()?;
        let analysis = analyses::ode::PetriNetMassActionAnalysis::default();
        let sys = analysis.build_system(modal_model.as_ref());
        let latex_equations = latex_with_labels(&sys, model);
        let num_sys = analyses::ode::into_numerical_system(sys, data);
        let solution = num_sys.analysis.solve_with_defaults().map_err(|err| format!("{err:?}"));
        Ok(ODEResultWithEquations {
            solution: solution.into(),
            latex_equations,
        })
    }

    /// Returns the symbolic mass-action equations in LaTeX format.
    #[wasm_bindgen(js_name = "massActionEquations")]
    pub fn mass_action_equations(&self, model: &DblModel) -> Result<ODELatex, String> {
        let analysis = analyses::ode::PetriNetMassActionAnalysis::default();
        let modal_model = model.modal()?;
        let sys = analysis.build_system(modal_model.as_ref());
        Ok(ODELatex(latex_with_labels(&sys, model)))
    }

    /// Simulates the stochastic mass-action system derived from a model.
    #[wasm_bindgen(js_name = "stochasticMassAction")]
    pub fn stochastic_mass_action(
        &self,
        model: &DblModel,
        data: analyses::ode::MassActionProblemData,
    ) -> Result<ODEResult, String> {
        Ok(ODEResult(JsResult::Ok(
            analyses::ode::PetriNetMassActionAnalysis::default()
                .build_stochastic_system(model.modal()?, data)
                .simulate(),
        )))
    }

    /// Solve the subreachability problem for petri nets.
    #[wasm_bindgen(js_name = "subreachability")]
    pub fn subreachability(
        &self,
        model: &DblModel,
        data: analyses::reachability::ReachabilityProblemData,
    ) -> Result<bool, String> {
        let model = model.modal().map_err(|_| "Model should be of a modal theory")?;
        Ok(analyses::reachability::subreachability(model, data))
    }
}

/// A theory of power systems.
#[wasm_bindgen]
pub struct ThPowerSystem(Rc<theory::DiscreteDblTheory>);

#[wasm_bindgen]
impl ThPowerSystem {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Rc::new(theories::th_power_system()))
    }

    #[wasm_bindgen]
    pub fn theory(&self) -> DblTheory {
        DblTheory(self.0.clone().into())
    }

    /// Simulates the Kuramoto system derived from a model.
    #[wasm_bindgen]
    pub fn kuramoto(
        &self,
        model: &DblModel,
        data: &analyses::ode::KuramotoProblemData,
    ) -> Result<ODEResult, String> {
        Ok(ODEResult(
            analyses::ode::KuramotoAnalysis::new(name("Bus"))
                // Should we distinguish between lines and transformers?
                .add_link_type(Path::empty(name("Bus")))
                .add_link_type(Path::single(name("Passive")))
                .build_system(model.discrete()?, data)
                .solve_with_defaults()
                .map_err(|err| format!("{err:?}"))
                .into(),
        ))
    }
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
