use catlog::dbl::model::{DblModel, MutDblModel, UstrDiscreteDblModel};
use catlog::dbl::theory::DiscreteDblTheory;
use catlog::one::fp_category::UstrFpCategory;
use catlog::one::{FgCategory, Path};
use catlog::validate::Validate;
use std::rc::Rc;
use ustr::ustr;

fn main() {
    // 1. Create a simple theory (basic category with one object type)
    let mut cat = UstrFpCategory::default();
    cat.add_ob_generator(ustr("Object"));
    let theory = Rc::new(DiscreteDblTheory::from(cat));

    // 2. Create a model with two objects and a morphism
    let mut model = UstrDiscreteDblModel::new(theory);

    // Add objects
    let x = ustr("x");
    let y = ustr("y");
    model.add_ob(x, ustr("Object"));
    model.add_ob(y, ustr("Object"));

    // Add morphism from x to y
    model.add_mor(ustr("f"), x, y, Path::Id(ustr("Object")));

    // Validate the model
    if model.validate().is_ok() {
        println!("Created a valid model with a morphism from x to y");
    }

    for ob in model.objects() {
        println!("Object: {:?}, type: {:?}", ob, model.ob_type(&ob));
    }

    for mor in model.morphisms() {
        println!("Morphism: {:?}, type: {:?}", mor, model.mor_type(&mor));
    }
}
