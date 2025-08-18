//! Commutative algebra and polynomials.

use num_traits::{One, Pow, Zero};
use std::collections::BTreeMap;
use std::fmt::Display;
use std::iter::{Product, Sum};
use std::ops::{Add, AddAssign, Mul, Neg};

use derivative::Derivative;

use super::rig::*;

/// A commutative algebra over a commutative ring.
pub trait CommAlg: CommRing + Module<Ring = Self::R> {
    /// The base ring of the algebra.
    type R: CommRing;

    /** Convert an element of the base ring into an element of the algebra.

    A commutative algebra A over a commutative ring R can be defined as a ring
    homomorphism from R to A. This method computes that homomorphism.
     */
    fn from_scalar(r: Self::R) -> Self {
        Self::one() * r
    }
}

/** A polynomial in several variables.

This data structure is for polynomials in *normal form*: a **polynomial** is a
formal linear combination of monomials in which no monomial is repeated, and no
variable is repeated within any monomial. The implementation is indeed a
[`Combination`] of a [`Monomial`]s. The use of a normal form means that
polynomial arithmetic automatically performs certain simplifications.

In abstract terms, polynomials with coefficients valued in a [commutative
ring](super::rig::CommRing) *R* are the free [commutative algebra](CommAlg)
over *R*.
 */
#[derive(Clone, PartialEq, Eq, Derivative)]
#[derivative(Default(bound = ""))]
pub struct Polynomial<Var, Coef, Exp>(Combination<Monomial<Var, Exp>, Coef>);

impl<Var, Coef, Exp> Polynomial<Var, Coef, Exp>
where
    Var: Ord,
    Exp: Ord,
{
    /// Constructs the generating polynomial corresponding to a variable.
    pub fn generator(var: Var) -> Self
    where
        Coef: One,
        Exp: One,
    {
        Polynomial::from_monomial(Monomial::generator(var))
    }

    /// Constructs the polynomial corresponding to a monomial.
    pub fn from_monomial(m: Monomial<Var, Exp>) -> Self
    where
        Coef: One,
    {
        Polynomial(Combination::generator(m))
    }

    /// Iterates over the monomials in the polynomial.
    pub fn monomials(&self) -> impl ExactSizeIterator<Item = &Monomial<Var, Exp>> {
        self.0.variables()
    }

    /** Maps the coefficients of the polynomial.

    In the usual situations when the coefficients from commutative rigs and the
    mapping is a rig homomorphism, this operation is extension of scalars
    applied to free commutative algebras.
     */
    pub fn extend_scalars<NewCoef, F>(self, f: F) -> Polynomial<Var, NewCoef, Exp>
    where
        F: FnMut(Coef) -> NewCoef,
    {
        Polynomial(self.0.extend_scalars(f))
    }

    /// Evaluates the polynomial by substituting for the variables.
    pub fn eval<A, F>(&self, f: F) -> A
    where
        A: Clone + Mul<Coef, Output = A> + Pow<Exp, Output = A> + Sum + Product,
        F: Clone + FnMut(&Var) -> A,
        Coef: Clone,
        Exp: Clone,
    {
        self.0.eval_with_order(self.monomials().map(|m| m.eval(f.clone())))
    }

    /** Evaluates the polynomial on a sequence of variable-value pairs.

    This is a convenient way to evaluate the polynomial at a single point but it
    is not very efficient.
    */
    pub fn eval_pairs<A>(&self, pairs: impl IntoIterator<Item = (Var, A)>) -> A
    where
        A: Clone + Mul<Coef, Output = A> + Pow<Exp, Output = A> + Sum + Product,
        Coef: Clone,
        Exp: Clone,
    {
        let map: BTreeMap<Var, A> = pairs.into_iter().collect();
        self.eval(|var| map.get(var).cloned().unwrap())
    }

    /** Maps over the variables in the polynomial.

    The mapping need not be injective. This is conceptually equivalent to
    [evaluating](Polynomial::eval) the polynomial with a map that sends
    generators to generators but avoids assuming that an arbitrary polynomial
    can be exponentiated, which is only makes sense when the exponents are
    nonnegative integers.
     */
    pub fn map_variables<NewVar, F>(&self, mut f: F) -> Polynomial<NewVar, Coef, Exp>
    where
        Coef: Clone + Add<Output = Coef>,
        Exp: Clone + Add<Output = Exp>,
        NewVar: Clone + Ord,
        F: FnMut(&Var) -> NewVar,
    {
        (&self.0)
            .into_iter()
            .map(|(coef, m)| (coef.clone(), m.map_variables(|var| f(var))))
            .collect()
    }

    /** Puts the polynomial into normal form.

    The data structure for polynomials is already pretty close to being a normal
    form, but allows the possibility of coefficients or exponents being zero.
    This method removes those if present.
     */
    pub fn normalize(self) -> Self
    where
        Coef: Zero,
        Exp: Zero,
    {
        self.0
            .into_iter()
            .filter_map(|(coef, m)| {
                if coef.is_zero() {
                    None
                } else {
                    Some((coef, m.normalize()))
                }
            })
            .collect()
    }
}

impl<Var, Coef, Exp> FromIterator<(Coef, Monomial<Var, Exp>)> for Polynomial<Var, Coef, Exp>
where
    Var: Ord,
    Coef: Add<Output = Coef>,
    Exp: Ord,
{
    fn from_iter<T: IntoIterator<Item = (Coef, Monomial<Var, Exp>)>>(iter: T) -> Self {
        Polynomial(iter.into_iter().collect())
    }
}

impl<Var, Coef, Exp> Display for Polynomial<Var, Coef, Exp>
where
    Var: Display,
    Coef: Display + PartialEq + One,
    Exp: Display + PartialEq + One,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

// XXX: Lots of boilerplate to delegate the module structure of `Polynomial` to
// `Combination` because these traits cannot be derived automatically.

impl<Var, Coef, Exp> AddAssign<(Coef, Monomial<Var, Exp>)> for Polynomial<Var, Coef, Exp>
where
    Var: Ord,
    Coef: Add<Output = Coef>,
    Exp: Ord,
{
    fn add_assign(&mut self, rhs: (Coef, Monomial<Var, Exp>)) {
        self.0 += rhs;
    }
}

impl<Var, Coef, Exp> Add for Polynomial<Var, Coef, Exp>
where
    Var: Ord,
    Coef: Add<Output = Coef>,
    Exp: Ord,
{
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Polynomial(self.0 + rhs.0)
    }
}

impl<Var, Coef, Exp> Zero for Polynomial<Var, Coef, Exp>
where
    Var: Ord,
    Coef: Add<Output = Coef> + Zero,
    Exp: Ord,
{
    fn zero() -> Self {
        Polynomial(Combination::default())
    }

    fn is_zero(&self) -> bool {
        self.0.is_zero()
    }
}

impl<Var, Coef, Exp> AdditiveMonoid for Polynomial<Var, Coef, Exp>
where
    Var: Ord,
    Coef: AdditiveMonoid,
    Exp: Ord,
{
}

impl<Var, Coef, Exp> Mul<Coef> for Polynomial<Var, Coef, Exp>
where
    Var: Ord,
    Coef: Clone + Default + Mul<Output = Coef>,
    Exp: Ord,
{
    type Output = Self;

    fn mul(self, a: Coef) -> Self::Output {
        Polynomial(self.0 * a)
    }
}

impl<Var, Coef, Exp> RigModule for Polynomial<Var, Coef, Exp>
where
    Var: Ord,
    Coef: Clone + Default + CommRig,
    Exp: Ord,
{
    type Rig = Coef;
}

impl<Var, Coef, Exp> Neg for Polynomial<Var, Coef, Exp>
where
    Var: Ord,
    Coef: Default + Neg<Output = Coef>,
    Exp: Ord,
{
    type Output = Self;

    fn neg(self) -> Self::Output {
        Polynomial(self.0.neg())
    }
}

impl<Var, Coef, Exp> AbGroup for Polynomial<Var, Coef, Exp>
where
    Var: Ord,
    Coef: Default + AbGroup,
    Exp: Ord,
{
}

impl<Var, Coef, Exp> Module for Polynomial<Var, Coef, Exp>
where
    Var: Ord,
    Coef: Clone + Default + CommRing,
    Exp: Ord,
{
    type Ring = Coef;
}

/// Multiply polynomials using the distributive law.
impl<Var, Coef, Exp> Mul for Polynomial<Var, Coef, Exp>
where
    Var: Clone + Ord,
    Coef: Clone + Add<Output = Coef> + Mul<Output = Coef>,
    Exp: Clone + Ord + Add<Output = Exp>,
{
    type Output = Self;

    fn mul(self, rhs: Self) -> Self::Output {
        // Avoid unnecessary clones by tracking whether we're in the last
        // iteration of the outer and inner loops.
        let mut result = Polynomial::default();
        let (outer, inner) = (self.0, rhs.0);
        let mut outer_iter = outer.into_iter();
        while let Some((a, m)) = outer_iter.next() {
            if outer_iter.len() == 0 {
                let mut inner_iter = inner.into_iter();
                while let Some((b, n)) = inner_iter.next() {
                    if inner_iter.len() == 0 {
                        result += (a * b, m * n);
                        break;
                    } else {
                        result += (a.clone() * b, m.clone() * n);
                    }
                }
                break;
            } else {
                for (b, n) in &inner {
                    result += (a.clone() * b.clone(), m.clone() * n.clone());
                }
            }
        }
        result
    }
}

impl<Var, Coef, Exp> One for Polynomial<Var, Coef, Exp>
where
    Var: Clone + Ord,
    Coef: Clone + Add<Output = Coef> + One,
    Exp: Clone + Ord + Add<Output = Exp>,
{
    fn one() -> Self {
        Polynomial::from_monomial(Default::default())
    }
}

impl<Var, Coef, Exp> Monoid for Polynomial<Var, Coef, Exp>
where
    Var: Clone + Ord,
    Coef: Clone + Rig,
    Exp: Clone + Ord + AdditiveMonoid,
{
}

impl<Var, Coef, Exp> Rig for Polynomial<Var, Coef, Exp>
where
    Var: Clone + Ord,
    Coef: Clone + Rig,
    Exp: Clone + Ord + AdditiveMonoid,
{
}

impl<Var, Coef, Exp> Ring for Polynomial<Var, Coef, Exp>
where
    Var: Clone + Ord,
    Coef: Clone + Default + Ring,
    Exp: Clone + Ord + AdditiveMonoid,
{
}

impl<Var, Coef, Exp> CommMonoid for Polynomial<Var, Coef, Exp>
where
    Var: Clone + Ord,
    Coef: Clone + CommRig,
    Exp: Clone + Ord + AdditiveMonoid,
{
}

impl<Var, Coef, Exp> CommRig for Polynomial<Var, Coef, Exp>
where
    Var: Clone + Ord,
    Coef: Clone + CommRig,
    Exp: Clone + Ord + AdditiveMonoid,
{
}

impl<Var, Coef, Exp> CommRing for Polynomial<Var, Coef, Exp>
where
    Var: Clone + Ord,
    Coef: Clone + Default + CommRing,
    Exp: Clone + Ord + AdditiveMonoid,
{
}

impl<Var, Coef, Exp> CommAlg for Polynomial<Var, Coef, Exp>
where
    Var: Clone + Ord,
    Coef: Clone + Default + CommRing,
    Exp: Clone + Ord + AdditiveMonoid,
{
    type R = Coef;

    fn from_scalar(r: Self::R) -> Self {
        [(r, Monomial::one())].into_iter().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn polynomials() {
        let x = || Polynomial::<_, i32, u32>::generator('x');
        let y = || Polynomial::<_, i32, u32>::generator('y');
        assert_eq!(x().to_string(), "x");

        let p = Polynomial::<char, i32, u32>::from_scalar(-5);
        assert_eq!(p.eval_pairs::<i32>([]), -5);

        let p = x() * y() * x() * 2 + y() * x() * y() * 3;
        assert_eq!(p.to_string(), "3 x y^2 + 2 x^2 y");
        assert_eq!(p.map_variables(|_| 'x').to_string(), "5 x^3");
        assert_eq!(p.eval_pairs([('x', 1), ('y', 1)]), 5);
        assert_eq!(p.eval_pairs([('x', 1), ('y', 2)]), 16);
        assert_eq!(p.eval_pairs([('y', 1), ('x', 2)]), 14);

        let p = (x() + y()) * (x() + y());
        assert_eq!(p.to_string(), "2 x y + x^2 + y^2");

        let p = (x() + y()) * (x() + y().neg());
        assert_eq!(p.normalize().to_string(), "x^2 + (-1) y^2");
    }
}
