/*! Computads in dimension one.

A 1-computad, in the strictest sense of the term, is the generating data for a
free category, which is just a [graph](super::graph). This module provides
simple data structures to aid in defining computads for categories with extra
structure. For example, a computad for monoidal categories is called a "tensor
scheme" by Joyal and Street and a "pre-net" in the Petri net literature.
 */

use std::hash::Hash;

use derivative::Derivative;
use derive_more::Constructor;
use nonempty::NonEmpty;

use super::graph::ColumnarGraph;
use crate::{
    one::{ColumnarFinGraph, InvalidGraph},
    validate::{self, Validate},
    zero::*,
};

/** Top-dimensional data of a 1-computad.

Intended for use with [`Computad`].
 */
#[derive(Clone, Debug, Derivative)]
#[derivative(Default(bound = ""))]
pub struct ComputadTop<Ob, E> {
    /// Set of edges in the computad.
    pub edge_set: HashFinSet<E>,

    /// Source map of the computad.
    pub src_map: HashColumn<E, Ob>,

    /// Target map of the computad.
    pub tgt_map: HashColumn<E, Ob>,
}

impl<Ob, E> ComputadTop<Ob, E>
where
    Ob: Eq + Clone,
    E: Eq + Clone + Hash,
{
    /// Adds an edge to the computad.
    pub fn add_edge(&mut self, e: E, src: Ob, tgt: Ob) -> bool {
        self.src_map.set(e.clone(), src);
        self.tgt_map.set(e.clone(), tgt);
        self.edge_set.insert(e)
    }
}

/** A 1-computad.

The set of objects is assumed already constructed, possibly from other
generating data, while the top-dimensional generating data is provided directly.
 */
#[derive(Constructor)]
pub struct Computad<'a, Ob, ObSet, E> {
    objects: &'a ObSet,
    computad: &'a ComputadTop<Ob, E>,
}

impl<'a, Ob, ObSet, E> ColumnarGraph for Computad<'a, Ob, ObSet, E>
where
    Ob: Eq + Clone,
    ObSet: Set<Elem = Ob>,
    E: Eq + Clone + Hash,
{
    type V = Ob;
    type E = E;
    type Vertices = ObSet;
    type Edges = HashFinSet<E>;
    type Src = HashColumn<E, Ob>;
    type Tgt = HashColumn<E, Ob>;

    fn vertex_set(&self) -> &Self::Vertices {
        self.objects
    }
    fn edge_set(&self) -> &Self::Edges {
        &self.computad.edge_set
    }
    fn src_map(&self) -> &Self::Src {
        &self.computad.src_map
    }
    fn tgt_map(&self) -> &Self::Tgt {
        &self.computad.tgt_map
    }
}

impl<'a, Ob, ObSet, E> ColumnarFinGraph for Computad<'a, Ob, ObSet, E>
where
    Ob: Eq + Clone,
    ObSet: FinSet<Elem = Ob>,
    E: Eq + Clone + Hash,
{
}

impl<'a, Ob, ObSet, E> Validate for Computad<'a, Ob, ObSet, E>
where
    Ob: Eq + Clone,
    ObSet: FinSet<Elem = Ob>,
    E: Eq + Clone + Hash,
{
    type ValidationError = InvalidGraph<E>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

#[cfg(test)]
mod test {
    use super::{Computad, ComputadTop};
    use crate::one::FinGraph;
    use crate::validate::Validate;
    use crate::zero::HashFinSet;
    use core::fmt::Debug;
    use proptest::{prop_assert, proptest, sample::SizeRange, strategy::Strategy};
    use std::hash::Hash;

    pub(crate) fn computad_strategy<'b, Ob, E>(
        num_v: SizeRange,
        ob_strategy: impl Strategy<Value = Ob> + 'b,
        num_e: impl Strategy<Value = usize> + 'b,
        e_strategy: impl Strategy<Value = E> + Clone + 'b,
    ) -> impl Strategy<Value = (HashFinSet<Ob>, ComputadTop<Ob, E>)> + 'b
    where
        Ob: Eq + Clone + Hash + Debug,
        E: Eq + Clone + Hash + Debug,
    {
        (proptest::collection::vec(ob_strategy, num_v), num_e)
            .prop_flat_map(move |(v_datas, mut num_e)| {
                let num_v = v_datas.len();
                if num_v == 0 {
                    num_e = 0;
                }
                let v_datas: Vec<Ob> = v_datas.into_iter().collect();
                let to_return = (v_datas, ComputadTop::default());
                let which_edges = proptest::collection::vec(
                    ((0..num_v), (0..num_v), e_strategy.clone()),
                    2 * num_e,
                );
                which_edges.prop_map(move |zs_ws_datas| {
                    let mut to_return_now = to_return.clone();
                    let mut count_edges = 0;
                    for (z, w, e_label) in zs_ws_datas {
                        let is_new = to_return_now.1.add_edge(
                            e_label,
                            to_return_now.0[z].clone(),
                            to_return_now.0[w].clone(),
                        );
                        if is_new {
                            count_edges += 1;
                            if count_edges == num_e {
                                break;
                            }
                        }
                    }
                    to_return_now
                })
            })
            .prop_map(|(ob_set, computad_top)| {
                let mut ob_set_fixed = HashFinSet::default();
                for ob in ob_set {
                    let _ = ob_set_fixed.insert(ob);
                }
                (ob_set_fixed, computad_top)
            })
    }

    proptest! {
        #[test]
        fn computad_gives_graph((vertex_data,computad_top) in computad_strategy::<i32,i8>((0..50).into(), -50i32..400, 10usize..30, -30i8..50)) {
            let computad = Computad::new(&vertex_data,&computad_top);
            prop_assert!(computad.validate().is_ok());
            prop_assert!(computad.vertex_count() <= 50);
            prop_assert!(computad.edge_count() < 30);
            let degenerate_case = if computad.vertex_count() == 0 {computad.edge_count() == 0} else {true};
            prop_assert!(degenerate_case);
        }
    }
}
