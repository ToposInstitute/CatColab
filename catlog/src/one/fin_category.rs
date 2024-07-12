//! Data structures for finite categories.

use std::hash::{Hash, BuildHasher, BuildHasherDefault, RandomState};

use derivative::Derivative;
use ref_cast::RefCast;
use ustr::{Ustr, IdentityHasher};

use crate::zero::{Mapping, HashColumn};
use super::path::Path;
use super::graph::*;
use super::category::*;

/** Object in a finite category.

This wrapper type is just for clarity. We prohibit equations between objects, so
objects and object generators coincide.
*/
#[derive(Clone,Debug,Copy,PartialEq,Eq,Hash,RefCast)]
#[repr(transparent)]
pub struct Ob<V>(pub V);

/// Morphism in a finite category.
#[derive(Clone,Debug,Copy,PartialEq,Eq,Hash)]
pub enum Hom<V,E> {
    /// Identity morphism on an object.
    Id(V),

    /// Generating morphism of the finite category.
    Generator(E)
}

/** A finite category with explicitly defined composition law.

Such a category is not just finitely presented, but actually finite. The
composition law is defined by a hash map on pairs of morphism generators. While
very special, finite categories show up surprisingly often as schemas or
theories. For example, the schemas for graphs, symmetric graphs, reflexive
graphs, and symmetric reflexive graphs are all finite.
 */
#[derive(Clone,Derivative)]
#[derivative(Default(bound="S: Default"))]
pub struct FinCategory<V, E, S = RandomState> {
    generators: HashGraph<V,E,S>,
    compose_map: HashColumn<(E,E), Hom<V,E>>,
}

/// A finite category with objects and morphisms of type `Ustr`.
pub type UstrFinCategory =
    FinCategory<Ustr, Ustr, BuildHasherDefault<IdentityHasher>>;

impl<V,E,S> FinCategory<V,E,S>
where V: Eq+Hash+Clone, E: Eq+Hash+Clone, S: BuildHasher {
    /// Adds an object generator, returning whether it is new.
    pub fn add_ob_generator(&mut self, v: V) -> bool {
        self.generators.add_vertex(v)
    }

    /// Adds multiple object generators.
    pub fn add_ob_generators<T>(&mut self, iter: T) where T: IntoIterator<Item = V> {
        self.generators.add_vertices(iter)
    }

    /// Adds a morphism generator, returning whether it is new.
    pub fn add_hom_generator(&mut self, e: E, dom: V, cod: V) -> bool {
        self.generators.add_edge(e, dom, cod)
    }

    /// Sets the value of a binary composite.
    pub fn set_composite(&mut self, d: E, e: E, f: Hom<V,E>) {
        self.compose_map.set((d, e), f);
    }
}

impl<V,E,S> Category for FinCategory<V,E,S>
where V: Eq+Hash+Clone, E: Eq+Hash+Clone, S: BuildHasher {
    type Ob = Ob<V>;
    type Hom = Hom<V,E>;

    fn has_ob(&self, x: &Ob<V>) -> bool {
        self.generators.has_vertex(&x.0)
    }

    fn has_hom(&self, f: &Hom<V,E>) -> bool {
        match f {
            Hom::Id(v) => self.generators.has_vertex(v),
            Hom::Generator(e) => self.generators.has_edge(e),
        }
    }

    fn dom(&self, f: &Hom<V,E>) -> Ob<V> {
        Ob(match f {
            Hom::Id(v) => v.clone(),
            Hom::Generator(e) => self.generators.src(e),
        })
    }

    fn cod(&self, f: &Hom<V,E>) -> Ob<V> {
        Ob(match f {
            Hom::Id(v) => v.clone(),
            Hom::Generator(e) => self.generators.tgt(e),
        })
    }

    fn compose(&self, path: Path<Ob<V>,Hom<V,E>>) -> Hom<V,E> {
        match path {
            Path::Id(x) => self.id(x),
            Path::Seq(fs) => fs.tail.into_iter().fold(
                fs.head, |f,g| self.compose2(f,g)),
        }
    }

    fn compose2(&self, f: Hom<V,E>, g: Hom<V,E>) -> Hom<V,E> {
        match (f, g) {
            (Hom::Id(_), g) => g,
            (f, Hom::Id(_)) => f,
            (Hom::Generator(d), Hom::Generator(e)) => {
                assert!(self.generators.tgt(&d) == self.generators.src(&e),
                        "(Co)domains should be equal");
                self.compose_map.apply(&(d, e)).expect(
                    "Composition should be defined").clone()
            }
        }
    }

    fn id(&self, x: Ob<V>) -> Hom<V,E> {
        Hom::Id(x.0)
    }
}

impl<V,E,S> FgCategory for FinCategory<V,E,S>
where V: Eq+Hash+Clone, E: Eq+Hash+Clone, S: BuildHasher {
    fn has_ob_generator(&self, x: &Ob<V>) -> bool {
        self.generators.has_vertex(&x.0)
    }
    fn has_hom_generator(&self, f: &Hom<V,E>) -> bool {
        match f {
            Hom::Id(_) => false,
            Hom::Generator(e) => self.generators.has_edge(e),
        }
    }
    fn ob_generators(&self) -> impl Iterator<Item = Ob<V>> {
        self.generators.vertices().map(Ob)
    }
    fn hom_generators(&self) -> impl Iterator<Item = Hom<V,E>> {
        self.generators.edges().map(Hom::Generator)
    }
    fn generators_with_dom(&self, x: &Ob<V>) -> impl Iterator<Item = Hom<V,E>> {
        self.generators.out_edges(&x.0).map(Hom::Generator)
    }
    fn generators_with_cod(&self, x: &Ob<V>) -> impl Iterator<Item = Hom<V,E>> {
        self.generators.in_edges(&x.0).map(Hom::Generator)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nonempty::nonempty;

    #[test]
    fn fin_category() {
        let mut sch_sgraph: FinCategory<char,char> = Default::default();
        sch_sgraph.add_ob_generators(['V','E']);
        sch_sgraph.add_hom_generator('s', 'E', 'V');
        sch_sgraph.add_hom_generator('t', 'E', 'V');
        sch_sgraph.add_hom_generator('i', 'E', 'E');
        assert_eq!(sch_sgraph.ob_generators().count(), 2);
        assert_eq!(sch_sgraph.hom_generators().count(), 3);
        assert_eq!(sch_sgraph.dom(&Hom::Generator('t')), Ob('E'));
        assert_eq!(sch_sgraph.cod(&Hom::Generator('t')), Ob('V'));

        sch_sgraph.set_composite('i', 'i', Hom::Id('E'));
        sch_sgraph.set_composite('i', 's', Hom::Generator('t'));
        sch_sgraph.set_composite('i', 't', Hom::Generator('s'));
        assert_eq!(sch_sgraph.compose2(Hom::Generator('i'), Hom::Generator('i')),
                   Hom::Id('E'));
        let path = Path::Seq(nonempty![
            Hom::Generator('i'), Hom::Id('E'), Hom::Generator('i'),
            Hom::Generator('i'), Hom::Generator('s'),
        ]);
        assert_eq!(sch_sgraph.compose(path), Hom::Generator('t'));
    }
}
