#[cfg(test)]
mod tests {
    use crate::ast::{Expr, convert};
    use crate::fnotation_parser::FNotationParser;
    use crate::typechecker::{Typ, TypeChecker};
    use std::collections::HashMap;

    fn parse_and_convert(input: &str) -> Result<Expr, String> {
        let parser = FNotationParser::new();
        let context = parser.create_context(input)?;
        let fntn = parser.parse_to_fnotation(input, &context)?;
        convert(fntn)
    }

    fn setup_simple() -> (HashMap<String, Typ>, HashMap<String, Typ>) {
        let mut vars = HashMap::new();
        vars.insert("x".to_string(), Typ::Base("int".to_string()));
        vars.insert("x1".to_string(), Typ::Base("int".to_string()));
        vars.insert("y".to_string(), Typ::Base("str".to_string()));
        vars.insert("b".to_string(), Typ::Base("bool".to_string()));
        vars.insert("flag".to_string(), Typ::Base("bool".to_string()));

        let mut funcs = HashMap::new();

        // Basic arithmetic
        funcs.insert(
            "add".to_string(),
            Typ::FuncType(
                vec![Typ::Base("int".to_string()), Typ::Base("int".to_string())],
                Box::new(Typ::Base("int".to_string())),
            ),
        );

        funcs.insert(
            "multiply".to_string(),
            Typ::FuncType(
                vec![Typ::Base("int".to_string()), Typ::Base("int".to_string())],
                Box::new(Typ::Base("int".to_string())),
            ),
        );

        // Predicates
        funcs.insert(
            "greater_than_zero".to_string(),
            Typ::FuncType(
                vec![Typ::Base("int".to_string())],
                Box::new(Typ::Base("bool".to_string())),
            ),
        );

        funcs.insert(
            "is_empty".to_string(),
            Typ::FuncType(
                vec![Typ::Base("str".to_string())],
                Box::new(Typ::Base("bool".to_string())),
            ),
        );

        // String operations
        funcs.insert(
            "concat".to_string(),
            Typ::FuncType(
                vec![Typ::Base("str".to_string()), Typ::Base("str".to_string())],
                Box::new(Typ::Base("str".to_string())),
            ),
        );

        funcs.insert(
            "to_string".to_string(),
            Typ::FuncType(
                vec![Typ::Base("int".to_string())],
                Box::new(Typ::Base("str".to_string())),
            ),
        );

        // Product type functions - CONCRETE TYPES (no polymorphism)
        funcs.insert(
            "pair_int_str".to_string(),
            Typ::FuncType(
                vec![Typ::Base("int".to_string()), Typ::Base("str".to_string())],
                Box::new(Typ::Product(vec![
                    Typ::Base("int".to_string()),
                    Typ::Base("str".to_string()),
                ])),
            ),
        );

        funcs.insert(
            "swap_int_str".to_string(),
            Typ::FuncType(
                vec![Typ::Product(vec![
                    Typ::Base("int".to_string()),
                    Typ::Base("str".to_string()),
                ])],
                Box::new(Typ::Product(vec![
                    Typ::Base("str".to_string()),
                    Typ::Base("int".to_string()),
                ])),
            ),
        );

        funcs.insert(
            "pair_int_int".to_string(),
            Typ::FuncType(
                vec![Typ::Base("int".to_string()), Typ::Base("int".to_string())],
                Box::new(Typ::Product(vec![
                    Typ::Base("int".to_string()),
                    Typ::Base("int".to_string()),
                ])),
            ),
        );

        funcs.insert(
            "triple".to_string(),
            Typ::FuncType(
                vec![
                    Typ::Base("int".to_string()),
                    Typ::Base("str".to_string()),
                    Typ::Base("bool".to_string()),
                ],
                Box::new(Typ::Product(vec![
                    Typ::Base("int".to_string()),
                    Typ::Base("str".to_string()),
                    Typ::Base("bool".to_string()),
                ])),
            ),
        );

        // Higher-order functions - CONCRETE TYPES
        funcs.insert(
            "map_int".to_string(),
            Typ::FuncType(
                vec![
                    Typ::FuncType(
                        vec![Typ::Base("int".to_string())],
                        Box::new(Typ::Base("int".to_string())),
                    ),
                    Typ::Base("int".to_string()),
                ],
                Box::new(Typ::Base("int".to_string())),
            ),
        );

        funcs.insert(
            "compose".to_string(),
            Typ::FuncType(
                vec![
                    Typ::FuncType(
                        vec![Typ::Base("int".to_string())],
                        Box::new(Typ::Base("str".to_string())),
                    ),
                    Typ::FuncType(
                        vec![Typ::Base("int".to_string()), Typ::Base("int".to_string())],
                        Box::new(Typ::Base("int".to_string())),
                    ),
                ],
                Box::new(Typ::FuncType(
                    vec![Typ::Base("int".to_string()), Typ::Base("int".to_string())],
                    Box::new(Typ::Base("str".to_string())),
                )),
            ),
        );

        funcs.insert(
            "apply".to_string(),
            Typ::FuncType(
                vec![
                    Typ::FuncType(
                        vec![Typ::Base("int".to_string())],
                        Box::new(Typ::Base("int".to_string())),
                    ),
                    Typ::Base("int".to_string()),
                ],
                Box::new(Typ::Base("int".to_string())),
            ),
        );

        // Function that returns a function
        funcs.insert(
            "make_adder".to_string(),
            Typ::FuncType(
                vec![Typ::Base("int".to_string())],
                Box::new(Typ::FuncType(
                    vec![Typ::Base("int".to_string())],
                    Box::new(Typ::Base("int".to_string())),
                )),
            ),
        );

        // Boolean operations
        funcs.insert(
            "and".to_string(),
            Typ::FuncType(
                vec![Typ::Base("bool".to_string()), Typ::Base("bool".to_string())],
                Box::new(Typ::Base("bool".to_string())),
            ),
        );

        funcs.insert(
            "not".to_string(),
            Typ::FuncType(
                vec![Typ::Base("bool".to_string())],
                Box::new(Typ::Base("bool".to_string())),
            ),
        );

        (vars, funcs)
    }

    fn test_driver(input: &'static str, expected_typ: Typ) {
        let (vars, funcs) = setup_simple();
        let mut tc = TypeChecker::new(vars, funcs);
        let expr = parse_and_convert(input).unwrap();
        let result = tc.type_check(&expr);
        assert!(result.is_ok(), "Type checking failed for input '{}': {:?}", input, result);
        assert_eq!(result.unwrap(), expected_typ, "Type mismatch for input '{}'", input);
    }

    fn error_driver(input: &'static str, _expected_error_fragment: &str) {
        let (vars, funcs) = setup_simple();
        let mut tc = TypeChecker::new(vars, funcs);
        let expr = parse_and_convert(input).unwrap();
        let result = tc.type_check(&expr);
        assert!(result.is_err(), "Expected error for input: {}", input);
    }

    // ============ Basic Tests ============
    #[test]
    fn test_basic_variables() {
        test_driver("x", Typ::Base("int".to_string()));
        test_driver("y", Typ::Base("str".to_string()));
        test_driver("b", Typ::Base("bool".to_string()));
    }

    #[test]
    fn test_basic_functions() {
        test_driver("add[x, x1]", Typ::Base("int".to_string()));
        test_driver("greater_than_zero[x]", Typ::Base("bool".to_string()));
        test_driver("concat[y, y]", Typ::Base("str".to_string()));
    }

    #[test]
    fn test_simple_let() {
        test_driver(
            "
            {
                x = greater_than_zero[x1];
                x
            }
        ",
            Typ::Base("bool".to_string()),
        );

        test_driver(
            "
            {
                result = add[x, x1];
                result
            }
        ",
            Typ::Base("int".to_string()),
        );
    }

    // ============ Product Type Tests ============
    #[test]
    fn test_product_return() {
        test_driver(
            "pair_int_str[x, y]",
            Typ::Product(vec![Typ::Base("int".to_string()), Typ::Base("str".to_string())]),
        );

        test_driver(
            "triple[x, y, b]",
            Typ::Product(vec![
                Typ::Base("int".to_string()),
                Typ::Base("str".to_string()),
                Typ::Base("bool".to_string()),
            ]),
        );
    }

    #[test]
    fn test_product_as_argument() {
        test_driver(
            "
            {
                pair = pair_int_str[x, y];
                swap_int_str[pair]
            }
        ",
            Typ::Product(vec![Typ::Base("str".to_string()), Typ::Base("int".to_string())]),
        );
    }

    #[test]
    fn test_nested_product_operations() {
        test_driver(
            "
            {
                p1 = pair_int_str[x, y];
                p2 = swap_int_str[p1];
                p2
            }
        ",
            Typ::Product(vec![Typ::Base("str".to_string()), Typ::Base("int".to_string())]),
        );
    }

    // ============ Shadowing Tests ============
    #[test]
    fn test_simple_shadowing() {
        test_driver(
            "
            {
                x = to_string[x];
                x
            }
        ",
            Typ::Base("str".to_string()),
        );
    }

    #[test]
    fn test_nested_shadowing() {
        test_driver(
            "
            {
                x = add[x, x1];
                {
                    x = to_string[x];
                    x
                }
            }
        ",
            Typ::Base("str".to_string()),
        );
    }

    #[test]
    fn test_shadowing_with_different_types() {
        test_driver(
            "
            {
                temp = x;
                temp = to_string[temp];
                temp = is_empty[temp];
                temp
            }
        ",
            Typ::Base("bool".to_string()),
        );
    }

    #[test]
    fn test_shadowing_scope_restoration() {
        // After inner let, outer variable should be accessible with original type
        test_driver(
            "
            {
                x = to_string[x];
                temp = {
                    x = is_empty[x];
                    x
                };
                concat[x, y]
            }
        ",
            Typ::Base("str".to_string()),
        );
    }

    // ============ Higher-Order Function Tests ============
    #[test]
    fn test_map_with_function() {
        test_driver(
            "
            {
                f = make_adder[x];
                map_int[f, x1]
            }
        ",
            Typ::Base("int".to_string()),
        );
    }

    #[test]
    fn test_function_composition() {
        test_driver(
            "
            {
                f = compose[to_string, add];
                f
            }
        ",
            Typ::FuncType(
                vec![Typ::Base("int".to_string()), Typ::Base("int".to_string())],
                Box::new(Typ::Base("str".to_string())),
            ),
        );
    }

    #[test]
    fn test_apply_function() {
        test_driver(
            "
            {
                f = make_adder[x];
                apply[f, x1]
            }
        ",
            Typ::Base("int".to_string()),
        );
    }

    #[test]
    fn test_nested_higher_order() {
        test_driver(
            "
            {
                adder = make_adder[x];
                result = map_int[adder, x1];
                result
            }
        ",
            Typ::Base("int".to_string()),
        );
    }

    // ============ Complex Nested Expressions ============
    #[test]
    fn test_deeply_nested_let() {
        test_driver(
            "
            {
                a = add[x, x1];
                {
                    b = multiply[a, x];
                    {
                        c = greater_than_zero[b];
                        c
                    }
                }
            }
        ",
            Typ::Base("bool".to_string()),
        );
    }

    #[test]
    fn test_multiple_intermediate_bindings() {
        test_driver(
            "
            {
                sum = add[x, x1];
                product = multiply[sum, x];
                str_result = to_string[product];
                is_empty[str_result]
            }
        ",
            Typ::Base("bool".to_string()),
        );
    }

    #[test]
    fn test_mixed_operations() {
        test_driver(
            "
            {
                num = add[x, multiply[x1, x]];
                pair = pair_int_str[num, y];
                swapped = swap_int_str[pair];
                swapped
            }
        ",
            Typ::Product(vec![Typ::Base("str".to_string()), Typ::Base("int".to_string())]),
        );
    }

    // ============ Error Cases ============
    #[test]
    fn test_undefined_variable() {
        error_driver("undefined_var", "Cannot find undefined_var");
    }

    #[test]
    fn test_undefined_function() {
        error_driver("undefined_func[x]", "Cannot find undefined_func");
    }

    #[test]
    fn test_wrong_number_of_arguments() {
        error_driver("add[x]", "expects 2 arguments, got 1");
        error_driver("add[x, x1, x]", "expects 3 arguments, got 2");
    }

    #[test]
    fn test_type_mismatch_simple() {
        error_driver("add[x, y]", "expected type int, got str");
    }

    #[test]
    fn test_type_mismatch_in_nested_call() {
        error_driver(
            "
            {
                str_val = to_string[x];
                add[str_val, x1]
            }
        ",
            "expected type int, got str",
        );
    }

    #[test]
    fn test_not_a_function() {
        error_driver("x[y]", "is not a function");
    }

    #[test]
    fn test_wrong_function_argument_type() {
        error_driver("greater_than_zero[y]", "expected type int, got str");
    }

    #[test]
    fn test_product_type_mismatch() {
        error_driver(
            "
            {
                wrong_pair = pair_int_int[x, x1];
                swap_int_str[wrong_pair]
            }
        ",
            "",
        ); // Should fail because pair_int_int returns (int, int) but swap_int_str expects (int, str)
    }

    #[test]
    fn test_higher_order_type_mismatch() {
        error_driver("map_int[to_string, x]", "expected type");
    }

    #[test]
    fn test_shadowing_with_wrong_type() {
        error_driver(
            "
            {
                x = to_string[x];
                add[x, x1]
            }
        ",
            "expected type int, got str",
        );
    }

    // ============ Edge Cases ============
    #[test]
    fn test_identity_binding() {
        test_driver(
            "
            {
                temp = x;
                temp
            }
        ",
            Typ::Base("int".to_string()),
        );
    }

    #[test]
    fn test_chained_function_calls() {
        test_driver(
            "
            to_string[add[multiply[x, x1], x]]
        ",
            Typ::Base("str".to_string()),
        );
    }

    #[test]
    fn test_boolean_operations() {
        test_driver(
            "
            {
                cond1 = greater_than_zero[x];
                cond2 = is_empty[y];
                and[cond1, cond2]
            }
        ",
            Typ::Base("bool".to_string()),
        );
    }

    #[test]
    fn test_complex_higher_order() {
        test_driver(
            "
            {
                adder5 = make_adder[x];
                doubled = map_int[adder5, x1];
                greater_than_zero[doubled]
            }
        ",
            Typ::Base("bool".to_string()),
        );
    }

    #[test]
    fn test_function_as_let_binding() {
        test_driver(
            "
            {
                my_func = make_adder[x];
                my_func
            }
        ",
            Typ::FuncType(
                vec![Typ::Base("int".to_string())],
                Box::new(Typ::Base("int".to_string())),
            ),
        );
    }

    #[test]
    fn test_multiple_product_operations() {
        test_driver(
            "
            {
                t = triple[x, y, b];
                p = pair_int_str[x, y];
                t
            }
        ",
            Typ::Product(vec![
                Typ::Base("int".to_string()),
                Typ::Base("str".to_string()),
                Typ::Base("bool".to_string()),
            ]),
        );
    }
}
