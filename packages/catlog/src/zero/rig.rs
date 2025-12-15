//! Rigs, rings, and modules over them.
//!
//! Lots of people have their own versions of a trait hierarchy for abstract
//! algebra; see [`noether`](https://crates.io/crates/noether) and links therein.
//! Our aim is not to make the most complete or general hierarchy but just to meet
//! our own needs. Currently that is a bit of [commutative algebra](super::alg),
//! especially polynomial algebras over rings. So we avoid slicing the salomi too
//! thin with minor concepts like magmas and semigroups. We take the category
//! theorist's attitude that rigs are a respectable concept that do not deserve to
//! be called "semirings".
//!
//! Besides the hierarchy of traits, this module provides data structures for
//! [linear combinations](Combination) and [monomials](Monomial). These are actually
//! the same data structure, but with different notation!

use num_traits::{One, Pow, Zero};
use std::collections::{BTreeMap, btree_map};
use std::fmt::Display;
use std::iter::{Product, Sum};
use std::ops::{Add, AddAssign, Mul, MulAssign, Neg};

use derivative::Derivative;
use duplicate::duplicate_item;

/// A commutative monoid, written additively.
pub trait AdditiveMonoid: Add<Output = Self> + Zero {}

#[duplicate_item(T; [f32]; [f64]; [i32]; [i64]; [u32]; [u64]; [usize])]
impl AdditiveMonoid for T {}

/// An abelian group, written additively.
///
/// Though logically redundant, this trait should also extend `Sub<Output = Self>`.
/// So far I've been too lazy to make this change since the extra trait cannot be
/// automatically derived without macro magic.
pub trait AbGroup: AdditiveMonoid + Neg<Output = Self> {}

#[duplicate_item(T; [f32]; [f64]; [i32]; [i64])]
impl AbGroup for T {}

/// A monoid, written multiplicatively.
pub trait Monoid: Mul<Output = Self> + One {}

#[duplicate_item(T; [f32]; [f64]; [i32]; [i64]; [u32]; [u64]; [usize])]
impl Monoid for T {}

/// A commutative monoid, written multiplicatively.
pub trait CommMonoid: Monoid {}

#[duplicate_item(T; [f32]; [f64]; [i32]; [i64]; [u32]; [u64]; [usize])]
impl CommMonoid for T {}

/// A rig, also known as a semiring.
pub trait Rig: Monoid + AdditiveMonoid {}

#[duplicate_item(T; [f32]; [f64]; [i32]; [i64]; [u32]; [u64]; [usize])]
impl Rig for T {}

/// A commutative rig, also known as a commutative semiring.
pub trait CommRig: Rig + CommMonoid {}

#[duplicate_item(T; [f32]; [f64]; [i32]; [i64]; [u32]; [u64]; [usize])]
impl CommRig for T {}

/// A ring, assumed to be unital.
pub trait Ring: Rig + AbGroup {}

#[duplicate_item(T; [f32]; [f64]; [i32]; [i64])]
impl Ring for T {}

/// A commutative ring, assumed to be unital.
pub trait CommRing: Ring + CommRig {}

#[duplicate_item(T; [f32]; [f64]; [i32]; [i64])]
impl CommRing for T {}

/// A module over a commutative rig.
pub trait RigModule: AdditiveMonoid + Mul<Self::Rig, Output = Self> {
    /// Base rig for the module.
    type Rig: CommRig;
}

/// A module over a commutative ring.
pub trait Module: RigModule<Rig = Self::Ring> + AbGroup {
    /// Base ring for the module.
    type Ring: CommRing;
}

/// A formal linear combination.
///
/// This data structure is for linear combinations of indeterminates/variables
/// (`Var`) with coefficients (`Coef`) valued in a [rig](Rig) or at minimum in an
/// [additive monoid](AdditiveMonoid). For example, the coefficients could be
/// natural numbers, integers, real numbers, or nonnegative real numbers.
///
/// Linear combinations are the data structure for free modules. That is, for any
/// rig R, the free R-module on a set consists of formal R-linear combinations on
/// elements of the set.
///
/// Combinations have exactly the same underlying data structure as
/// [monomials](Monomial), but are written additively rather than multiplicatively.
#[derive(Clone, PartialEq, Eq, Debug, Derivative)]
#[derivative(Default(bound = ""))]
pub struct Combination<Var, Coef>(BTreeMap<Var, Coef>);

impl<Var, Coef> Combination<Var, Coef>
where
    Var: Ord,
{
    /// Constructs the generating combination corresponding to a variable.
    pub fn generator(var: Var) -> Self
    where
        Coef: One,
    {
        Combination([(var, Coef::one())].into_iter().collect())
    }

    /// Iterates over the variables used in the combination.
    pub fn variables(&self) -> impl ExactSizeIterator<Item = &Var> {
        self.0.keys()
    }

    /// Maps the coefficients in the combination.
    ///
    /// In the usual situation when the coefficients form rigs and the mapping is a
    /// rig homomorphism, this operation is [extension of
    /// scalars](https://ncatlab.org/nlab/show/extension+of+scalars) applied to
    /// free modules.
    pub fn extend_scalars<NewCoef, F>(self, mut f: F) -> Combination<Var, NewCoef>
    where
        F: FnMut(Coef) -> NewCoef,
    {
        Combination(self.0.into_iter().map(|(var, coef)| (var, f(coef))).collect())
    }

    /// Evaluates the combination by substituting for the variables.
    pub fn eval<A, F>(&self, mut f: F) -> A
    where
        A: Mul<Coef, Output = A> + Sum,
        F: FnMut(&Var) -> A,
        Coef: Clone,
    {
        self.0.iter().map(|(var, coef)| f(var) * coef.clone()).sum()
    }

    /// Evaluates the combination by substituting from a sequence of values.
    ///
    /// The order of the values should correspond to the order of the variables.
    /// Will panic if the number of values does not equal the length of the
    /// combination.
    pub fn eval_with_order<A>(&self, values: impl IntoIterator<Item = A>) -> A
    where
        A: Mul<Coef, Output = A> + Sum,
        Coef: Clone,
    {
        let mut iter = values.into_iter();
        let value = self.eval(|_| iter.next().expect("Should have enough values"));
        assert!(iter.next().is_none(), "Too many values");
        value
    }

    /// Normalizes the combination by dropping terms with coefficient zero.
    pub fn normalize(self) -> Self
    where
        Coef: Zero,
    {
        self.into_iter().filter(|(coef, _)| !coef.is_zero()).collect()
    }
}

/// Constructs a combination from a list of terms (coefficient-variable pairs).
impl<Var, Coef> FromIterator<(Coef, Var)> for Combination<Var, Coef>
where
    Var: Ord,
    Coef: Add<Output = Coef>,
{
    fn from_iter<T: IntoIterator<Item = (Coef, Var)>>(iter: T) -> Self {
        let mut combination = Combination::default();
        for rhs in iter {
            combination += rhs;
        }
        combination
    }
}

/// Iterates over the terms (coefficient-variable pairs) of the combination.
impl<Var, Coef> IntoIterator for Combination<Var, Coef> {
    type Item = (Coef, Var);
    type IntoIter = std::iter::Map<btree_map::IntoIter<Var, Coef>, fn((Var, Coef)) -> (Coef, Var)>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter().map(|(var, coef)| (coef, var))
    }
}

impl<'a, Var, Coef> IntoIterator for &'a Combination<Var, Coef> {
    type Item = (&'a Coef, &'a Var);
    type IntoIter = std::iter::Map<
        btree_map::Iter<'a, Var, Coef>,
        fn((&'a Var, &'a Coef)) -> (&'a Coef, &'a Var),
    >;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter().map(|(var, coef)| (coef, var))
    }
}

/// Pretty print the combination using ASCII.
///
/// Intended for debugging/testing rather than any serious use.
impl<Var, Coef> Display for Combination<Var, Coef>
where
    Var: Display,
    Coef: Display + PartialEq + One,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut pairs = self.0.iter();
        let fmt_scalar_mul = |f: &mut std::fmt::Formatter<'_>, coef: &Coef, var: &Var| {
            if !coef.is_one() {
                let coef = coef.to_string();
                if coef.chars().all(|c| c.is_alphabetic())
                    || coef.chars().all(|c| c.is_ascii_digit() || c == '.')
                {
                    write!(f, "{coef} ")?;
                } else {
                    write!(f, "({coef}) ")?;
                }
            }
            write!(f, "{var}")
        };
        if let Some((var, coef)) = pairs.next() {
            fmt_scalar_mul(f, coef, var)?;
        } else {
            write!(f, "0")?;
        }
        for (var, coef) in pairs {
            write!(f, " + ")?;
            fmt_scalar_mul(f, coef, var)?;
        }
        Ok(())
    }
}

impl<Var, Coef> AddAssign<(Coef, Var)> for Combination<Var, Coef>
where
    Var: Ord,
    Coef: Add<Output = Coef>,
{
    fn add_assign(&mut self, rhs: (Coef, Var)) {
        let rhs = (rhs.1, rhs.0);
        _add_assign(&mut self.0, rhs);
    }
}

impl<Var, Coef> AddAssign for Combination<Var, Coef>
where
    Var: Ord,
    Coef: Add<Output = Coef>,
{
    fn add_assign(&mut self, rhs: Self) {
        for rhs in rhs.0 {
            _add_assign(&mut self.0, rhs);
        }
    }
}

fn _add_assign<K, V>(lhs: &mut BTreeMap<K, V>, rhs: (K, V))
where
    K: Ord,
    V: Add<Output = V>,
{
    let (k, b) = rhs;
    if let Some(a) = lhs.remove(&k) {
        lhs.insert(k, a + b);
    } else {
        lhs.insert(k, b);
    }
}

impl<Var, Coef> Add for Combination<Var, Coef>
where
    Var: Ord,
    Coef: Add<Output = Coef>,
{
    type Output = Self;

    fn add(mut self, rhs: Self) -> Self {
        self += rhs;
        self
    }
}

impl<Var, Coef> Zero for Combination<Var, Coef>
where
    Var: Ord,
    Coef: Add<Output = Coef> + Zero,
{
    fn zero() -> Self {
        Combination(Default::default())
    }

    fn is_zero(&self) -> bool {
        self.0.values().all(|coef| coef.is_zero())
    }
}

impl<Var, Coef> AdditiveMonoid for Combination<Var, Coef>
where
    Var: Ord,
    Coef: AdditiveMonoid,
{
}

impl<Var, Coef> Mul<Coef> for Combination<Var, Coef>
where
    Var: Ord,
    Coef: Clone + Default + Mul<Output = Coef>,
{
    type Output = Self;

    fn mul(mut self, a: Coef) -> Self {
        for coef in self.0.values_mut() {
            *coef = std::mem::take(coef) * a.clone();
        }
        self
    }
}

impl<Var, Coef> RigModule for Combination<Var, Coef>
where
    Var: Ord,
    Coef: Clone + Default + CommRig,
{
    type Rig = Coef;
}

impl<Var, Coef> Neg for Combination<Var, Coef>
where
    Var: Ord,
    Coef: Default + Neg<Output = Coef>,
{
    type Output = Self;

    fn neg(mut self) -> Self {
        for coef in self.0.values_mut() {
            *coef = std::mem::take(coef).neg();
        }
        self
    }
}

impl<Var, Coef> AbGroup for Combination<Var, Coef>
where
    Var: Ord,
    Coef: Default + AbGroup,
{
}

impl<Var, Coef> Module for Combination<Var, Coef>
where
    Var: Ord,
    Coef: Clone + Default + CommRing,
{
    type Ring = Coef;
}

/// A monomial in several variables.
///
/// This data structure is for monomials in several indeterminates/variables
/// (`Var`), having exponents (`Exp`) valued in an [additive
/// monoid](AdditiveMonoid). Most standardly, the exponents will be natural numbers
/// (say `u32` or `u64`), in which case the monomials in a set of variables, under
/// their usual multiplication, are the free commutative monoid on that set. Other
/// types of coefficents are also allowed, such as negative integers as in Laurent
/// polynomials, or real numbers as in
/// [S-systems](https://doi.org/10.1016/0895-7177(88)90553-5).
///
/// The underlying data structure is a [B-tree map](std::collections::BTreeMap) from
/// variables to exponents. Thus, the variable type is assumed to be ordered.
/// Moreover, when the exponents are also ordered, as they almost always are, the
/// monomials themselves become ordered under the lexicographic order. This is a
/// valid *monomial ordering* as used in Groebner bases
/// ([*IVA*](crate::refs::IdealsVarietiesAlgorithms), Section 2.2).
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Debug, Derivative)]
#[derivative(Default(bound = ""))]
pub struct Monomial<Var, Exp>(BTreeMap<Var, Exp>);

impl<Var, Exp> Monomial<Var, Exp>
where
    Var: Ord,
{
    /// Constructs the generating monomial corresponding to a variable.
    pub fn generator(var: Var) -> Self
    where
        Exp: One,
    {
        Monomial([(var, Exp::one())].into_iter().collect())
    }

    /// Iterates over the variables used in the monomial.
    pub fn variables(&self) -> impl ExactSizeIterator<Item = &Var> {
        self.0.keys()
    }

    /// Evaluates the monomial by substituting for the variables.
    pub fn eval<A, F>(&self, mut f: F) -> A
    where
        A: Pow<Exp, Output = A> + Product,
        F: FnMut(&Var) -> A,
        Exp: Clone,
    {
        self.0.iter().map(|(var, exp)| f(var).pow(exp.clone())).product()
    }

    /// Evaluates the monomial by substituting from a sequence of values.
    ///
    /// The order of the values should correspond to the order of the variables.
    /// Will panic if the number of values does not equal the length of the
    /// monomial.
    pub fn eval_with_order<A>(&self, values: impl IntoIterator<Item = A>) -> A
    where
        A: Pow<Exp, Output = A> + Product,
        Exp: Clone,
    {
        let mut iter = values.into_iter();
        let value = self.eval(|_| iter.next().expect("Should have enough values"));
        assert!(iter.next().is_none(), "Too many values");
        value
    }

    /// Maps over the variables of the monomial.
    ///
    /// The mapping need not be injective. This is conceptually equivalent to
    /// [evaluating](Monomial::eval) the monomial with a map that sends generators
    /// to generators.
    pub fn map_variables<NewVar, F>(&self, mut f: F) -> Monomial<NewVar, Exp>
    where
        Exp: Clone + Add<Output = Exp>,
        NewVar: Ord,
        F: FnMut(&Var) -> NewVar,
    {
        self.0.iter().map(|(var, exp)| (f(var), exp.clone())).collect()
    }

    /// Normalizes the monomial by dropping terms with exponent zero.
    pub fn normalize(self) -> Self
    where
        Exp: Zero,
    {
        self.into_iter().filter(|(_, exp)| !exp.is_zero()).collect()
    }
}

/// Constructs a monomial from a sequence of variable-exponent pairs.
impl<Var, Exp> FromIterator<(Var, Exp)> for Monomial<Var, Exp>
where
    Var: Ord,
    Exp: Add<Output = Exp>,
{
    fn from_iter<T: IntoIterator<Item = (Var, Exp)>>(iter: T) -> Self {
        let mut monomial = Monomial::default();
        for rhs in iter {
            monomial *= rhs;
        }
        monomial
    }
}

/// Iterates over the terms (variable-exponent pairs) of the monomial.
impl<Var, Exp> IntoIterator for Monomial<Var, Exp> {
    type Item = (Var, Exp);
    type IntoIter = btree_map::IntoIter<Var, Exp>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

/// Pretty print the monomial using ASCII.
impl<Var, Exp> Display for Monomial<Var, Exp>
where
    Var: Display,
    Exp: Display + PartialEq + One,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut pairs = self.0.iter();
        let fmt_power = |f: &mut std::fmt::Formatter<'_>, var: &Var, exp: &Exp| {
            write!(f, "{var}")?;
            if !exp.is_one() {
                let exp = exp.to_string();
                if exp.len() == 1 {
                    write!(f, "^{exp}")?;
                } else {
                    write!(f, "^{{{exp}}}")?;
                }
            }
            Ok(())
        };
        if let Some((var, exp)) = pairs.next() {
            fmt_power(f, var, exp)?;
        } else {
            write!(f, "1")?;
        }
        for (var, exp) in pairs {
            write!(f, " ")?;
            fmt_power(f, var, exp)?;
        }
        Ok(())
    }
}

impl<Var, Exp> MulAssign<(Var, Exp)> for Monomial<Var, Exp>
where
    Var: Ord,
    Exp: Add<Output = Exp>,
{
    fn mul_assign(&mut self, rhs: (Var, Exp)) {
        _add_assign(&mut self.0, rhs);
    }
}

impl<Var, Exp> MulAssign for Monomial<Var, Exp>
where
    Var: Ord,
    Exp: Add<Output = Exp>,
{
    fn mul_assign(&mut self, rhs: Self) {
        for rhs in rhs.0 {
            *self *= rhs;
        }
    }
}

impl<Var, Exp> Mul for Monomial<Var, Exp>
where
    Var: Ord,
    Exp: Add<Output = Exp>,
{
    type Output = Self;

    fn mul(mut self, rhs: Self) -> Self {
        self *= rhs;
        self
    }
}

impl<Var, Exp> One for Monomial<Var, Exp>
where
    Var: Ord,
    Exp: Add<Output = Exp> + Zero,
{
    fn one() -> Self {
        Monomial(Default::default())
    }

    fn is_one(&self) -> bool {
        self.0.values().all(|exp| exp.is_zero())
    }
}

impl<Var, Exp> Monoid for Monomial<Var, Exp>
where
    Var: Ord,
    Exp: AdditiveMonoid,
{
}

impl<Var, Exp> CommMonoid for Monomial<Var, Exp>
where
    Var: Ord,
    Exp: AdditiveMonoid,
{
}

impl<Var, Exp> Pow<Exp> for Monomial<Var, Exp>
where
    Var: Ord,
    Exp: Clone + Default + Mul<Output = Exp>,
{
    type Output = Self;

    fn pow(mut self, a: Exp) -> Self::Output {
        for exp in self.0.values_mut() {
            *exp = std::mem::take(exp) * a.clone();
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combinations() {
        let x = || Combination::generator('x');
        let y = || Combination::generator('y');
        assert_eq!(x().to_string(), "x");
        assert_eq!((x() + y() + y() + x()).to_string(), "2 x + 2 y");

        let combination = x() * 2u32 + y() * 3u32;
        assert_eq!(combination.to_string(), "2 x + 3 y");
        assert_eq!(combination.eval_with_order([5, 1]), 13);
        let vars: Vec<_> = combination.variables().cloned().collect();
        assert_eq!(vars, vec!['x', 'y']);

        assert_eq!(Combination::<char, u32>::zero().to_string(), "0");

        let x = Combination::generator('x');
        assert_eq!((x.clone() * -1i32).to_string(), "(-1) x");
        assert_eq!(x.clone().neg().to_string(), "(-1) x");

        let combination = x.clone() + x.neg();
        assert_ne!(combination, Combination::default());
        assert_eq!(combination.normalize(), Combination::default());
    }

    #[test]
    fn monomials() {
        let x = || Monomial::<_, u32>::generator('x');
        let y = || Monomial::<_, u32>::generator('y');
        assert_eq!(x().to_string(), "x");
        assert_eq!((x() * y() * y() * x()).to_string(), "x^2 y^2");

        let monomial: Monomial<_, u32> = [('x', 1), ('y', 2)].into_iter().collect();
        assert_eq!(monomial.to_string(), "x y^2");
        assert_eq!(monomial.eval_with_order([10, 5]), 250);
        let vars: Vec<_> = monomial.variables().cloned().collect();
        assert_eq!(vars, vec!['x', 'y']);
        assert_eq!(monomial.map_variables(|_| 'x').to_string(), "x^3");

        assert_eq!(Monomial::<char, u32>::one().to_string(), "1");

        let monomial: Monomial<_, u32> = [('x', 1), ('y', 0), ('x', 2)].into_iter().collect();
        assert_eq!(monomial.normalize().to_string(), "x^3");

        let monomial: Monomial<_, i32> = [('x', -1), ('y', -2), ('x', 2)].into_iter().collect();
        assert_eq!(monomial.normalize().to_string(), "x y^{-2}");
    }
}
