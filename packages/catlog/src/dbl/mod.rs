/*! Double category theory and double-categorical logic.

# Organization

This module is the heart of the crate. Its purpose is to implement
double-categorical logic: double theories and their models and morphisms.

## Prerequisites

As prequisites, this module provides some general abstractions from double
category theory:

- [Virtual double categories](category) (VDCs), our preferred variant of double
  categories
- [Virtual double graphs](graph), the data underlying a virtual double category
- [Double trees](tree), the data structure for pasting diagrams in a VDC

## Double-categorical logic

Interfaces are provided for concepts from double-categorical logic:

- [Double theories](theory), a kind of two-dimensional
  [theory](https://ncatlab.org/nlab/show/theory) in the sense of logic
- [Models](model) of double theories, which are categorical structures
- [Morphisms](model_morphism) between models of double theories, generalizing
  functors between categories
- [Diagrams](model_diagram) in a model, generalizing
  [diagrams](https://ncatlab.org/nlab/show/diagram) in a category

These submodules mostly provide traits and generic data structures applicable to
any kind of double theory, model, etc. Specific kinds are implemented in the
submodules below and reexported above.

## Specific double doctrines

Just as there are many kinds of one-dimensional theories---algebraic theories,
finite limit theories, regular theories, and so on---so are there many kinds of
double theories. Each such kind we call a "double doctrine". The following
double doctrines are currently implemented, named according to their theories:

- [Discrete double theories](discrete): double theories with only trivial
  operations, and no further structure
- [Discrete tabulator theories](discrete_tabulator): double theories with
  tabulators and only trivial operations

*/

pub mod category;
pub mod graph;
pub mod tree;

pub mod model;
pub mod model_diagram;
pub mod model_morphism;
pub mod theory;

pub mod discrete;
pub mod discrete_tabulator;
