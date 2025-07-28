use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

use std::{cell::RefCell, collections::HashMap, rc::Rc};

use ::notebook_types::v0::{ModelDocumentContent, ModelJudgment, notebook};
use catlog::{
    dbl::{category::VDblCategory, model::DiscreteDblModel, theory::UstrDiscreteDblTheory},
    one::{FgCategory, Path, UstrFpCategory},
};
use catlog_wasm::theory::DblTheory;
use notebook_types::current::{self as notebook_types};
use ustr::{Ustr, ustr};
use uuid::Uuid;
use web_sys::console;

use crate::{
    eval::{ClassLibrary, Env, State, TmVal, TyVal},
    name::{QualifiedName, Segment},
    syntax::{ClassIdent, MemberStx, ObType, TmStx, TyStx},
};


#[allow(unused)]
#[wasm_bindgen]
pub struct DblModelNext(Box<DiscreteDblModel<QualifiedName, UstrFpCategory>>);

#[wasm_bindgen]
impl DblModelNext {
    // This is currently used in the submodel_graphs analysis
    // /// Is the object contained in the model?
    // #[wasm_bindgen(js_name = "hasOb")]
    // pub fn has_ob(&self, ob: QualifiedName) -> Result<bool, String> {
    //     Ok(self.0.has_ob(&ob))
    // }

    // Used in submodel_graphs
    // /// Is the morphism contained in the model?
    // #[wasm_bindgen(js_name = "hasMor")]
    // pub fn has_mor(&self, mor: Mor) -> Result<bool, String> {
    //     all_the_same!(match &self.0 {
    //         DblModelBox::[Discrete, DiscreteTab](model) => {
    //             let mor = Elaborator.elab(&mor)?;
    //             Ok(model.has_mor(&mor))
    //         }
    //     })
    // }

    // This is never used
    //     /// Returns array of all basic objects in the model.
    //     #[wasm_bindgen]
    //     pub fn objects(&self) -> Vec<Ob> {
    //         all_the_same!(match &self.0 {
    //             DblModelBox::[Discrete, DiscreteTab](model) => model.objects().map(|x| Quoter.quote(&x)).collect()
    //         })
    //     }

    // This is never used
    //     /// Returns array of all basic morphisms in the model.
    //     #[wasm_bindgen]
    //     pub fn morphisms(&self) -> Vec<Mor> {
    //         all_the_same!(match &self.0 {
    //             DblModelBox::[Discrete, DiscreteTab](model) => model.morphisms().map(|f| Quoter.quote(&f)).collect()
    //         })
    //     }

    // This is used for completions
    //     /// Returns array of basic objects with the given type.
    //     #[wasm_bindgen(js_name = "objectsWithType")]
    //     pub fn objects_with_type(&self, ob_type: ObType) -> Result<Vec<Ob>, String> {
    //         all_the_same!(match &self.0 {
    //             DblModelBox::[Discrete, DiscreteTab](model) => {
    //                 let ob_type = Elaborator.elab(&ob_type)?;
    //                 Ok(model.objects_with_type(&ob_type).map(|ob| Quoter.quote(&ob)).collect())
    //             }
    //         })
    //     }

    // This is used for completions
    //     /// Returns array of basic morphisms with the given type.
    //     #[wasm_bindgen(js_name = "morphismsWithType")]
    //     pub fn morphisms_with_type(&self, mor_type: MorType) -> Result<Vec<Mor>, String> {
    //         all_the_same!(match &self.0 {
    //             DblModelBox::[Discrete, DiscreteTab](model) => {
    //                 let mor_type = Elaborator.elab(&mor_type)?;
    //                 Ok(model.morphisms_with_type(&mor_type).map(|mor| Quoter.quote(&mor)).collect())
    //             }
    //         })
    //     }

    // This is no longer relevant; validation happens before
    //     pub fn validate(&self) -> ModelValidationResult {
    //         all_the_same!(match &self.0 {
    //             DblModelBox::[Discrete, DiscreteTab](model) => {
    //                 let res = model.validate();
    //                 ModelValidationResult(res.map_err(|errs| errs.into()).into())
    //             }
    //         })
    //     }
}

#[wasm_bindgen]
pub fn elaborate(
    notebooks: RawNotebooks,
    notebook_id: String,
    theory: &DblTheory,
) -> Option<DblModelNext> {
    let theory = match &theory.0 {
        catlog_wasm::theory::DblTheoryBox::Discrete(t) => t,
        catlog_wasm::theory::DblTheoryBox::DiscreteTab(_) => panic!("tabulators unsupported"),
    };
    let cache = ElaborationCache::new(notebooks, theory.clone());
    let res = cache.lookup(&notebook_id);
    if let Some(nb) = res {
        let state = State::empty(Rc::new(cache), theory.clone());
        let evaluator = state.new_env();
        evaluator.intro_notebook(&QualifiedName::empty(), &nb);
        console::log_1(
            &format!(
                "{:?}",
                state
                    .neutrals
                    .borrow()
                    .ob_generators()
                    .map(|id| format!("{}", id))
                    .collect::<Vec<_>>()
            )
            .into(),
        );
        // TODO: shouldn't need a clone here
        Some(DblModelNext(Box::new(DiscreteDblModel::clone(&state.neutrals.borrow()))))
    } else {
        None
    }
}
