//! AST and AST converter
//!
//! support variable, function, let bindings

use fnotation::{FNtn, FNtn0};
use std::fmt;

#[derive(PartialEq, Eq, Debug)]
pub enum Expr {
    Var(String),
    FuncApp {
        name: String,
        args: Vec<Expr>,
    },
    Let {
        name: String,
        value: Box<Expr>,
        body: Box<Expr>,
    },
}

impl fmt::Display for Expr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Expr::Var(x) => write!(f, "{}", x),
            Expr::FuncApp { name, args } => write!(
                f,
                "{} ({})",
                name,
                args.iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join(",")
            ),
            Expr::Let { name, value, body } => {
                write!(f, "let {} = {} in {} end", name, value, body)
            }
        }
    }
}

pub struct AstConverter;

impl AstConverter {
    pub fn new() -> Self {
        AstConverter
    }

    /// Convert FNotation AST to our Expr AST
    pub fn convert(&self, fntn: &FNtn) -> Result<Expr, String> {
        self.convert_fntn(fntn)
    }

    fn convert_fntn(&self, fntn: &FNtn) -> Result<Expr, String> {
        match fntn.ast0() {
            FNtn0::Var(name) => Ok(Expr::Var(name.to_string())),

            FNtn0::App1(func, arg) => {
                let func_name = match func.ast0() {
                    FNtn0::Var(name) => name.to_string(),
                    _ => return Err("Function name must be a variable".to_string()),
                };

                let args = match arg.ast0() {
                    FNtn0::Tuple(elements) => {
                        // Multiple arguments: f[x1, ..., x_n]
                        elements
                            .iter()
                            .map(|e| self.convert_fntn(e))
                            .collect::<Result<Vec<_>, _>>()?
                    }
                    _ => {
                        // Single argument: f(x)
                        vec![self.convert_fntn(arg)?]
                    }
                };

                Ok(Expr::FuncApp {
                    name: func_name,
                    args,
                })
            }

            // translate block with bindings into abstract binding tree
            FNtn0::Block(stmts, result) => {
                // Recursively translate from right to left in
                // { stmt1; ...; stmt_n; result }
                let result_expr = match result {
                    Some(r) => self.convert_fntn(r)?,
                    None => return Err("Block must have a result expression".to_string()),
                };
                let mut body = result_expr;
                for stmt in stmts.iter().rev() {
                    match stmt.ast0() {
                        FNtn0::App2(op, left, right) => {
                            // Check if it's an assignment: x = expr
                            if let FNtn0::Keyword("=") = op.ast0() {
                                if let FNtn0::Var(name) = left.ast0() {
                                    let value = self.convert_fntn(right)?;
                                    body = Expr::Let {
                                        name: name.to_string(),
                                        value: Box::new(value),
                                        body: Box::new(body),
                                    };
                                } else {
                                    return Err("Left side of = must be a variable".to_string());
                                }
                            } else {
                                return Err("Expected = in binding".to_string());
                            }
                        }
                        _ => return Err("Block statements must be assignments".to_string()),
                    }
                }

                Ok(body)
            }

            FNtn0::Error => Err("Parse error in source".to_string()),

            _ => Err(format!("Unsupported construct: {:?}", fntn.ast0())),
        }
    }
}
