//! Type checker
//! support uni type checking

use core::fmt;
use std::collections::HashMap;
use crate::ast::Expr;

#[derive(PartialEq, Eq, Clone, Debug)]
pub enum Typ {
    List(usize),            // variable type encodes as List(its_length)
    FuncType(usize, usize), // function type encoded as FuncType(input_length, output_length)
}

impl fmt::Display for Typ {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Typ::List(l) => write!(f, "{}", l),
            Typ::FuncType(inputs, outputs) => write!(f, "{} -> {}", inputs, outputs),
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
                if let Some(typ) = self.funcs.get(name).cloned() {
                    // check function type

                    if let Typ::FuncType(arg_typs, ret_typs) = typ {
                        if arg_typs == args.len() {
                            // check length of argument

                            // check each argument is well-typed
                            for (i, arg) in args.iter().enumerate() {
                                self.type_check(arg).map_err(|e| {
                                    format!("In argument {} of '{}': {}", i + 1, name, e)
                                })?;
                            }
                            return Ok(Typ::List(ret_typs));
                        } else {
                            Err(format!("Expect {} arguments, got {}", arg_typs, args.len()))
                        }
                    } else {
                        Err(format!("Expect function type, got {}", typ))
                    }
                } else {
                    Err(format!("Cannot find {} in function context", name))
                }
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
