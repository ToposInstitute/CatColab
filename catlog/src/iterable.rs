/** An iterable with lifetime parameter.

*Source*: the Generic Associated Types
[Explainer](https://rust-lang.github.io/generic-associated-types-initiative/explainer/iterable.html)
 */
pub trait Iterable {
    type Item<'a> where Self: 'a;
    type Iter<'a>: Iterator<Item = Self::Item<'a>> where Self: 'a;

    fn iter<'a>(&'a self) -> Self::Iter<'a>;
}
