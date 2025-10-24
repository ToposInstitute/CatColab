#[cfg(test)]
mod tests {
    use crate::ast::{Expr, convert};
    use crate::fnotation_parser::FNotationParser;

    fn parse_and_convert(input: &str) -> Result<Expr, String> {
        let parser = FNotationParser::new();
        let context = parser.create_context(input)?;
        let fntn = parser.parse_to_fnotation(input, &context)?;

        convert(fntn)
    }

    #[test]
    fn test_convert_variable() {
        let result = parse_and_convert("x").unwrap();
        println!("{}", result);
    }

    #[test]
    fn test_convert_function_call() {
        let result = parse_and_convert("f(x)").unwrap();
        println!("{}", result);
    }

    #[test]
    fn test_convert_nested_calls() {
        let result = parse_and_convert("h[f(x), g(y)]").unwrap();
        println!("{}", result);
    }

    #[test]
    fn test_convert_block_with_bindings() {
        let result = parse_and_convert("{ w = f(x); z = g(y); h[w, z] }").unwrap();
        println!("{}", result);
    }

    #[test]
    fn test_scope() {
        let result = parse_and_convert(
            "
        {
            x = g(z);
            y = {
               x = h(w);
               x
            };
            x
        }
        ",
        )
        .unwrap();
        println!("{}", result);
    }

    #[test]
    fn test_chain() {
        let result = parse_and_convert(
            "
        {
            x = f(i);
            y = g(x);
            z = h(y);
            w = l(z);
            u = k(w);
            n[x, y, z, w, u]
        }
        ",
        )
        .unwrap();
        println!("{}", result);
    }
}
