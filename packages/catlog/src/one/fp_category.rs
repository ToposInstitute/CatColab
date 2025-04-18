//! Finitely presented categories backed by e-graphs.

use egglog::{
    ast::{Command, Schema, Variant},
    span,
};

/// The theory of categories as an egglog program.
fn program_th_category() -> Vec<Command> {
    let (ob, mor) = ("Ob".into(), "Mor".into());
    let (ob_gen, mor_gen) = ("ObGen".into(), "MorGen".into());
    let (dom, cod) = ("dom".into(), "cod".into());
    let (id, compose) = ("id".into(), "compose".into());

    vec![
        Command::Datatype {
            span: span!(),
            name: ob,
            variants: vec![Variant {
                span: span!(),
                name: ob_gen,
                types: vec!["String".into()],
                cost: Some(0),
            }],
        },
        Command::Datatype {
            span: span!(),
            name: mor,
            variants: vec![Variant {
                span: span!(),
                name: mor_gen,
                types: vec!["String".into()],
                cost: Some(0),
            }],
        },
        Command::Constructor {
            span: span!(),
            name: dom,
            schema: Schema {
                input: vec![mor],
                output: ob,
            },
            cost: Some(1),
            unextractable: false,
        },
        Command::Constructor {
            span: span!(),
            name: cod,
            schema: Schema {
                input: vec![mor],
                output: ob,
            },
            cost: Some(1),
            unextractable: false,
        },
        Command::Constructor {
            span: span!(),
            name: id,
            schema: Schema {
                input: vec![ob],
                output: mor,
            },
            cost: Some(1),
            unextractable: false,
        },
        Command::Constructor {
            span: span!(),
            name: compose,
            schema: Schema {
                input: vec![mor, mor],
                output: mor,
            },
            cost: Some(1),
            unextractable: false,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use expect_test::expect;
    use itertools::Itertools;

    /// Format an egglog program as a string.
    fn format_program(prog: Vec<Command>) -> String {
        prog.into_iter().map(|command| command.to_string()).join("\n")
    }

    #[test]
    fn th_category() {
        let expected = expect![[r#"
            (datatype Ob (ObGen String :cost 0))
            (datatype Mor (MorGen String :cost 0))
            (constructor dom (Mor) Ob :cost 1)
            (constructor cod (Mor) Ob :cost 1)
            (constructor id (Ob) Mor :cost 1)
            (constructor compose (Mor Mor) Mor :cost 1)"#]];
        let prog = program_th_category();
        expected.assert_eq(&format_program(prog.clone()));

        let mut egraph: egglog::EGraph = Default::default();
        assert!(egraph.run_program(prog).is_ok());
    }
}
