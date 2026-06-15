//! Framework for dealing with items which may be linearly ordered subject to
//! compatibility conditions.

/// A simple trait for determining whether data may be linearly arranged subject
/// to some matching condition.
pub trait Composable {
    /// Given a self and a next, do these line up in that order?
    fn composable(&self, next: &Self) -> bool;
}

/// A datastructure holding zero or more T, the only constructors of which are
/// `empty()`, `singleton(T)` and `try_from(Vec<T: Composable>)`. Note that we don't define the
/// meaning of an empty composite here, and leave that up to the surrounding
/// implementation. We don't implement any non-trivial computations on these
/// composites; compare with [crate::one::path] for a more featureful
/// datastructure with a different intention.
pub struct Composite<T> {
    path: Vec<T>,
}

impl<T: std::fmt::Display> std::fmt::Display for Composite<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.path.iter().map(|t| t.to_string()).collect::<Vec<_>>().join("∘"))
    }
}

/// We may clone a Composite<T> when T itself may be cloned.
impl<T: Clone> Clone for Composite<T> {
    fn clone(&self) -> Composite<T> {
        Composite { path: self.path.clone() }
    }
}

/// Construct a Composite from a vector of composable T, which is checked for
/// composability. We require T: Display for readable error messages.
impl<T: Composable + std::fmt::Display> TryFrom<Vec<T>> for Composite<T> {
    type Error = String;
    fn try_from(vec: Vec<T>) -> Result<Self, Self::Error> {
        let len = vec.len();
        if len < 2 {
            return Ok(Composite { path: vec });
        }
        let pairs = std::iter::zip(vec[0..len - 1].iter(), vec[1..].iter());
        for (l, r) in pairs {
            if !l.composable(r) {
                return Err(format!(
                    "Cannot construct composite because {l} and {r} are not composable in that order."
                ));
            }
        }
        Ok(Composite { path: vec })
    }
}

impl<T> Composite<T> {
    /// Construct an empty Composite.
    pub fn empty() -> Self {
        Composite { path: Vec::new() }
    }

    /// Construct a Composite from a single T. A singleton is always composable,
    /// so this construction is infallible.
    pub fn singleton(item: T) -> Self {
        Composite { path: vec![item] }
    }

    /// Read-only access to the terms of the composite.
    pub fn iter(&self) -> std::slice::Iter<'_, T> {
        self.path.iter()
    }

    /// The sole term of the composite, if it is a singleton; `None` otherwise
    /// (whether empty or longer).
    pub fn only(&self) -> Option<&T> {
        match self.path.as_slice() {
            [item] => Some(item),
            _ => None,
        }
    }

    /// Is the composite empty?
    pub fn is_empty(&self) -> bool {
        self.path.is_empty()
    }
}

impl<T: Composable + std::fmt::Display> Composite<T> {
    /// Extend a composite by a single T.
    pub fn extend(&mut self, next: T) -> Result<(), String> {
        if !self.path.is_empty() {
            let last = self.path.last().unwrap();
            if !last.composable(&next) {
                return Err(format!(
                    "Cannot construct composite because {last} and {next} are not composable in that order."
                ));
            }
        }
        self.path.push(next);
        Ok(())
    }
}
