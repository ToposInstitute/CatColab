#![allow(missing_docs, dead_code, unused_imports)]

use catlog::zero::column::{Column, Mapping};
use std::collections::HashMap;
use std::fmt::Display;
use std::rc::Rc;

type Map<K, V> = HashMap<K, V>;

// Uniform representation for entity ids.
// We will need to revisit this decision.
type EntityId = usize;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum Repr { Usize, String }
impl Display for Repr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Repr::Usize => write!(f, "usize"),
            Repr::String => write!(f, "String"),
        }
    }
}

#[derive(Debug)]
enum TaggedMap {
    Id(Map<EntityId, ()>),
    IdId(Map<EntityId, usize>),
    IdString(Map<EntityId, String>),
}

impl TaggedMap {
    fn dom(&self) -> Repr { self.dom_cod().0 }
    fn cod(&self) -> Option<Repr> { self.dom_cod().1 }
    fn dom_cod(&self) -> (Repr, Option<Repr>) {
        use TaggedMap::*; use Repr::*;
        match self {
            Id(_) => (Usize, None),
            IdId(_) => (Usize, Some(Usize)),
            IdString(_) => (Usize, Some(String)),
        }
    }
}

// TODO: TryFrom, maybe?
macro_rules! tagged_map {
    ($constructor:ident, $Key:ty, $Value:ty) => {
        impl<'a> From<&'a TaggedMap> for &'a Map<$Key, $Value> {
            fn from(x: &TaggedMap) -> &Map<$Key, $Value> {
                let TaggedMap::$constructor(m) = x else {
                    panic!("tag error")
                };
                m
            }
        }
        // impl From<TaggedMap> for Map<$Key, $Value> {
        //     fn from(x: TaggedMap) -> Map<$Key, $Value> {
        //         let TaggedMap::$constructor(m) = x else {
        //             // TODO: better error message on panic
        //             panic!("tag error")
        //         };
        //         m
        //     }
        // }
        impl From<Map<$Key, $Value>> for TaggedMap {
            fn from(m: Map<$Key, $Value>) -> TaggedMap {
                TaggedMap::$constructor(m)
            }
        }
    };
}
tagged_map!(Id, EntityId, ());
tagged_map!(IdId, EntityId, EntityId);
tagged_map!(IdString, EntityId, String);

// TODO: I'm cloning strings all over the place, this is dumb.
type Name = String;

/// The underlying relational data of an instance.
type Mappings = HashMap<Name, TaggedMap>;

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
enum EntityOrAttr { Entity(Name), Attr(Repr), }

#[derive(Debug)]
struct Schema {
    /// Set of names for entity objects.
    entities: Vec<Name>,
    /// A map from morphism names to their dom/cod types.
    /// All morphisms go from entities to either entities or attributes.
    morphisms: Map<Name, (Name, EntityOrAttr)>,
}

#[derive(Debug)]
struct Instance {
    schema: Rc<Schema>,
    mappings: Mappings,
}


// ---------- QUERYING ----------
// let's do WCO at first and do it badly

// A query "var" is an entity in self.mappings[map] for map ∈ schema.entities.
// A query "atom" is a row in self.mappings[map] for map ∈ schema.morphisms.
//
// A var is represented as (entity_name: &Name, entity_id: EntityId).
// An atom is represented as (map_name: &Name, key: EntityId).
type Var<'a> = (&'a Name, EntityId);
type Atom<'a> = (&'a Name, EntityId);

impl Instance {
    #[allow(unused_variables, unreachable_code, unused_mut)]
    fn query(&self, database: Instance) {
        assert!(Rc::ptr_eq(&self.schema, &database.schema));

        // TODO: check the query is connected. BIGGER TODO: if it's not
        // connected, decompose it into disjoint components and query for them
        // separately.
        eprintln!("WARNING: blithely assuming query is connected and that every var (entity) is covered by an atom (morphism)");

        // Pick a variable order over entity ids in self.
        //
        // Note that query attributes are treated as constants, not variables. TODO: also
        // support constants for entities and variables for attributes.
        //
        // For now, we pick the order very badly.
        // TODO: compute an actually reasonable var order:
        // - put join keys (vars appearing in multiple atoms) first!
        // - eagerly insert vars that are functionally determined by prior vars!
        let mut var_order: Vec<Var> = Vec::new();
        for entity in self.schema.entities.iter() {
            let table: &Map<EntityId, ()> = (&self.mappings[entity]).into();
            for &id in table.keys() {
                var_order.push((&entity, id))
            }
        }
        let var_order = var_order;

        // For every atom, find the variables it touches.
        let atom_vars: HashMap<Atom, Vec<Var>> = Vec::new();
        for (map_name, (dom, cod)) in self.schema.morphisms.iter() {
            // For each row, determine which variables it touches.
            todo!()
        }

        // I'm going to need some structure to represent the partial var-entity bindings
        // so far. We go through vars in a fixed order, and each var gets mapped to a
        // particular EntityId, so a partial binding is just a Vec<EntityId>. TODO LATER:
        // Once we have multiple entity representations this may cause tagging overhead!
        let mut bindings: Vec<Vec<EntityId>> = vec![Vec::new()];

        // Following recipe from
        // https://github.com/frankmcsherry/blog/blob/master/posts/2025-12-23.md#atomization
        //
        // 1 For each var in some order,
        // 2   For each atom that mentions the var,
        // 2a     For each binding of values to prior vars,
        // 2b     Count the # of distinct values that extend that binding.
        // 3   For each atom that mentions the var,
        // 3a    For each binding of values to prior vars,
        // 3b    If this atom had least count, enumerate new values.
        // 4   For each atom that mentions the var,
        // 4a    For each binding of values to prior vars,
        // 4b    If the binding is not in the atom, discard the binding.
        //
        for (entity, id) in var_order { // 1 For each var in some order
            // Find the atoms that mention this var.
            // Atoms are rows in self.mappings[map] for map ∈ schema.morphisms.
            // An atom is represented as a pair (map: &Name, key: EntityId).
            // TODO: We might want to cache more data about it, though.
            let mut atoms: Vec<(&Name, EntityId)> = Vec::new();
            for (name, (dom, cod)) in self.schema.morphisms.iter() {
                // Does the type (dom/cod) of this morphism mention `entity`?
                // If not, skip it.
                let indom = dom == entity;
                let incod = cod == &EntityOrAttr::Entity(entity.clone());
                if !indom && !incod { continue };

                let tagged_map = &self.mappings[name];
                assert!(tagged_map.dom() == Repr::Usize);

                // If we're in the cod, we must scan all entries to find where.
                // With Column, this would use preimage().
                if incod { todo!() }

                // If we're in the dom, we look up our own entity id to find
                // what it's related to.

                // For each entry, does it mention this variable?
                todo!();

                // It mentions us; add it to the atom list.
                atoms.push((name, todo!()))
            }
        }
    }
}

// for (i,x) in R
//  for (y,j) in S
//   for k in T[y]
//    for l in U[y]
//     yield (x,y,i,j,k,l)


// ---------- SELF CHECKS ON SCHEMAS & INSTANCES (ie type/tag checks) ----------
impl Schema {
    // check that the keys of self.entities and self.morphisms don't overlap.
    fn self_check(&self) {
        for name in self.entities.iter() {
            if self.morphisms.contains_key(name) {
                panic!("Name {} used both as entity type and morphism", name)
            }
        }
    }
}

impl Instance {
    fn self_check(&self) {
        self.schema.self_check();

        // Check that everything in self.mappings is in the schema (no extraneous mappings).
        for (name, _) in self.mappings.iter() {
            if self.schema.entities.contains(name) { continue }
            if self.schema.morphisms.contains_key(name) { continue }
            panic!("Missing data for morphism {}", name);
        }

        // Check that everything in the schema is in self.mappings with the right type.
        for entity_name in self.schema.entities.iter() {
            let Some(mapping) = self.mappings.get(entity_name) else {
                panic!("Missing data for entity {}", entity_name);
            };
            if !matches!(mapping.dom_cod(), (Repr::Usize, None)) {
                panic!("Data for entity {} has wrong type", entity_name);
            }
        }

        for (name, (dom, cod)) in self.schema.morphisms.iter() {
            let _: &Name = dom;
            let Some(mapping) = self.mappings.get(name) else {
                panic!("Missing data for morphism {}", name);
            };
            let (actual_dom, actual_cod) = mapping.dom_cod();
            if !matches!(actual_dom, Repr::Usize) {
                panic!("Data for morphism {} has wrong domain type", name);
            }
            match (cod, actual_cod) {
                (EntityOrAttr::Entity(_), Some(Repr::Usize)) => {}
                (EntityOrAttr::Attr(want), Some(got)) if *want == got => {}
                _ => panic!("Data for morphism {} has wrong codomain type", name),
            }
        }
    }
}


fn main() {
    println!("hello world");
}
