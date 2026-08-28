// Because Petri nets and stock-flow diagrams are different types of models (unital modal and
// discrete tabulator, respectively), we need a different structs for each one, since to implement
// `ODESemantics` we need to specify a `ModelType`. In particular, they will need different
// implementations of `ODESemanticsAnalysis::build_system_builder`. Furthermore, we implement the
// corresponding "unbalanced" semantics for each.
//
// For Petri nets, each transition gives a positive contribution to each term corresponding to one
// of its outputs, and a negative contribution to each term corresponding to one of its inputs. For
// example, a single transition T: [a,b] -> [x,y] will give four contributions, namely
//
// - two positive contributions:
//      (ab -> x , ab -> y)
//
// - two negative contributions:
//      (ab -> a , ab -> b).
//
// The variations of mass-action determine the coefficients of these contributions:
//
// - In the *balanced* (i.e. classical) case, all four contributions will have the same coefficient.
//
// - In the *unbalanced* (per-transition) case, the two positive contributions will have the same
//   coefficient (the "production rate" of the transition) and the two negative contributions will
//   have the same coefficient (the "consumption rate" of the transition).
//
// - In the *per-place* case, the production (resp. consumption) rates from the unbalanced case are
//   now potentially distinct, i.e. each coefficient depends on a *pair* (transition, place).
//
// For stock-flow diagrams, each flow gives a positive contribution to the term corresponding to its
// output, and a negative contribution to the term corresponding to its input; the term is given by
// the product of the input with the sources of all incoming links. The balanced and unbalanced
// cases are analogous to those for Petri nets (by thinking of a flow as a single-input and
// single-output transition).

pub(crate) mod balanced;
pub(crate) mod per_place;
pub(crate) mod unbalanced;
