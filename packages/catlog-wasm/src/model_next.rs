use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fmt::Write};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

use catlog::{
    dbl::model::{DiscreteDblModel, FgDblModel},
    one::{FgCategory, Path, UstrFpCategory},
    zero::name::QualifiedName,
};

use crate::theory;

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ObGenerator {
    name: QualifiedName,
    ob_type: theory::ObType,
}

impl ObGenerator {
    pub fn new(name: QualifiedName, ob_type: theory::ObType) -> Self {
        ObGenerator { name, ob_type }
    }
}

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MorGenerator {
    name: QualifiedName,
    mor_type: theory::MorType,
    dom: QualifiedName,
    cod: QualifiedName,
}

impl MorGenerator {
    pub fn new(
        name: QualifiedName,
        mor_type: theory::MorType,
        dom: QualifiedName,
        cod: QualifiedName,
    ) -> Self {
        MorGenerator {
            name,
            mor_type,
            dom,
            cod,
        }
    }
}

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ObGenerators {
    classes: HashMap<String, (theory::ObType, Vec<QualifiedName>)>,
    lookup: HashMap<String, String>,
}

impl ObGenerators {
    fn new() -> ObGenerators {
        ObGenerators {
            classes: HashMap::new(),
            lookup: HashMap::new(),
        }
    }
}

#[wasm_bindgen]
pub struct DblModelNext {
    #[wasm_bindgen(skip)]
    pub model: DiscreteDblModel<QualifiedName, UstrFpCategory>,
}

impl DblModelNext {
    pub fn new(model: DiscreteDblModel<QualifiedName, UstrFpCategory>) -> Self {
        DblModelNext { model }
    }
}

#[wasm_bindgen]
impl DblModelNext {
    #[wasm_bindgen]
    pub fn show(&self) -> String {
        let mut out = String::new();
        for ob in self.model.ob_generators() {
            writeln!(&mut out, "{}", ob).unwrap();
        }
        for mor in self.model.mor_generators() {
            writeln!(&mut out, "{}", mor).unwrap();
        }
        out
    }

    #[wasm_bindgen]
    pub fn ob_generators(&self) -> ObGenerators {
        let mut g = ObGenerators::new();
        for x in self.model.ob_generators() {
            let v = self.model.object_value(x.clone());
            let name = format!("{}", v.bits);
            let class = g
                .classes
                .entry(name.clone())
                .or_insert((theory::ObType::Basic(self.model.ob_generator_type(&x)), Vec::new()));
            class.1.push(x.clone());
            g.lookup.insert(x.clone().stable_name(), name);
        }
        g
    }

    #[wasm_bindgen]
    pub fn mor_generators(&self) -> Vec<MorGenerator> {
        self.model
            .mor_generators()
            .map(|n| {
                let src = self.model.mor_generator_dom(&n);
                let tgt = self.model.mor_generator_cod(&n);
                let mor_type = match self.model.mor_generator_type(&n) {
                    Path::Id(ob) => theory::MorType::Hom(Box::new(theory::ObType::Basic(ob))),
                    Path::Seq(morphisms) => theory::MorType::Composite(
                        morphisms.iter().map(|f| theory::MorType::Basic(*f)).collect(),
                    ),
                };
                MorGenerator::new(n.clone(), mor_type, src, tgt)
            })
            .collect()
    }
}
