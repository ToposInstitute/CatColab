//! Helpers to make formatting more ergonomic when writing display
//! implementations. This file contains an attempt to remedy rather unpleasant
//! boilerplate imposed by the way that rust mandates [std::fmt::Display] be
//! implemented. By specifying a few small helper types, which additionally
//! sidestep the orphan rule by being wrappers, we can format arguments in an
//! in-line `#[display()]` directive by wrapping those arguments in these structs.

use derive_more::Display;
use nonempty::NonEmpty;
use std::collections::HashMap;
use textwrap::indent;
#[derive(Display)]
#[display("[{}]", _0.iter().map(|o| o.to_string()).collect::<Vec<_>>().join(", "))]
/// A helper to display lists as "[item1, ..., itemN]"
pub struct DHList<'a, T: std::fmt::Display>(pub &'a Vec<T>);

#[derive(Display)]
#[display("{}", _0.iter().map(|o| o.to_string()).collect::<Vec<_>>().join(" ; "))]
/// A helper to display a non-empty composite of pro-arrows as
/// "item1 ; ... ; itemN", used by the [ExpressionProArrow](crate::mtt::ast::ExpressionProArrow)
/// composite forms.
pub struct DHProArrowComposite<'a, T: std::fmt::Display>(pub &'a NonEmpty<T>);

#[derive(Display)]
#[display("({})", _0.iter().map(|o| o.to_string()).collect::<Vec<_>>().join(", "))]
/// A helper to display tuples as "(item1, ..., itemN)"
pub struct DHTuple<'a, T: std::fmt::Display>(pub &'a Vec<T>);

/// A helper to display a possibly empty list of bindings, used in the "use ..
/// as ..." forms.
pub struct DHBindings<'a, T>(pub &'a Vec<T>);
impl<'a, T: std::fmt::Display> std::fmt::Display for DHBindings<'a, T> {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        if self.0.is_empty() {
            return Ok(());
        }
        f.write_str(" [")?;
        for (i, b) in self.0.iter().enumerate() {
            if i > 0 {
                f.write_str(", ")?;
            }
            write!(f, "{}", b)?;
        }
        f.write_str("]")
    }
}

#[derive(Display)]
#[display("{{\n{}\n}}",
    indent(
        &_0.iter().map(|(k,v)| format!("{k} ~> {v}")).collect::<Vec<_>>().join(",\n"),
        "  ")
)]
/// A helper to display a hashmap K ~> V
pub struct DHMap<'a, K: std::fmt::Display, V: std::fmt::Display>(pub &'a HashMap<K, V>);
