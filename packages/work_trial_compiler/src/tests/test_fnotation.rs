#[cfg(test)]
mod tests {
    use crate::fnotation_parser::FNotationParser;
    use fnotation::{FNtn, FNtn0};

    // Helper function to reduce boilerplate
    fn with_parsed<F, R>(input: &str, f: F) -> R
    where
        F: for<'a> FnOnce(&'a FNtn<'a>) -> R,
    {
        let parser = FNotationParser::new();
        let context = parser.create_context(input).unwrap();
        let result = parser.parse_to_fnotation(input, &context).unwrap();
        f(result)
    }

    // Helper for tests that expect errors
    fn expect_error(input: &str) -> bool {
        let parser = FNotationParser::new();
        let context_result = parser.create_context(input);
        if let Ok(context) = context_result {
            parser.parse_to_fnotation(input, &context).is_err()
        } else {
            true
        }
    }

    #[test]
    fn test_parse_simple_variable() {
        with_parsed("x", |result| match result.ast0() {
            FNtn0::Var(name) => {
                assert_eq!(*name, "x");
            }
            _ => panic!("Expected Var, got {:?}", result.ast0()),
        });
    }

    #[test]
    fn test_parse_function_single_arg() {
        with_parsed("f(x)", |result| {
            // f(x) in fnotation is: App1(f, x)
            match result.ast0() {
                FNtn0::App1(func, arg) => {
                    // func should be Var("f")
                    match func.ast0() {
                        FNtn0::Var(name) => assert_eq!(*name, "f"),
                        _ => panic!("Expected function name to be Var"),
                    }

                    // arg should be Var("x")
                    match arg.ast0() {
                        FNtn0::Var(name) => assert_eq!(*name, "x"),
                        _ => panic!("Expected argument to be Var"),
                    }
                }
                _ => panic!("Expected App1, got {:?}", result.ast0()),
            }
        });
    }

    #[test]
    fn test_parse_square_bracket_syntax() {
        with_parsed("h[f(x), g(y)]", |result| {
            // h[...] is the same as h(...)
            match result.ast0() {
                FNtn0::App1(func, arg) => {
                    match func.ast0() {
                        FNtn0::Var(name) => assert_eq!(*name, "h"),
                        _ => panic!("Expected h"),
                    }
                    match arg.ast0() {
                        FNtn0::Tuple(_) => {} // Success
                        _ => panic!("Expected Tuple"),
                    }
                }
                _ => panic!("Expected App1"),
            }
        });
    }

    #[test]
    fn test_parse_block_with_bindings() {
        with_parsed("{ w = f(x); z = g(y); h[w, z] }", |result| {
            // Should be Block([w = f(x), z = g(y)], Some(h(w, z)))
            match result.ast0() {
                FNtn0::Block(stmts, result) => {
                    assert_eq!(stmts.len(), 2);

                    // First statement: w = f(x)
                    match stmts[0].ast0() {
                        FNtn0::App2(op, left, right) => {
                            match op.ast0() {
                                FNtn0::Keyword(k) => assert_eq!(*k, "="),
                                _ => panic!("Expected = keyword"),
                            }
                            match left.ast0() {
                                FNtn0::Var(name) => assert_eq!(*name, "w"),
                                _ => panic!("Expected w"),
                            }
                            match right.ast0() {
                                FNtn0::App1(f, x) => {
                                    match f.ast0() {
                                        FNtn0::Var(name) => assert_eq!(*name, "f"),
                                        _ => panic!("Expected f"),
                                    }
                                    match x.ast0() {
                                        FNtn0::Var(name) => assert_eq!(*name, "x"),
                                        _ => panic!("Expected x"),
                                    }
                                }
                                _ => panic!("Expected App1 for f(x)"),
                            }
                        }
                        _ => panic!("Expected App2 for assignment"),
                    }

                    // Second statement: z = g(y)
                    match stmts[1].ast0() {
                        FNtn0::App2(op, left, right) => {
                            match op.ast0() {
                                FNtn0::Keyword(k) => assert_eq!(*k, "="),
                                _ => panic!("Expected = keyword"),
                            }
                            match left.ast0() {
                                FNtn0::Var(name) => assert_eq!(*name, "z"),
                                _ => panic!("Expected z"),
                            }
                            match right.ast0() {
                                FNtn0::App1(g, y) => {
                                    match g.ast0() {
                                        FNtn0::Var(name) => assert_eq!(*name, "g"),
                                        _ => panic!("Expected g"),
                                    }
                                    match y.ast0() {
                                        FNtn0::Var(name) => assert_eq!(*name, "y"),
                                        _ => panic!("Expected y"),
                                    }
                                }
                                _ => panic!("Expected App1 for g(y)"),
                            }
                        }
                        _ => panic!("Expected App2 for assignment"),
                    }

                    // Result should be h(w, z)
                    match result {
                        Some(res) => match res.ast0() {
                            FNtn0::App1(h, args) => {
                                match h.ast0() {
                                    FNtn0::Var(name) => assert_eq!(*name, "h"),
                                    _ => panic!("Expected h"),
                                }
                                match args.ast0() {
                                    FNtn0::Tuple(elements) => {
                                        assert_eq!(elements.len(), 2);
                                        match elements[0].ast0() {
                                            FNtn0::Var(name) => assert_eq!(*name, "w"),
                                            _ => panic!("Expected w"),
                                        }
                                        match elements[1].ast0() {
                                            FNtn0::Var(name) => assert_eq!(*name, "z"),
                                            _ => panic!("Expected z"),
                                        }
                                    }
                                    _ => panic!("Expected Tuple for args"),
                                }
                            }
                            _ => panic!("Expected App1 for h(w, z)"),
                        },
                        None => panic!("Expected result in block"),
                    }
                }
                _ => panic!("Expected Block"),
            }
        });
    }

    #[test]
    fn test_parse_whitespace_variations() {
        // All these should parse to the same thing
        let inputs = vec!["f(x)", "f( x )", "f (x)", "f  (  x  )"];

        for input in inputs {
            with_parsed(input, |result| match result.ast0() {
                FNtn0::App1(func, arg) => {
                    match func.ast0() {
                        FNtn0::Var(name) => assert_eq!(*name, "f"),
                        _ => panic!("Expected f in input: {}", input),
                    }
                    match arg.ast0() {
                        FNtn0::Var(name) => assert_eq!(*name, "x"),
                        _ => panic!("Expected x in input: {}", input),
                    }
                }
                _ => panic!("Expected App1 for input: {}", input),
            });
        }
    }

    #[test]
    fn test_parse_three_arg_function() {
        with_parsed("foo[a, b, c]", |result| match result.ast0() {
            FNtn0::App1(func, arg) => {
                match func.ast0() {
                    FNtn0::Var(name) => assert_eq!(*name, "foo"),
                    _ => panic!("Expected foo"),
                }

                match arg.ast0() {
                    FNtn0::Tuple(elements) => {
                        assert_eq!(elements.len(), 3);

                        let names: Vec<&str> = elements
                            .iter()
                            .map(|e| match e.ast0() {
                                FNtn0::Var(name) => *name,
                                _ => panic!("Expected Var"),
                            })
                            .collect();

                        assert_eq!(names, vec!["a", "b", "c"]);
                    }
                    _ => panic!("Expected Tuple"),
                }
            }
            _ => panic!("Expected App1"),
        });
    }

    #[test]
    fn test_parse_empty_block() {
        with_parsed("{ x }", |result| {
            // Block with no statements, just result
            match result.ast0() {
                FNtn0::Block(stmts, result) => {
                    assert_eq!(stmts.len(), 0);
                    match result {
                        Some(r) => match r.ast0() {
                            FNtn0::Var(name) => assert_eq!(*name, "x"),
                            _ => panic!("Expected x"),
                        },
                        None => panic!("Expected result"),
                    }
                }
                _ => panic!("Expected Block"),
            }
        });
    }

    #[test]
    fn test_parse_error_on_invalid_syntax() {
        assert!(expect_error("f(x")); // Missing closing paren
    }

    #[test]
    fn test_reuse_parser() {
        let parser = FNotationParser::new();

        // Parse multiple inputs with the same parser
        let input1 = "f(x)";
        let context1 = parser.create_context(input1).unwrap();
        let result1 = parser.parse_to_fnotation(input1, &context1).unwrap();
        assert!(matches!(result1.ast0(), FNtn0::App1(_, _)));

        let input2 = "g(y)";
        let context2 = parser.create_context(input2).unwrap();
        let result2 = parser.parse_to_fnotation(input2, &context2).unwrap();
        assert!(matches!(result2.ast0(), FNtn0::App1(_, _)));
    }
}
