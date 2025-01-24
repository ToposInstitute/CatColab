//! Rigs and rings.

use num_traits::{One, Zero};
use std::collections::BTreeMap;
use std::fmt::Display;
use std::ops::{Add, AddAssign, Mul, MulAssign, Neg, Sub};

use duplicate::duplicate_item;

/// A commutative monoid, written additively.
pub trait AdditiveMonoid: Add<Output = Self> + Zero {}

#[duplicate_item(T; [f32]; [f64]; [i32]; [i64]; [u32]; [u64]; [usize])]
impl AdditiveMonoid for T {}

/// An abelian group, written additively.
pub trait AbGroup: AdditiveMonoid + Neg<Output = Self> + Sub<Output = Self> {}

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
pub trait CommRing: Ring + CommMonoid {}

#[duplicate_item(T; [f32]; [f64]; [i32]; [i64])]
impl CommRing for T {}

/// TODO
#[derive(Clone, PartialEq, Eq)]
pub struct Combination<Var, Coef>(BTreeMap<Var, Coef>);

impl<Var, Coef> Combination<Var, Coef>
where
    Var: Ord,
{
    /// Generating combination on a single variable.
    pub fn generator(var: Var) -> Self
    where
        Coef: One,
    {
        Combination([(var, Coef::one())].into_iter().collect())
    }
}

impl<Var, Coef> Display for Combination<Var, Coef>
where
    Var: Display,
    Coef: Display + PartialEq + One,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut pairs = self.0.iter();
        let fmt_scalar_mul = |f: &mut std::fmt::Formatter<'_>, coef: &Coef, var: &Var| {
            if !coef.is_one() {
                write!(f, "{} ", coef)?;
            }
            write!(f, "{}", var)
        };
        if let Some((var, coef)) = pairs.next() {
            fmt_scalar_mul(f, coef, var)?;
        }
        for (var, coef) in pairs {
            write!(f, " + ")?;
            fmt_scalar_mul(f, coef, var)?;
        }
        Ok(())
    }
}

impl<Var, Coef> AddAssign for Combination<Var, Coef>
where
    Var: Ord,
    Coef: Add<Output = Coef>,
{
    fn add_assign(&mut self, rhs: Self) {
        _add_assign(&mut self.0, rhs.0)
    }
}

fn _add_assign<K, V>(lhs: &mut BTreeMap<K, V>, rhs: BTreeMap<K, V>)
where
    K: Ord,
    V: Add<Output = V>,
{
    for (var, b) in rhs {
        if let Some(a) = lhs.remove(&var) {
            lhs.insert(var, a + b);
        } else {
            lhs.insert(var, b);
        }
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
    Coef: Add<Output = Coef>,
{
    fn zero() -> Self {
        Combination(Default::default())
    }

    fn is_zero(&self) -> bool {
        self.0.is_empty()
    }
}

impl<Var, Coef> AdditiveMonoid for Combination<Var, Coef>
where
    Var: Ord,
    Coef: AdditiveMonoid,
{
}

/// TODO
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Monomial<Var, Exp>(BTreeMap<Var, Exp>);

impl<Var, Exp> Monomial<Var, Exp>
where
    Var: Ord,
{
    /// Generating monomial on a single variable.
    pub fn generator(var: Var) -> Self
    where
        Exp: One,
    {
        Monomial([(var, Exp::one())].into_iter().collect())
    }
}

impl<Var, Exp> Display for Monomial<Var, Exp>
where
    Var: Display,
    Exp: Display + PartialEq + One,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut pairs = self.0.iter();
        let fmt_power = |f: &mut std::fmt::Formatter<'_>, var: &Var, exp: &Exp| {
            write!(f, "{}", var)?;
            if !exp.is_one() {
                let exp = format!("{}", exp);
                if exp.len() == 1 {
                    write!(f, "^{}", exp)?;
                } else {
                    write!(f, "^{{{}}}", exp)?;
                }
            }
            Ok(())
        };
        if let Some((var, exp)) = pairs.next() {
            fmt_power(f, var, exp)?;
        }
        for (var, exp) in pairs {
            write!(f, " ")?;
            fmt_power(f, var, exp)?;
        }
        Ok(())
    }
}

impl<Var, Exp> MulAssign for Monomial<Var, Exp>
where
    Var: Ord,
    Exp: Add<Output = Exp>,
{
    fn mul_assign(&mut self, rhs: Self) {
        _add_assign(&mut self.0, rhs.0)
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
    Exp: Add<Output = Exp>,
{
    fn one() -> Self {
        Monomial(Default::default())
    }

    fn is_one(&self) -> bool {
        self.0.is_empty()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combinations() {
        let x = Combination::<_, u32>::generator('x');
        let y = Combination::<_, u32>::generator('y');
        assert_eq!(format!("{}", x), "x");
        assert_eq!(format!("{}", x.clone() + y.clone() + y + x), "2 x + 2 y");
    }

    #[test]
    fn monomials() {
        let x = Monomial::<_, u32>::generator('x');
        let y = Monomial::<_, u32>::generator('y');
        assert_eq!(format!("{}", x), "x");
        assert_eq!(format!("{}", x.clone() * y.clone() * y * x), "x^2 y^2");
    }
}
