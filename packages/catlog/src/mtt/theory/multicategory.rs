use std::marker::PhantomData;

use crate::mtt::{
    binary_signature::BinarySignature,
    composite::Composite,
    theory::{
        AtomicFiller, Boundary, ProArrowByBoundary, Theory, TheoryObject, TheoryProArrow,
        TheoryVerticalArrow, UnificationResult,
        list_modality::{
            CartesianListModality, ListModality, OrderPreservingMap, PlanarListModality,
            SymmetricListModality,
        },
        modal_depth::ModalDepth,
        unify_pro_arrows::default_unify_pro_arrows,
    },
};

/// A parametric modal double theory of multicategories, parameterised by a list
/// modality `L`. The theory has a single object `Object`, a single pro-arrow
/// `P: List Object -|-> Object`. Given that [TheoryVerticalArrow] already
/// includes the combinatorics of list modalities (when they are present), this
/// theory does not furnish any vertical arrow generators.
pub struct MulticategoryProto<L: ListModality>(PhantomData<L>);

/// The modal double theory of planar multicategories.
pub type Multicategory = MulticategoryProto<PlanarListModality>;

/// The modal double theory of symmetric multicategories.
pub type SymmetricMulticategory = MulticategoryProto<SymmetricListModality>;

/// The modal double theory of cartesian multicategories.
pub type CartesianMulticategory = MulticategoryProto<CartesianListModality>;

const OBJECT: &str = "Object";
const P: &str = "P";

/// Helper trait associating a theory name to each list modality for
/// multicategories.
pub trait MulticategoryName: ListModality {
    const THEORY_NAME: &'static str;
}

impl MulticategoryName for PlanarListModality {
    const THEORY_NAME: &'static str = "Multicategory";
}

impl MulticategoryName for SymmetricListModality {
    const THEORY_NAME: &'static str = "SymmetricMulticategory";
}

impl MulticategoryName for CartesianListModality {
    const THEORY_NAME: &'static str = "CartesianMulticategory";
}

impl<L: MulticategoryName> MulticategoryProto<L> {
    fn object() -> TheoryObject<Self> {
        TheoryObject::Generator(OBJECT.to_string())
    }

    fn list_of(o: &TheoryObject<Self>) -> TheoryObject<Self> {
        TheoryObject::ModalApplication(Box::new(o.clone()))
    }

    fn p_pro_arrow() -> TheoryProArrow<Self> {
        TheoryProArrow::Generator {
            name: P.to_string(),
            dom: Self::list_of(&Self::object()),
            cod: Self::object(),
        }
    }

    /// `L^d X`: the unique object at depth `d` in the modal tower.
    fn object_at_depth(d: usize) -> TheoryObject<Self> {
        Self::object().re_nest(d).expect("MulticategoryProto has a list modality")
    }

    /// Whether `pro` is the generator `P`, possibly wrapped in modal
    /// applications (`List^k P`).
    fn is_p_upto_modal(pro: &TheoryProArrow<Self>) -> bool {
        match pro {
            TheoryProArrow::Generator { name, dom, cod } => {
                *name == *P
                    && Self::unify_objects(&[cod, &Self::object()]).is_compatible()
                    && Self::unify_objects(&[dom, &Self::list_of(cod)]).is_compatible()
            }
            TheoryProArrow::ModalApplication(on) => Self::is_p_upto_modal(on),
            TheoryProArrow::Hom(_)
            | TheoryProArrow::Restriction { .. }
            | TheoryProArrow::Hole { .. } => false,
        }
    }
}

impl<L: MulticategoryName> Theory for MulticategoryProto<L> {
    const NAME: &'static str = L::THEORY_NAME;

    type ListModality = L;

    fn generating_pro_arrow_by_name(name: &str) -> Option<TheoryProArrow<Self>> {
        (name == P).then(Self::p_pro_arrow)
    }

    /// Recognise Hom and List^k P; ...; List^j P composites by their boundary.
    /// Holes and k vs j mismatches leave several ambiguous cases.
    fn pro_arrow_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> ProArrowByBoundary<Self> {
        if !Self::has_object(dom) || !Self::has_object(cod) {
            return ProArrowByBoundary::None;
        }

        let dom_depth = dom.modal_depth();
        let cod_depth = cod.modal_depth();

        // Each object pins itself to a minimum depth in the modal tower.
        // If it also unifies at depth k+1, the depth is ambiguous (a hole).
        let dom_amb =
            Self::unify_objects(&[dom, &Self::object_at_depth(dom_depth + 1)]).is_compatible();
        let cod_amb =
            Self::unify_objects(&[cod, &Self::object_at_depth(cod_depth + 1)]).is_compatible();

        if dom_amb || cod_amb {
            // Ambiguous depth generally admits multiple fillers, excepting: dom
            // rigid at depth d, cod flexible with min-depth d then only Hom(L^d
            // X) fits (no P chain since dom can't go deeper).
            if !dom_amb && dom_depth == cod_depth {
                return Self::make_hom_pro_arrow(dom, cod)
                    .map(Composite::singleton)
                    .map(ProArrowByBoundary::Determined)
                    .unwrap_or(ProArrowByBoundary::None);
            }
            // Dom rigid but shallower than cod's minimum depth: nothing fits.
            if !dom_amb && dom_depth < cod_depth {
                return ProArrowByBoundary::None;
            }
            return ProArrowByBoundary::Ambiguous;
        }

        // Both depths uniquely determined: L^dom_depth X and L^cod_depth X.
        match dom_depth.cmp(&cod_depth) {
            std::cmp::Ordering::Less => ProArrowByBoundary::None,
            std::cmp::Ordering::Equal => ProArrowByBoundary::Determined(Composite::singleton(
                TheoryProArrow::Hom(dom.clone()),
            )),
            std::cmp::Ordering::Greater => {
                // Unique filler: List^{dom_depth-1} P ; … ; List^cod_depth P
                let atoms: Vec<_> = (cod_depth..dom_depth)
                    .rev()
                    .map(|k| Self::p_pro_arrow().re_nest(k).unwrap())
                    .collect();
                ProArrowByBoundary::Determined(
                    Composite::try_from(atoms)
                        .expect("P-chain atoms are composable by construction"),
                )
            }
        }
    }

    fn generating_pro_arrows_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> ProArrowByBoundary<Self, AtomicFiller> {
        let h_fill = Self::make_hom_pro_arrow(dom, cod);
        let p_fill = (Self::unify_objects(&[dom, &Self::list_of(&Self::object())]).is_compatible()
            && Self::unify_objects(&[cod, &Self::object()]).is_compatible())
        .then(Self::p_pro_arrow);
        match (h_fill, p_fill) {
            (Some(hom), None) => ProArrowByBoundary::Determined(hom),
            (None, Some(p)) => ProArrowByBoundary::Determined(p),
            (None, None) => ProArrowByBoundary::None,
            _ => ProArrowByBoundary::Ambiguous,
        }
    }

    /// The objects are the modal tower over the single generator.
    fn has_object(obj: &TheoryObject<Self>) -> bool {
        match obj {
            TheoryObject::Generator(g) => g == OBJECT,
            TheoryObject::ModalApplication(on) => Self::has_object(on),
            TheoryObject::Hole { .. } => true,
        }
    }

    /// This theory has no vertical generators, but it has a list modality, so
    /// the default (which unconditionally returns `false`) does not apply.
    fn has_vertical_arrow(arr: TheoryVerticalArrow<Self>) -> bool {
        match arr {
            TheoryVerticalArrow::Generator { .. } => false,
            TheoryVerticalArrow::ModalStructureMap(_) => true,
            TheoryVerticalArrow::ModalApplication(on) => Self::has_vertical_arrow(*on),
        }
    }

    /// A pro-arrow is valid iff it is built from `Hom`, `P` (the sole
    /// generator), modal lifts of these, or a `Restriction` whose base is
    /// itself valid and whose legs are valid vertical composites whose
    /// codomains match the base's domain/codomain objects.
    fn has_pro_arrow(pro: &TheoryProArrow<Self>) -> bool {
        match pro {
            TheoryProArrow::Hom(o) => Self::has_object(o),

            TheoryProArrow::Generator { .. } => Self::is_p_upto_modal(pro),

            TheoryProArrow::ModalApplication(on) => Self::has_pro_arrow(on),

            TheoryProArrow::Restriction { base, dom_leg, cod_leg } => {
                if !Self::has_pro_arrow(base) {
                    return false;
                }
                let legs_valid = dom_leg.iter().all(|a| Self::has_vertical_arrow(a.clone()))
                    && cod_leg.iter().all(|a| Self::has_vertical_arrow(a.clone()));
                if !legs_valid {
                    return false;
                }
                Self::unify_objects(&[&dom_leg.cod(), &base.dom()]).is_compatible()
                    && Self::unify_objects(&[&cod_leg.cod(), &base.cod()]).is_compatible()
            }

            TheoryProArrow::Hole { .. } => false,
        }
    }

    /// Unification of pro-arrow composites for multicategories. This overrides
    /// the default in order to honour the theory's restriction equations before
    /// handing off to [`default_unify_pro_arrows`], which then handles the
    /// remaining structural work (hom-unitality, modal absorption).
    ///
    /// The equations rewritten here are those specific to this theory ---
    /// restrictions of the pro-arrow generator `P` along a structure map,
    /// plus their modal lifts:
    ///
    /// * `P(η, id)     = Hom(X)`                                         (n = 0)
    /// * `P(id, id)    = P`                                              (n = 1)
    /// * `P(μ^{n-1}, id) = List^{n-1} P ; List^{n-2} P ; … ; List P ; P` (n ≥ 2)
    ///
    /// (and modal lifts of each). Hom-restriction unitality --- the
    /// theory-generic equation `Hom(o)(f, f) = Hom(source of common leg)`
    /// --- is handled by [`default_unify_pro_arrows`]'s own canonicalisation,
    /// since it depends only on Hom being the identity pro-arrow and holds
    /// in any theory.
    fn unify_pro_arrows(
        composites: &[&Composite<TheoryProArrow<Self>>],
    ) -> UnificationResult<Composite<TheoryProArrow<Self>>> {
        // Canonicalise each composite; if any is ill-formed we cannot unify.
        let canonicalised: Vec<Composite<TheoryProArrow<Self>>> = match composites
            .iter()
            .map(|c| {
                let canonicalised: Vec<Vec<_>> =
                    c.iter().map(canonicalise_atom::<L>).collect::<Option<_>>()?;
                let composands = canonicalised.into_iter().flatten().collect::<Vec<_>>();
                composands.try_into().ok()
            })
            .collect()
        {
            Some(x) => x,
            None => return UnificationResult::Incompatible,
        };
        // The canonicalised composites are the inputs to the default unifier.
        let refs: Vec<&Composite<TheoryProArrow<Self>>> = canonicalised.iter().collect();
        default_unify_pro_arrows(&refs)
    }

    /// Search for flat cells in this theory. After canonicalisation, every
    /// composite is either `Hom(L^d X)` or a P-chain `L^{n-1}P ; … ; L^m P`,
    /// and the shape is determined entirely by its endpoint depths
    /// `(dom.modal_depth(), cod.modal_depth())`. The three cell families are:
    ///
    /// * Identity:    same depth pair on both sides, legs are identity.
    /// * Unit (η):    top is `Hom(m)`, bottom is a P-chain ending at `m`.
    /// * Composition (μ): both P-chains share a codomain depth, top's domain
    ///   depth ≤ bottom's.
    ///
    /// Every cell has an identity right leg.
    fn cell_search(
        top: &Composite<TheoryProArrow<Self>>,
        bottom: &Composite<TheoryProArrow<Self>>,
    ) -> Option<Boundary<Self>> {
        if bottom.is_empty() {
            return None;
        }
        if !top.iter().all(Self::has_pro_arrow) || !bottom.iter().all(Self::has_pro_arrow) {
            return None;
        }

        // Right corners must agree (every cell has an identity right leg).
        let right = Self::unify_objects(&[&top.cod(), &bottom.cod()]).most_specific()?;
        if !Self::has_object(&right) {
            return None;
        }

        // Canonicalise and read off depth pairs. An empty top is the identity
        // at the right corner's depth.
        let right_depth = right.modal_depth();
        let (top_canon, tn, tm) = if top.is_empty() {
            (None, right_depth, right_depth)
        } else {
            let canon = Self::unify_pro_arrows(&[top]).most_specific()?;
            let tn = canon.dom().modal_depth();
            let tm = canon.cod().modal_depth();
            (Some(canon), tn, tm)
        };
        let bottom_canon = Self::unify_pro_arrows(&[bottom]).most_specific()?;
        let (bn, bm) = (bottom_canon.dom().modal_depth(), bottom_canon.cod().modal_depth());

        // Codomain depths must agree.
        if tm != bm {
            return None;
        }

        // Compute the left vertical leg.
        let left_leg = if tn == bn {
            // Identity cell (including Hom = Hom).
            Composite::empty()
        } else if tn == tm && tn < bn {
            // Unit: Hom(L^m X) => P-chain, left leg is eta: [tn] -> [bn].
            Composite::singleton(TheoryVerticalArrow::ModalStructureMap(eta_map(tn, bn)))
        } else if tn > bn && bn > bm {
            // Composition: P-chain => P-chain, left leg is mu: [tn] -> [bn].
            Composite::singleton(TheoryVerticalArrow::ModalStructureMap(mu_map(tn, bn)))
        } else {
            return None;
        };

        // Corner objects from canonical composites
        let top_left = top_canon
            .as_ref()
            .map_or_else(|| Self::object_at_depth(right_depth), |c| c.dom());
        let bottom_left = bottom_canon.dom();
        if !Self::has_object(&top_left) || !Self::has_object(&bottom_left) {
            return None;
        }

        Some(Boundary {
            dom_dom_object: top_left,
            dom_cod_object: right.clone(),
            cod_dom_object: bottom_left,
            cod_cod_object: right,
            dom_vertical: left_leg,
            cod_vertical: Composite::empty(),
            dom_proarrow: top.clone(),
            cod_proarrow: bottom.clone(),
        })
    }
}

// -----------------------------------------------------------------------------
// Canonicalisation of pro-arrow atoms

/// Canonicalise a single atom into a (possibly-empty) sequence of atoms via the
/// restriction equations.
fn canonicalise_atom<L: MulticategoryName>(
    atom: &TheoryProArrow<MulticategoryProto<L>>,
) -> Option<Vec<TheoryProArrow<MulticategoryProto<L>>>> {
    match atom {
        TheoryProArrow::Hom(_) | TheoryProArrow::Generator { .. } => Some(vec![atom.clone()]),

        TheoryProArrow::ModalApplication(on) => {
            let inner = canonicalise_atom::<L>(on)?;
            Some(
                inner
                    .into_iter()
                    .map(|a| TheoryProArrow::ModalApplication(Box::new(a)))
                    .collect(),
            )
        }

        TheoryProArrow::Restriction { base, dom_leg, cod_leg } => {
            // Recursively canonicalise the base.
            let base_canon = canonicalise_atom::<L>(base)?;

            // Restriction is functorial: (P_1 ; ... ; P_n)(f, g) distributes
            // as P_1(f, id) ; P_2 ; ... ; P_{n-1} ; P_n(id, g).
            let last_index = base_canon.len() - 1;
            let mut out = Vec::new();
            for (i, atom) in base_canon.into_iter().enumerate() {
                let domain_leg = if i == 0 {
                    dom_leg.clone()
                } else {
                    Composite::empty()
                };
                let codomain_leg = if i == last_index {
                    cod_leg.clone()
                } else {
                    Composite::empty()
                };
                if domain_leg.is_empty() && codomain_leg.is_empty() {
                    out.push(atom);
                } else if let Some(reduced) =
                    reduce_p_restriction::<L>(&atom, &domain_leg, &codomain_leg)
                {
                    out.extend(reduced);
                } else {
                    out.push(TheoryProArrow::Restriction {
                        base: Box::new(atom),
                        dom_leg: domain_leg,
                        cod_leg: codomain_leg,
                    });
                }
            }
            Some(out)
        }

        TheoryProArrow::Hole { .. } => Some(vec![atom.clone()]),
    }
}

/// If `base` is `List^k(P)`, apply the restriction equations for
/// multicategories. Returns `None` if the base is not `List^k(P)` or the legs
/// are malformed.
fn reduce_p_restriction<L: MulticategoryName>(
    base: &TheoryProArrow<MulticategoryProto<L>>,
    dom_leg: &Composite<TheoryVerticalArrow<MulticategoryProto<L>>>,
    cod_leg: &Composite<TheoryVerticalArrow<MulticategoryProto<L>>>,
) -> Option<Vec<TheoryProArrow<MulticategoryProto<L>>>> {
    if !MulticategoryProto::<L>::is_p_upto_modal(base) {
        return None;
    }
    let outer_depth = base.modal_depth();

    // Cod leg: must canonicalise to identity.
    let cod_leg_norm =
        MulticategoryProto::<L>::unify_vertical_arrows(&[cod_leg]).most_specific()?;
    if !cod_leg_norm.is_empty() {
        return None;
    }

    // Dom leg: must canonicalise to a single ModalStructureMap.
    let map = match MulticategoryProto::<L>::unify_vertical_arrows(&[dom_leg])
        .most_specific()?
        .only()?
    {
        TheoryVerticalArrow::ModalStructureMap(m) => Some(m.clone()),
        TheoryVerticalArrow::Generator { .. } | TheoryVerticalArrow::ModalApplication(_) => None,
    }?;

    // The base is L^outer_depth(P), whose domain is L^{outer_depth+1}(X),
    // so the dom_leg map must target [outer_depth + 1].
    if map.cod() != 1 + outer_depth {
        return None;
    }

    // For the restriction equations to apply, the outer `outer_depth`
    // positions of the map must be identities (the modal wrapping), leaving
    // an inner map [n] -> [1] that acts on the bare P.
    let inner_map = map.outer_unlift(outer_depth)?;
    if inner_map.cod() != 1 {
        return None;
    }
    let n = inner_map.dom();

    // Apply the equation:
    //   n = 0: Hom
    //   n ≥ 1: P-chain of length n = [List^{n-1} P, …, List P, P]
    // in both cases re-wrapped in `outer_depth` layers of List.
    if n == 0 {
        let hom_at_depth = MulticategoryProto::<L>::object()
            .re_nest(outer_depth)
            .expect("MulticategoryProto has a list modality");
        Some(vec![TheoryProArrow::Hom(hom_at_depth)])
    } else {
        let out: Vec<_> = (0..n)
            .rev()
            .map(|k| {
                MulticategoryProto::<L>::p_pro_arrow()
                    .re_nest(k + outer_depth)
                    .expect("MulticategoryProto has a list modality")
            })
            .collect();
        Some(out)
    }
}

// -----------------------------------------------------------------------------
// Canonical structure maps for cell_search

/// The η-map for the unit cell `Hom(m) ⇒ P-chain(n, m)`, i.e. the canonical map
/// `[m] → [n]` in the theory's list modality that includes `[m]` into `[n]`
/// as the outermost `m` positions of `[n]`.
///
/// Constructed abstractly as `outer_lift` (by `m`) of the unique map
/// `[0] → [n - m]` provided by the modality, which is the iterated η at the
/// innermost side.
///
/// Precondition: `n > m`.
fn eta_map(m: usize, n: usize) -> OrderPreservingMap {
    debug_assert!(n > m);
    OrderPreservingMap::unique_eta_from_zero_to(n - m).outer_lift(m)
}

/// The μ-map for the composition cell `P-chain(n, m) ⇒ P-chain(n', m)`, i.e.
/// the canonical map `[n] → [n']` obtained by folding the innermost
/// `n - n' + 1` positions into one.
///
/// Constructed abstractly as `outer_lift` (by `n' - 1`) of the unique map
/// `[n - n' + 1] → [1]` provided by the modality, which is the iterated μ at
/// the innermost side.
///
/// Precondition: `n > n' ≥ 1`.
fn mu_map(n: usize, n_prime: usize) -> OrderPreservingMap {
    debug_assert!(n > n_prime);
    debug_assert!(n_prime >= 1);
    OrderPreservingMap::unique_mu_to_one_from(n - n_prime + 1).outer_lift(n_prime - 1)
}
