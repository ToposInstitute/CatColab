//! Type checker
//! support uni type checking

use core::fmt;
use std::collections::HashMap;
use crate::ast::Expr;

/// extended type system (beyond length of arguments)
/// Base types: "int", "str", "bool", "X", "Y"
/// when declare variable x, it expects type of form Product(Vec<Typ>)
///     e.g. ["int"], ["int", "a"]
/// when declare function f, it expects type of form FuncType(Vec<Typ>, Vec<Typ>)
///     e.g. ["int", "int"] -> ["bool"]
///     e.g. [FuncType[["int", "int"] -> ["bool"]]] -> ["bool"]
/// 
/// there's a caveat to use the type system, and following type checker potentially
/// suffered from this, do we expect ["bool"] same as "bool"?
/// To handle this:
/// 
/// solution 1: 
/// manually implement type equal instead of derived Eq to descently handle this
/// 
/// solution 2:
/// we should always store simplies form of a type in environment, e.g. no [[[["bool"]]]]
/// (based on which I should write more tests in tests/test_typecheck.rs)
#[derive(PartialEq, Eq, Clone, Debug)]
pub enum Typ {
    Base(String),
    Product(Vec<Typ>),            // variable type encodes as List(its_length)
    FuncType(Vec<Typ>, Vec<Typ>), // function type encoded as FuncType(input_length, output_length)
}

impl fmt::Display for Typ {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Typ::Base(name) => write!(f, "{}", name),
            Typ::Product(types) => format_product(f, types),
            Typ::FuncType(inputs, outputs) => {
                format_product(f, inputs)?;
                write!(f, " -> ")?;
                format_product(f, outputs)
            }
        }
    }
}

fn format_product(f: &mut fmt::Formatter<'_>, types: &[Typ]) -> fmt::Result {
    match types.len() {
        0 => write!(f, "()"),
        1 => write!(f, "{}", types[0]),
        _ => {
            write!(f, "(")?;
            for (i, typ) in types.iter().enumerate() {
                if i > 0 {
                    write!(f, ", ")?;
                }
                write!(f, "{}", typ)?;
            }
            write!(f, ")")
        }
    }
}

pub struct TypeChecker {
    vars: HashMap<String, Typ>, // variable contexts, subject to change upon let bindings
    funcs: HashMap<String, Typ>, // assume functions reside on top level
}

impl TypeChecker {
    pub fn new(init_vars: HashMap<String, Typ>, funcs: HashMap<String, Typ>) -> Self {
        TypeChecker {
            vars: init_vars,
            funcs,
        }
    }

    pub fn type_check(&mut self, expr: &Expr) -> Result<Typ, String> {
        match expr {
            Expr::Var(x) => {
                if let Some(typ) = self.vars.get(x).cloned() {
                    Ok(typ)
                } else {
                    Err(format!("Cannot find {} in variable context", x))
                }
            }

            Expr::FuncApp { name, args } => {
                // look up function type
                let func_typ = self.funcs.get(name).cloned()
                    .ok_or_else(|| format!("Cannot find {} in function context", name))?;
                
                // and ensure it's a function type
                let (arg_typs, ret_typs) = match func_typ {
                    Typ::FuncType(arg_typs, ret_typs) => (arg_typs, ret_typs),
                    _ => return Err(format!("'{}' is not a function, has type {}", name, func_typ))
                };
                
                // Check argument count
                if args.len() != arg_typs.len() {
                    return Err(format!(
                        "Function '{}' expects {} arguments, got {}", 
                        name, arg_typs.len(), args.len()
                    ));
                }
                
                // infer type of each argument and verify it matches expected type
                for (i, (arg, expected_typ)) in args.iter().zip(arg_typs.iter()).enumerate() {
                    let actual_typ = self.type_check(arg)
                        .map_err(|e| format!("In argument {} of '{}': {}", i + 1, name, e))?;
                    
                    if actual_typ != *expected_typ {
                        return Err(format!(
                            "Argument {} of '{}': expected type {}, got {}",
                            i + 1, name, expected_typ, actual_typ
                        ));
                    }
                }
                
                Ok(Typ::Product(ret_typs))
            }

            Expr::Let { name, value, body } => {
                // first check value has a legal type
                let value_typ = self.type_check(&*value)?;

                // store old var context
                let old_var_ctx = self.vars.clone();

                // infer type of body based on new context
                self.vars.insert(name.clone(), value_typ);
                let body_type = self.type_check(&*body)?;

                // restore old var context
                self.vars = old_var_ctx;
                Ok(body_type)
            }
        }
    }
}
