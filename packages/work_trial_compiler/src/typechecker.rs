//! Type checker
//! support uni type checking
//! 
//!  extended type system (beyond length of arguments)
//! Base types: "int", "str", "bool", "X", "Y"
//! when declare variable x, it expects type of form Product(Vec<Typ>)
//!     e.g. ["int"], ["int", "a"]
//! when declare function f, it expects type of form FuncType(Vec<Typ>, Vec<Typ>)
//!     e.g. ["int", "int"] -> ["bool"]
//!     e.g. [FuncType[["int", "int"] -> ["bool"]]] -> ["bool"]
//! 
//! there's a caveat to use the type system, and following type checker potentially
//! suffered from this, do we expect ["bool"] same as "bool"?
//! To handle this:
//! 
//! solution 1: 
//! manually implement type equal instead of derived Eq to descently handle this
//! 
//! solution 2 (we go with this):
//! we should always store simplies form of a type in environment, e.g. no [[[["bool"]]]]
//! (based on which I should write more tests in tests/test_typecheck.rs)

use core::fmt;
use std::collections::HashMap;
use crate::ast::Expr;

#[derive(PartialEq, Eq, Clone, Debug)]
pub enum Typ {
    Base(String),
    Product(Vec<Typ>),
    FuncType(Vec<Typ>, Box<Typ>),
}

impl fmt::Display for Typ {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Typ::Base(name) => write!(f, "{}", name),
            Typ::Product(types) => format_vector_types(f, types),
            Typ::FuncType(inputs, outputs) => {
                format_vector_types(f, inputs)?;
                write!(f, "->{}", outputs)
            }
            
        }
    }
}

fn format_vector_types(f: &mut fmt::Formatter<'_>, types: &[Typ]) -> fmt::Result {
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

impl From<&str> for Typ {
    fn from(value: &str) -> Self {
        Typ::Base(value.to_string())
    }
}

impl Typ {
    /// Typechecker will assert all types in environment are normalized
    pub fn is_normal(&self) -> bool {
        match self {
            Typ::Base(_) => true,
            Typ::Product(typs) => 
                typs.len() != 1 && typs.iter().all(|typ| typ.is_normal()),
            Typ::FuncType(typs, typ) => 
                typ.is_normal() && typs.iter().all(Self::is_normal),
        }
    }

    /// Caller of typechecker should use normalize to ensure all types are in canonical form
    pub fn normalize(self) -> Self {
        match self {
            Typ::Base(_) => self,
            Typ::Product(typs) => {
                let normalized: Vec<Typ> = typs.into_iter().map(Self::normalize).collect();
                if normalized.len() == 1 {
                    normalized.into_iter().next().unwrap()
                } else {
                    Typ::Product(normalized)
                }
            },
            Typ::FuncType(typs, typ) => {
                let inputs = typs.into_iter().map(Self::normalize).collect();
                let output = Box::new(typ.normalize());
                Typ::FuncType(inputs, output)
            },
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
        // Invariant: assume all types maintained in vars and funcs are normalized
        // [["typ"]], ["typ"] are all normalized to "typ"
        // and Typ returned by type_check is also normalized
        assert!(self.vars.iter().all(|(_, v)| v.is_normal()));
        assert!(self.funcs.iter().all(|(_, v)| v.is_normal()));

        match expr {
            Expr::Var(x) => {
                if let Some(typ) = self.vars.get(x).cloned() {
                    Ok(typ)
                } else if let Some(typ) = self.funcs.get(x).cloned() {
                    Ok(typ)
                } else {
                    Err(format!("Cannot find {} in variable context", x))
                }
            }

            Expr::FuncApp { name, args } => {
                // look up function type
                let func_typ: Typ = self.funcs.get(name).cloned()
                    .ok_or_else(|| format!("Cannot find {} in function context", name))?;
                
                // and ensure it's a function type
                let (arg_typs, ret_typ) = match func_typ {
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
                 
                assert!(ret_typ.is_normal());
                Ok(*ret_typ)
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
