//! Tests for models checked against various theories.

#[cfg(test)]
mod tests {
    use crate::mtt;

    fn init_tracing() {
        use tracing_subscriber::prelude::*;
        use tracing_tree::HierarchicalLayer;
        let _ = tracing_subscriber::registry()
            .with(HierarchicalLayer::new(2).with_targets(false).with_bracketed_fields(true))
            .try_init();
    }

    fn check(src: &str) {
        mtt::check(src).unwrap_or_else(|e| panic!("{e}"));
    }

    // -------------------------------------------------------------------------
    // Monoid over Multicategory

    #[test]
    fn test_monoid() {
        init_tracing();
        check(
            r#"
impl Monoid for Multicategory {
    const X : Object;
    const op : [X, X] -> X;
    const unit : [] -> X;

    rel assoc([x, y, z] : [X, X, X]) -> X {
        op([op([x,y]), z]) == op([x, op([y, z])])
    }

    rel leftId([x] : [X]) -> X {
        op([unit([]), x]) == x
    }

    rel rightId([x] : [X]) -> X {
        x == op([x, unit([])])
    }
}
        "#,
        );
    }

    // -------------------------------------------------------------------------
    // LeftDistributiveBinaryOp over CartesianMulticategory

    #[test]
    fn test_left_distributive() {
        init_tracing();
        check(
            r#"
impl LeftDistributiveBinaryOp for CartesianMulticategory {
    const R : Object;
    const mul : [R, R] -> R;
    const add : [R, R] -> R;

    rel left_distrib([r, x, y] : [R, R, R]) -> R {
        mul([r, add([x, y])]) == add([mul([r, x]), mul([r, y])])
    }
}
        "#,
        );
    }

    // -------------------------------------------------------------------------
    // Schema

    #[test]
    fn test_schema() {
        init_tracing();
        check(
            r#"
impl PeopleAndDogs for Schema {
    const String : AttrType;
    const Person : Entity;
    const Dog : Entity;
    const first_name : Person -> String;
    const last_name : Person -> String;
    const owner : Dog -> Person;

    fn owners_first_name(d : Dog) -> String {
        first_name(owner(d))
    }
}
        "#,
        );
    }
}
