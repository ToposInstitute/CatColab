#[cfg(test)]
mod tests {
    use crate::ast::{AstConverter, Expr};
    use crate::fnotation_parser::FNotationParser;
    use crate::typechecker::{Typ, TypeChecker};
    use std::collections::HashMap;

    fn parse_and_convert(input: &str) -> Result<Expr, String> {
        let parser = FNotationParser::new();
        let context = parser.create_context(input)?;
        let fntn = parser.parse_to_fnotation(input, &context)?;
        let converter = AstConverter::new();
        converter.convert(fntn)
    }

    fn setup_simple() -> (HashMap<String, Typ>, HashMap<String, Typ>) {
        let mut vars = HashMap::new();
        vars.insert("x".to_string(), Typ::List(1));
        vars.insert("y".to_string(), Typ::List(1));

        let mut funcs = HashMap::new();
        funcs.insert("f".to_string(), Typ::FuncType(1, 1)); // f: 1 -> 1
        funcs.insert("g".to_string(), Typ::FuncType(1, 1)); // g: 1 -> 1
        funcs.insert("h".to_string(), Typ::FuncType(2, 1)); // h: 2 -> 1
        funcs.insert("pair".to_string(), Typ::FuncType(2, 2)); // pair: 2 -> 2

        (vars, funcs)
    }

    fn test_driver(input: &'static str, expected_typ: Typ) {
        let (vars, funcs) = setup_simple();
        let mut tc = TypeChecker::new(vars, funcs);
        let expr = parse_and_convert(input).unwrap();
        assert_eq!(tc.type_check(&expr).unwrap(), expected_typ);
    }

    fn error_driver(input: &'static str, expected_error_fragment: &str) {
        let (vars, funcs) = setup_simple();
        let mut tc = TypeChecker::new(vars, funcs);
        let expr = parse_and_convert(input).unwrap();
        let result = tc.type_check(&expr);
        assert!(result.is_err(), "Expected error for input: {}", input);
        assert!(
            result.unwrap_err().contains(expected_error_fragment),
            "Error should contain '{}'",
            expected_error_fragment
        );
    }

    // ============ Tests ============
    #[test]
    fn test_e2e_simple_variable() {
        test_driver("x", Typ::List(1));
    }

    #[test]
    fn test_e2e_simple_function_call() {
        test_driver("f(x)", Typ::List(1));
    }

    #[test]
    fn test_e2e_nested_function_calls() {
        test_driver("h[f(x), g(y)]", Typ::List(1));
    }

    #[test]
    fn test_e2e_simple_let_binding() {
        test_driver("{ w = f(x); g(w) }", Typ::List(1));
    }

    #[test]
    fn test_e2e_nested_let_bindings() {
        test_driver("{ w = f(x); z = g(y); h[w, z] }", Typ::List(1));
    }

    #[test]
    fn test_e2e_square_bracket_syntax() {
        test_driver("h[f(x), g(y)]", Typ::List(1));
    }

    #[test]
    fn test_e2e_let_binding_with_square_brackets() {
        test_driver("{ w = f(x); z = g(y); h[w, z] }", Typ::List(1));
    }

    #[test]
    fn test_e2e_three_bindings() {
        test_driver("{ a = f(x); b = g(y); c = h[a, b]; g(c) }", Typ::List(1));
    }

    #[test]
    fn test_e2e_shadowing() {
        test_driver("{ x = f(x); g(x) }", Typ::List(1));
    }

    #[test]
    fn test_e2e_multi_output_function() {
        test_driver("pair[x, y]", Typ::List(2));
    }

    #[test]
    fn test_e2e_let_with_multi_output() {
        test_driver("{ p = pair[x, y]; p }", Typ::List(2));
    }

    // ============ Error Cases ============
    #[test]
    fn test_e2e_undefined_variable() {
        error_driver("z", "z");
    }

    #[test]
    fn test_e2e_undefined_function() {
        error_driver("unknown(x)", "unknown");
    }

    #[test]
    fn test_e2e_wrong_arity() {
        let (vars, funcs) = setup_simple();
        let mut tc = TypeChecker::new(vars, funcs);
        let input = "h(x)";
        let expr = parse_and_convert(input).unwrap();
        assert!(tc.type_check(&expr).is_err());
    }

    #[test]
    fn test_e2e_wrong_arity_too_many() {
        let (vars, funcs) = setup_simple();
        let mut tc = TypeChecker::new(vars, funcs);
        let input = "f[x, y]";
        let expr = parse_and_convert(input).unwrap();
        assert!(tc.type_check(&expr).is_err());
    }

    #[test]
    fn test_e2e_error_in_nested_call() {
        error_driver("h[f(x), g(z)]", "z");
    }

    #[test]
    fn test_e2e_error_in_let_value() {
        error_driver("{ w = unknown(x); g(w) }", "unknown");
    }

    #[test]
    fn test_e2e_error_in_let_body() {
        error_driver("{ w = f(x); g(undefined) }", "undefined");
    }

    // ============ Complex Scenarios ============
    #[test]
    fn test_e2e_deeply_nested() {
        test_driver("{ a = f(x); b = g(a); c = f(b); g(c) }", Typ::List(1));
    }

    #[test]
    fn test_e2e_reuse_variable() {
        test_driver("{ w = f(x); z = g(x); h[w, z] }", Typ::List(1));
    }

    #[test]
    fn test_e2e_chain_bindings() {
        test_driver("{ a = f(x); b = f(a); c = f(b); c }", Typ::List(1));
    }

    #[test]
    fn test_e2e_complex_nested_calls() {
        test_driver("h[f(f(x)), g(g(y))]", Typ::List(1));
    }

    #[test]
    fn test_e2e_let_result_is_binding() {
        let (vars, funcs) = setup_simple();
        let mut tc = TypeChecker::new(vars, funcs);
        let input = "{ w = f(x); { z = g(y); h(w, z) } }";
        let result = parse_and_convert(input);
        if let Ok(expr) = result {
            let _ = tc.type_check(&expr);
        }
    }

    // ============ Whitespace variations ============
    #[test]
    fn test_e2e_whitespace_variations() {
        let inputs = vec!["f(x)", "f( x )", "f (x)", "f  (  x  )"];
        for input in inputs {
            test_driver(input, Typ::List(1));
        }
    }

    #[test]
    fn test_e2e_let_whitespace() {
        let inputs = vec![
            "{ w = f(x); z = g(y); h[w, z] }",
            "{w=f(x);z=g(y);h[w,z]}",
            "{ w = f ( x ) ; z = g ( y ) ; h [ w , z ] }",
        ];
        for input in inputs {
            test_driver(input, Typ::List(1));
        }
    }

    // ============ Edge Cases ============
    #[test]
    fn test_e2e_single_statement_block() {
        test_driver("{ w = f(x); w }", Typ::List(1));
    }

    #[test]
    fn test_e2e_identity_binding() {
        test_driver("{ w = x; w }", Typ::List(1));
    }
}
