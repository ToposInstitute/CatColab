/*! Wasm bindings for double theories from the `catlog` standard library.

Each struct in this module provides a [`DblTheory`] plus possibly
theory-specific analysis methods.
 */

use std::collections::HashMap;
use std::rc::Rc;

use ustr::ustr;
use wasm_bindgen::prelude::*;

use catlog::dbl::model::{FgDblModel, MutDblModel};
use catlog::dbl::{model, theory};
use catlog::one::{FgCategory, Path};
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
        let model: &model::DiscreteDblModel<_, _> = (&model.0)
            .try_into()
            .map_err(|_| "Linear ODE simulation expects a discrete double model")?;
        Ok(ODEResult(
            analyses::ode::LinearODEAnalysis::new(ustr("Object"))
                .add_positive(Path::Id(ustr("Object")))
                .add_negative(ustr("Negative").into())
                .create_system(model, data.0)
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
}

/// The theory of (N x N)-graded signed categories (for ECLDs).
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

    // TO-DO: this could likely be moved to graph_algorithms.rs
    // Just used within cll() to find the depth of a vertex within the forest
    // of degree-zero arrows
    fn get_depth(
        x: uuid::Uuid,
        vertex_depths_in_zero_forest: &mut HashMap<uuid::Uuid, DAGDepth>,
        in_zeros: &HashMap<uuid::Uuid, Vec<(uuid::Uuid, uuid::Uuid)>>,
    ) -> usize {
        let n = match vertex_depths_in_zero_forest.get(&x).expect("magpie") {
            DAGDepth::Seen => {
                // TO-DO: this should just raise an error in the analysis pane
                //        (return a JS result)
                panic!("a degree zero loop found containing {:?}", x)
            }
            DAGDepth::Depth(d) => *d,
            DAGDepth::Undef => {
                // Recursively compute depths for all incoming arrows
                vertex_depths_in_zero_forest.insert(x, DAGDepth::Seen);
                let depth = in_zeros
                    .get(&x)
                    .expect("dunlin")
                    .iter()
                    .map(|&(_, y)| 1 + Self::get_depth(y, vertex_depths_in_zero_forest, in_zeros))
                    .max()
                    .unwrap_or(0usize);
                vertex_depths_in_zero_forest.insert(x, DAGDepth::Depth(depth));
                depth
            }
        };
        n
    }

    /// Simulate the CCL system derived from a model.
    #[wasm_bindgen(js_name = "ccl")]
    pub fn ccl(&self, model: &DblModel, data: CCLModelData) -> Result<ODEResult, String> {
        let model: &model::DiscreteDblModel<_, _> = (&model.0)
            .try_into()
            .map_err(|_| "CCL simulation expects a discrete double model")?;

        let mut debug_log = String::new();
        debug_log.push_str("ECLD to CLD migration for CCL dynamics\n\n");

        fn fresh_uuid() -> uuid::Uuid {
            uuid::Uuid::now_v7()
        }

        // Some helper closures
        let get_cod = |f| *model.get_cod(&f).unwrap();
        let get_dom = |f| *model.get_dom(&f).unwrap();
        let mor_deg = |f: &uuid::Uuid| {
            model.mor_generator_type(f).into_iter().filter(|t| *t == ustr("Degree")).count()
        };
        let mor_sign = |f: &uuid::Uuid| {
            model
                .mor_generator_type(f)
                .into_iter()
                .filter(|t| *t == ustr("Negative"))
                .count()
                % 2
        };

        // TO-DO: move this to a new module: catlog/src/stdlib/ecld

        // 0. Pre-processing the model: creating new objects for each derivative
        //    and lifting all morphisms to be degree 1. We will end up creating
        //    a CLD corresponding to our ECLD, where we interpret all arrows *of
        //    positive degree* in our CLD as being morphisms of degree 1; we
        //    will also *separately* retain the data of the forest of
        //    degree-zero arrows
        let mut cld_model: model::DiscreteDblModel<uuid::Uuid, _> =
            model::DiscreteDblModel::new(Rc::new(theories::th_signed_category()));

        // tower_heights: [base object: height of corresponding tower]
        // in_arrows: [target: [morphisms with this target]]
        // in_zeros: [target: [(deg-zero morphism with this target, source)]]
        // vertex_depths_in_zero_forest: [vertex: depth (as a DAGDepth) in the deg-zero forest]
        // degree_zeros_with_depth: [vertex: depth (as an integer) in the deg-zero forest]
        let mut tower_heights = HashMap::new();
        let mut in_arrows = HashMap::new();
        let mut in_zeros = HashMap::new();
        let mut vertex_depths_in_zero_forest = HashMap::new();
        let mut degree_zeros_with_depth = HashMap::new();

        // Initialising the above variables (apart from degree_zeros_with_depth,
        // which will be created right at the end)
        for x in model.ob_generators() {
            tower_heights.insert(x, 1);
            in_arrows.insert(x, Vec::new());
            in_zeros.insert(x, Vec::new());
            vertex_depths_in_zero_forest.insert(x, DAGDepth::Undef);
        }

        // We have yet to build any of the towers, so every base is "unchecked"
        let mut unchecked_bases: Vec<uuid::Uuid> =
            model.ob_generators().collect::<Vec<_>>().clone();

        // 1. First pass, calculating maximal incoming degree for each base
        for f in model.mor_generators() {
            let degree = mor_deg(&f);
            let f_cod = get_cod(f);

            if degree == 0 {
                in_zeros.get_mut(&f_cod).expect("shrike").push((f, get_dom(f)));
            } else {
                let new_degree =
                    std::cmp::max(*tower_heights.get(&f_cod).expect("currawong"), degree);
                tower_heights.insert(f_cod, new_degree);

                // While we're here, we might as well also...
                in_arrows.get_mut(&f_cod).expect("coot").push(f);
            }
        }

        // 2. If a tower isn't big enough, we will need to add more floors
        fn update_tower(x: &uuid::Uuid, h: usize, tower: &mut HashMap<uuid::Uuid, usize>) {
            let current_height = tower.get(&x).expect("chaffinch");
            if h > *current_height {
                tower.insert(*x, h);
            }
            return;
        }
        // Iterate over all unchecked bases, starting with (one of) the one(s)
        // with greatest current height
        while !unchecked_bases.is_empty() {
            unchecked_bases.sort_by(|x, y| {
                let height = |base| tower_heights.get(base).expect("gosling");
                // we want to sort small to big, so we can pop later on
                height(y).cmp(height(x))
            });

            let current_base = unchecked_bases.pop().expect("emu");
            let current_height = tower_heights.get(&current_base).expect("lorikeet").clone();
            for f in in_arrows.get(&current_base).expect("cygnet") {
                update_tower(
                    model.get_dom(&f).expect("rosella"),
                    current_height - mor_deg(f) + 1,
                    &mut tower_heights,
                );
            }
        }

        // 3. Now we actually build the towers of derivatives for each variable
        let mut derivative_towers: HashMap<uuid::Uuid, Vec<uuid::Uuid>> = HashMap::new();
        for (x, h) in tower_heights.iter_mut() {
            debug_log.push_str(&format!("BUILDING TOWER FOR OBJECT {x} OF HEIGHT {h}\n\n"));
            // First of all, we add the object from our original model
            derivative_towers.insert(*x, vec![*x]);
            cld_model.add_ob(*x, ustr("Object"));
            // Now let's build our tower of formal derivatives for the object
            for i in 1..*h {
                let x_i = fresh_uuid();
                cld_model.add_ob(x_i, ustr("Object"));
                let &x_iminusone =
                    derivative_towers.get(&x).expect("peahen").last().expect("warbler");
                cld_model.add_mor(fresh_uuid(), x_i, x_iminusone, Path::Id(ustr("Object")));
                derivative_towers.get_mut(&x).expect("brolga").push(x_i);
                debug_log.push_str(&format!("ADDING NEW OBJECT {x_i} AT FLOOR {i}\n\n"));
            }
        }

        // 4. Lift all (positive-degree) morphisms to have codomain as the top
        //    degree of the tower above their current codomain, and then add
        //    them to the CLD model
        for (x, x_tower) in derivative_towers.iter() {
            debug_log.push_str("LIFTING ALL MORPHISMS\n\n");
            // TO-DO: rewrite this to be not terrible
            let arrows_into_x = in_arrows.get(&x).expect("auk");
            for f in arrows_into_x {
                debug_log.push_str("LIFTING MORPHISM {f} WITH TARGET {x}\n\n");
                let d = mor_deg(f);
                let dom = model.get_dom(f).expect("robin");
                let dom_tower = derivative_towers.get(dom).expect("penguin");
                let h = tower_heights.get(x).expect("gull");
                let new_dom = dom_tower[h - d];
                let &new_cod = x_tower.last().expect("pelican");
                match mor_sign(f) {
                    0 => cld_model.add_mor(*f, new_dom, new_cod, Path::Id(ustr("Object"))),
                    1 => cld_model.add_mor(*f, new_dom, new_cod, ustr("Negative").into()),
                    _ => panic!("somehow an integer was found to be neither odd nor even"),
                }
                debug_log.push_str(&format!(
                    "ADDING MORPHISM {f} OF DEGREE {d}\nFROM {new_dom} TO {new_cod}\n\n"
                ));
            }
        }

        // 5. Compute the depths of all the degree-zero arrows (or, really,
        //    of their targets)
        for x in model.ob_generators() {
            // WARNING: side effects
            let depth = Self::get_depth(x, &mut vertex_depths_in_zero_forest, &in_zeros);
            // for &(f, _) in in_zeros.get(&x).expect("dove") {
            degree_zeros_with_depth.insert(x, depth);
            // }
        }

        // 6. Pass everything (the CLD, the degree-zero arrows and their depths,
        //    and the data from the analysis user inputs) into the ODE solver
        Ok(ODEResult(
            analyses::ode::CCLAnalysis::new(ustr("Object"))
                .add_positive(Path::Id(ustr("Object")))
                .add_negative(ustr("Negative").into())
                .create_system(&cld_model, &in_zeros, degree_zeros_with_depth, data.0)
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
                .map_err(|err| format!("{err:?}"))
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
