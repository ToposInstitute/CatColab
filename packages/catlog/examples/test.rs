#![allow(missing_docs, dead_code, unused_imports)]

use catlog::zero::column::{Column, Mapping};
use std::collections::HashMap;
use std::collections::HashSet;
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
    IdId(Map<EntityId, EntityId>),
    IdString(Map<EntityId, String>),
    // // We need these for reverse indices. TODO
    // StringId(Map<String, EntityId>),
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
            // SHITBALLS.
            // StringId(_) => (String, 
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
//
// TODO: I should have separate types for entity names and morphism names so I can't mix them up on
// accident.
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

// I'm going to need some structure to represent the partial var-entity bindings
// so far. We go through vars in a fixed order, and each var gets mapped to a
// particular EntityId, so a partial binding is just a Vec<EntityId>. TODO LATER:
// Once we have multiple entity representations this may cause tagging overhead!
type Binding = Vec<EntityId>;

// ##### CONCRETE EXAMPLE OF A QUERY #####
// schema:
//  entities   { Employee, Dept }
//  morphisms  { dept: Employee -> Dept, name: Dept -> String }
//
// query:  "find all employees in a department named 'accounting'"
//   e: Employee
//   d: Dept
//   dept(e) = d
//   name(d) = "accounting"
//
// Concretely, say we pick var order [d, e]. Our variables are
//   d = (&"Dept", 0)
//   e = (&"Employee", 0)
//
// Our atoms are
//   dept(e) = d                    (&"dept", 0)
//   name(d) = "accounting"         (&"name", 0)
//
// So if we're currently solving for var = d = ("Dept", 0) then
//
//   count_atom = (&"name", 0)
//
// and we are trying to enumerate departments named "accounting".
//
// Once we have picked such a d and are solving for var = e = ("Employee",
// 0), then
//
//   count_atom = (&"dept", 0)
//
// and we are trying to enumerate employees whose department is d.
//
// Let X stand for the `var` we are solving for right now.
// Let C stand for known values (constants, or variables we have already solved).
// Let V stand for yet-to-be-solved variables.
// In general, there are five possible shapes the atom can have:
//
// 1  f(C) = X      2  f(X) = C
// 3  f(V) = X      4  f(X) = V     5  f(X) = X
//
// Each one implies a different strategy.
impl Instance {
    #[allow(unused_variables, unreachable_code, unused_mut)]
    fn query(&self, database: Instance) {
        assert!(Rc::ptr_eq(&self.schema, &database.schema));

        // TODO: check the query is connected. BIGGER TODO: if it's not
        // connected, decompose it into disjoint components and query for them
        // separately.
        eprintln!("WARNING: blithely assuming query is connected and that every var (entity) is covered by an atom (morphism)");

        // Pick a variable order over entity ids in self.
        // For now, we pick the order very badly.
        //
        // TODO: compute an actually reasonable var order:
        // - put join keys (vars appearing in multiple atoms) first!
        // - eagerly insert vars that are functionally determined by prior vars!
        //
        // Note that query attributes are treated as constants, not variables.
        //
        // TODO: also support constants for entities and variables for attributes.
        let mut var_order: Vec<Var> = Vec::new();
        for entity in self.schema.entities.iter() {
            let table: &Map<EntityId, ()> = (&self.mappings[entity]).into();
            for &id in table.keys() {
                var_order.push((&entity, id))
            }
        }
        let var_order = var_order;
        let var_position: HashMap<Var, usize> =
            var_order.iter().enumerate().map(|(i,&x)| (x,i)).collect();

        // For every atom, find the variables it touches.
        let mut atom_vars: HashMap<Atom, Vec<Var>> = HashMap::new();
        for (map_name, (dom, cod)) in self.schema.morphisms.iter() {
            // For each row, determine which variables it touches.
            todo!()
        }
        let atom_vars = atom_vars;
        // for (name, (dom, cod)) in self.schema.morphisms.iter() {
        //     // Does the type (dom/cod) of this morphism mention `entity`?
        //     // If not, skip it.
        //     let indom = dom == entity;
        //     let incod = cod == &EntityOrAttr::Entity(entity.clone());
        //     if !indom && !incod { continue };
        //     let tagged_map = &self.mappings[name];
        //     assert!(tagged_map.dom() == Repr::Usize);
        //     // If we're in the cod, we must scan all entries to find where.
        //     // With Column, this would use preimage().
        //     if incod { todo!() }
        //     // If we're in the dom, we look up our own entity id to find
        //     // what it's related to.
        //     // For each entry, does it mention this variable?
        //     todo!();
        //     // It mentions us; add it to the atom list.
        //     atoms.push((name, todo!()))
        // }

        let mut var_atoms: HashMap<Var, Vec<Atom>> = HashMap::new();
        for (&atom, vars) in atom_vars.iter() {
            for &var in vars.iter() {
                var_atoms.entry(var).or_default().push(atom);
            }
        }
        let var_atoms = var_atoms;

        // Determine the indexes we'll need.
        let mut reverse_index: HashSet<&Name> = HashSet::new();
        let mut diagonal_index: HashSet<&Name> = HashSet::new();
        for (var_idx, var) in var_order.iter().enumerate() {
            for &atom in var_atoms[var].iter() {
                // Let X = the var we are solving
                // and C = a known value, eg already-solved var or attribute value
                // and V = a not-yet-solved var.
                //
                // There are five possible shapes the atom can have:
                //
                //   1  f(C) = X      2  f(X) = V
                //   3  f(X) = C      4  f(V) = X      5  f(X) = X
                //
                // Of these, 3 and 4 need a reverse index, and 5 needs a diagonal index.
                //
                // Technically case 4 doesn't need a full reverse/preimage index; rather, it just
                // needs an "image index": the set of all Xs that occur in the image of f. But a
                // preimage index is strictly more informative, costs the same time (but possibly
                // more space) to build, and allows more re-use (if two atoms with the same morphism
                // both need a reverse index, they share it) without having to get clever and do
                // things like index subsumption (ie: if one atom needs a reverse index and the
                // other just needs the image set, only build the reverse index and use it for the
                // image set).
                let (atom_morphism, atom_src_id) = atom;
                let (atom_dom, atom_cod) = &self.schema.morphisms[atom_morphism];
                let atom_src: &Var = &(&atom_dom, atom_src_id);
                let is_src = atom_src == var;
                match atom_cod {
                    EntityOrAttr::Attr(_) => {
                        // Case 3, we know the target and need a reverse index. As an optimization,
                        // we *could* build an index for this specific attribute value. This could
                        // save space, but not much time (we'd still need to traverse the entire
                        // relation we're indexing). And we'd then need to think about index
                        // subsumption: if another atom needs a general reverse index on this
                        // morphism, we'd rather not also build the attribute-value-specific index.
                        // So I'm just gonna require a reverse index.
                        reverse_index.insert(atom_morphism);
                    }
                    EntityOrAttr::Entity(cod) => { // handles cases 5 or 4
                        let atom_map: &Map<EntityId, EntityId> = (&self.mappings[atom_morphism]).into();
                        // We can only be in cases 4-5 if the atom's target is X, f(_) = X.
                        if var != &(cod, atom_map[&atom_src_id]) { continue }
                        if atom_src == var { // Case 5, diagonal index
                            diagonal_index.insert(atom_morphism);
                        } else if !(&var_order[..var_idx]).contains(atom_src) { // Case 4, reverse index
                            reverse_index.insert(atom_morphism);
                        }
                    }
                }
            }
        }

        // Build the indexes.
        let reverse_index: HashMap<&Name, TaggedMap> = reverse_index.into_iter()
            .map(|morphism| {
                // Is this an entity->entity map, or an entity->attribute map?
                todo!()
            })
            .collect();
        let diagonal_index: HashMap<&Name, HashSet<usize>> = diagonal_index.into_iter()
            .map(|morphism| {
                let map: &Map<EntityId, EntityId> = (&database.mappings[morphism]).into();
                ( morphism,
                  map.iter().filter_map(|(k, v)| if k == v { Some(*k) } else { None }).collect() )
            })
            .collect();

        // Following the recipe from
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
        // 4a    For each binding of values to prior and new vars,
        // 4b    If the binding is not in the atom, discard the binding.
        //
        let mut bindings: Vec<Binding> = vec![Vec::new()];
        for var in var_order { // 1 For each var in some order
            // Find the atoms that mention this var.
            let atoms: &Vec<Atom> = &var_atoms[&var];
            assert!(!atoms.is_empty()); // TODO: this is not guaranteed!

            // We assume the first atom mentioning us uniformly had smallest count.
            // TODO: fix this and actually implement counting.
            let count_atom = &atoms[0]; // 3 For each atom that mentions this var,
            for binding in std::mem::take(&mut bindings) {   // 3a For each binding of values to prior vars
                // 3b If this atom had the least count, enumerate the new values.
                //
                let (atom_morphism, atom_key) = count_atom;
                let (var_entity, var_key) = var;
                todo!()         // something using count_atom
            }

            for atom in &atoms[1..] { // 4 For each atom that mentions this var (excluding
                // the one that enumerated the new bindings, in this case, because it's
                // easy)
                todo!()
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
