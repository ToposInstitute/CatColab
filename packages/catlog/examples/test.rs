#![allow(missing_docs, dead_code, unused_imports)]

use catlog::zero::column::{Column, Mapping};
use std::collections::HashMap;
use std::collections::HashSet;
use std::fmt::Display;
use std::rc::Rc;
use std::hash::Hash;
use std::cmp::Ordering;

const DEBUG: bool = true;

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


// ---------- REVERSE INDEXES ----------
#[derive(Debug)]
enum TaggedReverseIndex {
    IdId(Map<EntityId, HashSet<EntityId>>),
    IdString(Map<String, HashSet<EntityId>>),
}

fn build_reverse_index<K,V>(map: &HashMap<K, V>) -> HashMap<V, HashSet<K>> where
    K:Eq + Hash + Clone,
    V:Eq + Hash + Clone,
{
    let mut index = HashMap::<V, HashSet<K>>::new();
    for (k,v) in map { index.entry(v.clone()).or_default().insert(k.clone()); }
    index
}

impl TaggedMap {
    // How could I macro-generate this function if Repr gets bigger?
    fn build_reverse_index(&self) -> TaggedReverseIndex {
        use TaggedMap::*;
        match self {
            Id(_) => panic!("should never build reverse index on EntityId -> () map"),
            IdId(m) => { TaggedReverseIndex::IdId(build_reverse_index(m)) }
            IdString(m) => { TaggedReverseIndex::IdString(build_reverse_index(m)) }
        }
    }
}


// TODO: I'm cloning strings all over the place, this is dumb.
// TODO: make EntityName != MorphismName so the typechecker double-checks me.
type Name = String;
type EntityName = Name;
type MorphismName = Name;

/// The underlying relational data of an instance.
type Mappings = HashMap<Name, TaggedMap>;

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
enum EntityOrAttr { Entity(EntityName), Attr(Repr), }

#[derive(Debug)]
struct Schema {
    /// Set of names for entity objects.
    entities: Vec<EntityName>,
    /// A map from morphism names to their dom/cod types.
    /// All morphisms go from entities to either entities or attributes.
    morphisms: Map<MorphismName, (EntityName, EntityOrAttr)>,
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
// A var is represented as (entity_name: &EntityName, entity_id: EntityId).
// An atom is represented as (map_name: &MorphismName, key: EntityId).
type Var<'a> = (&'a EntityName, EntityId);
type Atom<'a> = (&'a MorphismName, EntityId);

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

// At each "step" of a WCO join, i.e. when solving for a particular variable, we examine
// all atoms that touch this variable. These can have five different forms.
//
// Let X = the var we are solving for right now;
// let C = a known value (constants, or variables we've already solved)
// let V = a not-yet-solved var.
//
// Then the five shapes are:
//
//      SHAPE           STRATEGY
//   1  f(C) = X        lookup f(C)
//   2  f(X) = V        enumerate dom(f) = all entities of the given type
//   3  f(X) = C        preimage f^{-1}(C) using a reverse index
//   4  f(V) = X        enumerate image(f) using a reverse index
//   5  f(X) = X        use a diagonal index {x : f(x) = x}
//
// Of these, 3 and 4 need a reverse index, and 5 needs a diagonal index.
type Wcop<'a> = (&'a MorphismName, WcoStrategy<'a>); // worst-case optimal operator
#[derive(Debug, Clone, Eq, PartialEq, PartialOrd, Ord)]
enum WcoStrategy<'a> {
    Lookup(Known<'a>),
    Preimage(Known<'a>),
    // TODO: Dom is dumb. We actually don't need the morphism for Dom, just the entity
    // type. And if the same variable appears as the source of multiple atoms, we might
    // get redundant Dom(f) wcops for it. So instead we should just emit a Wcop for
    // enumerating the entity type, and deduplicate those before query execution.
    // Moreover, we should only use a Dom/Entity enumeration if we have *no other bound*
    // on the value. So in fact the plan for a variable should be *either* "enumerate its
    // type" *or* a vector of Wcops. So the solution is just to drop Dom and enumerate if
    // there are no entries in the Wcop vector.
    Dom,
    Image,
    Diagonal,
}
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum Known<'a> {
    Var(usize), // gives index of var in var order so we can look it up in existing binding
    String(&'a String),
    Usize(usize),
}

type WcoPlan<'a> = Vec<(Var<'a>, Vec<Wcop<'a>>)>;

impl Instance {
    // In principle the var order could be chosen based on the database. For now, no.
    fn pick_var_order<'a>(&'a self) -> Vec<Var<'a>> {
        // TODO: check the query is connected. BIGGER TODO: if it's not
        // connected, decompose it into disjoint components and query for them
        // separately.
        eprintln!("WARNING: blithely assuming query is connected and that every var/entity is covered by an atom/morphism");
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
            // Iteration order of hashtables is unstable across program runs, so we sort
            // for determinism.
            let mut keys: Vec<usize> = table.keys().cloned().collect();
            keys.sort_unstable();
            for id in keys {
                var_order.push((&entity, id))
            }
        }
        return var_order;
    }

    /// Produces a vector `plan` with plan.len() = var_order.len()
    /// where plan[i] is a vector of Wcops for the variable v = var_order[i],
    /// one for each atom which mentions v.
    ///
    /// TODO: currently, because Rust hashmap iteration order is nondeterministic across
    /// program executions, so is query planning. I should fix this for my own sake.
    fn plan<'a>(&'a self, var_order: &Vec<Var<'a>>) -> WcoPlan<'a> {
        // TODO: assert! the variable order is exhaustive (hits all entities).
        let var_position: HashMap<Var, usize> =
            var_order.iter().enumerate().map(|(i, &x)| (x,i)).collect();

        // For each atom, make appropriate plans for each variable it touches.
        let mut plan: Vec<(Var, Vec<Wcop>)> =
            var_order.iter().map(|v| (*v, Vec::<Wcop>::new())).collect();
        // TODO: determinize!
        for (morphism, (dom_entity, cod)) in self.schema.morphisms.iter() {

            // For each row, determine which variables it touches and push the appropriate
            // Wcops into their vectors in `plan`. Recall our five shapes:
            //
            //      SHAPE           STRATEGY
            //   1  f(C) = X        Lookup(C)
            //   2  f(X) = V        Dom
            //   3  f(X) = C        Preimage(C)
            //   4  f(V) = X        Image
            //   5  f(X) = X        Diagonal
            match cod {
                EntityOrAttr::Entity(cod_entity) => {
                    let map: &Map<EntityId, EntityId> = (&self.mappings[morphism]).into();
                    for (&src_id, &tgt_id) in map.iter() { // TODO: determinize
                        // We have f(X) = Y. Does X or Y come first in the var order? 3 cases.
                        let src: Var = (dom_entity, src_id);
                        let tgt: Var = (cod_entity, tgt_id);
                        let src_i = var_position[&src];
                        let tgt_i = var_position[&tgt];
                        match src_i.cmp(&tgt_i) {
                            // [Case A]  X precedes Y
                            // so  X gets  f(X) = V     Dom
                            // and Y gets  f(C) = Y     Lookup(C)
                            Ordering::Less => {
                                plan[src_i].1.push((morphism, WcoStrategy::Dom));
                                plan[tgt_i].1.push((morphism, WcoStrategy::Lookup(Known::Var(src_i))));
                            }
                            // [Case B]  Y precedes X
                            // so  Y gets  f(V) = Y     Image
                            // and X gets  f(X) = C     Preimage(C)
                            Ordering::Greater => {
                                plan[tgt_i].1.push((morphism, WcoStrategy::Image));
                                plan[src_i].1
                                    .push((morphism, WcoStrategy::Preimage(Known::Var(tgt_i))));
                            }
                            // [Case C]  X == Y --> f(X) = X --> X gets Diagonal
                            Ordering::Equal => { // case 5, f(X) = x
                                assert!(dom_entity == cod_entity && src == tgt);
                                plan[src_i].1.push((morphism, WcoStrategy::Diagonal));
                            }
                        }
                    }
                }

                // TODO: factor these 2 cases out so we don't have to repeat ourselves
                // when more attribute types are added.
                EntityOrAttr::Attr(Repr::Usize) => {
                    let map: &Map<EntityId, usize> = (&self.mappings[morphism]).into();
                    for (&src_id, tgt_value) in map.iter() { // TODO: determinize!
                        // We have f(X) = C so we emit Preimage(C).
                        let i = var_position[&(dom_entity, src_id)];
                        plan[i].1.push((morphism, WcoStrategy::Preimage(Known::Usize(*tgt_value))));
                    }
                }
                EntityOrAttr::Attr(Repr::String) => {
                    let map: &Map<EntityId, String> = (&self.mappings[morphism]).into();
                    for (&src_id, tgt_value) in map.iter() { // TODO: determinize!
                        // We have f(X) = C so we emit Preimage(C).
                        let i = var_position[&(dom_entity, src_id)];
                        plan[i].1.push((morphism, WcoStrategy::Preimage(Known::String(tgt_value))));
                    }
                }
            }
        }

        return plan
    }

    #[allow(unused_variables, unreachable_code, unused_mut)]
    fn execute(&self, plan: WcoPlan, database: &Instance) {
        assert!(Rc::ptr_eq(&self.schema, &database.schema));

        // Determine the indexes we'll need.
        let mut reverse_index: HashSet<&Name> = HashSet::new();
        let mut diagonal_index: HashSet<&Name> = HashSet::new();

        for (var, wcops) in plan.iter() {
            for (morphism, strategy) in wcops.iter() {
                match strategy {
                    WcoStrategy::Lookup(_) | WcoStrategy::Dom => {},
                    WcoStrategy::Diagonal => { diagonal_index.insert(morphism); }
                    WcoStrategy::Preimage(_) | WcoStrategy::Image => {
                        reverse_index.insert(morphism);
                    }
                }
            }
        }

        // Build the indexes.
        let reverse_index: HashMap<&Name, TaggedReverseIndex> = reverse_index.into_iter()
            .map(|morphism| (morphism, database.mappings[morphism].build_reverse_index()))
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
        for (var, wcops) in plan { // 1 For each var in some order
            assert!(!wcops.is_empty());

            // 3 For each atom that mentions this var,
            // 3a For each binding of values to prior vars
            // 3b If this atom had the least count, enumerate the new values.
            //
            // We assume the first atom mentioning us uniformly had smallest count, which
            // makes this kind of wonky; eg we dispatch on `strategy` inside the `for
            // binding in ...` loop even though we already know it -- because in the
            // "correct" version we won't know it in advance.
            //
            // TODO: fix this and actually implement counting.
            let &(morphism, ref strategy) = &wcops[0];
            let (dom, cod) = &self.schema.morphisms[morphism];
            let table = &database.mappings[morphism];
            for mut binding in std::mem::take(&mut bindings) {
                match strategy {
                    WcoStrategy::Dom => { // enumerate the domain entity type
                        let entities: &Map<EntityId, ()> = (&database.mappings[dom]).into();
                        for &x in entities.keys() {
                            // TODO: DANGER! ALLOCATION IN INNER LOOP!
                            let mut b = binding.clone();
                            b.push(x);
                            // how do I avoid doing this? maybe: be more columnar?
                            // go look at how Datatoad does it.
                            bindings.push(b);
                        }
                    }
                    // BRANCH NOT YET TESTED
                    WcoStrategy::Image => { // use reverse index
                        // f(V) = X: X is an entity, so f is entity->entity (IdId reverse
                        // index), and its keys are exactly the image of f.
                        let TaggedReverseIndex::IdId(index) = &reverse_index[morphism] else {
                            panic!("reverse index tag error")
                        };
                        for &x in index.keys() {
                            // DANGER! ALLOCATION IN INNER LOOP!
                            let mut b = binding.clone();
                            b.push(x);
                            bindings.push(b);
                        }
                    }
                    // BRANCH NOT YET TESTED
                    WcoStrategy::Diagonal => { // use diagonal index
                        let index = &diagonal_index[morphism];
                        for &x in index {
                            // DANGER! ALLOCATION IN INNER LOOP!
                            let mut b = binding.clone();
                            b.push(x);
                            bindings.push(b);
                        }
                    }
                    WcoStrategy::Lookup(known) => { // look `known` up in `mapping`
                        // f(C) = X, so it must be an entity-entity map.
                        let Known::Var(var_index) = known else {
                            panic!("Lookup with attribute key shouldn't be possible");
                        };
                        let map: &Map<EntityId, EntityId> = table.into();
                        // We can reuse the existing binding since we only generate one
                        // result from it.
                        let x = map[&binding[*var_index]];
                        binding.push(x);
                        bindings.push(binding);
                    }
                    WcoStrategy::Preimage(known) => { // look `known` up in reverse index
                        let index: &TaggedReverseIndex = &reverse_index[morphism];
                        match *known {
                            Known::Var(known_var_index) => todo!("preimage Var"),
                            Known::Usize(k) => todo!("preimage usize"),
                            Known::String(k) => {
                                // TODO: this let-else should become a macro-generated .into() method.
                                let TaggedReverseIndex::IdString(index) = index else {
                                    panic!("reverse index tag error")
                                };
                                let entities: &HashSet<EntityId> = &index[k];
                                for &entity in entities {
                                    // DANGER! ALLOCATION IN INNER LOOP!
                                    let mut b = binding.clone();
                                    b.push(entity);
                                    bindings.push(b);
                                }
                            }
                        }
                    }
                }
            }

            if DEBUG {
                eprintln!("  after proposing {var:?} via {morphism}/{strategy:?}, bindings are:");
                if bindings.is_empty() { eprintln!("    empty?!"); }
                for b in &bindings { eprintln!("    {b:?}"); }
            }

            // 4   For each atom that mentions the var,
            // (we exclude the one that enumerate it in this case because it's easy)
            for wcop in &wcops[1..] {
                // 4a    For each binding of values to prior and new vars,
                // 4b    If the binding is not in the atom, discard the binding.
                let &(morphism, ref strategy) = wcop;
                let (dom, cod) = &self.schema.morphisms[morphism];
                let table = &database.mappings[morphism];
                match strategy {
                    WcoStrategy::Dom => {}, // nothing to do; always holds
                    WcoStrategy::Image => { // NOT YET TESTED
                        // f(V) = X: keep bindings whose X is in the image of f.
                        // X is an entity, so f is entity->entity (IdId reverse index).
                        let TaggedReverseIndex::IdId(index) = &reverse_index[morphism] else {
                            panic!("reverse index tag error")
                        };
                        bindings.retain(|binding| index.contains_key(binding.last().unwrap()));
                    }
                    WcoStrategy::Diagonal => { // NOT YET TESTED
                        // f(X) = X: keep bindings whose X is on the diagonal of f.
                        let index = &diagonal_index[morphism];
                        bindings.retain(|binding| index.contains(binding.last().unwrap()));
                    }
                    WcoStrategy::Lookup(k) => {
                        // f(C) = X: check that f(C) equals the proposed X. X is an
                        // entity, so f is an entity->entity map.
                        let Known::Var(j) = k else {
                            panic!("Lookup with constant key should not occur")
                        };
                        let map: &Map<EntityId, EntityId> = table.into();
                        bindings.retain(|binding| map[&binding[*j]] == *binding.last().unwrap());
                    }
                    WcoStrategy::Preimage(k) => {
                        // f(X) = C: check that f(X) equals the known C.
                        match k {
                            Known::Var(j) => {
                                let map: &Map<EntityId, EntityId> = table.into();
                                bindings.retain(|binding| map[binding.last().unwrap()] == binding[*j]);
                            }
                            // TODO: macro-generate these branches once we have more than 2 types.
                            Known::Usize(c) => {
                                let map: &Map<EntityId, usize> = table.into();
                                bindings.retain(|binding| map[binding.last().unwrap()] == *c);
                            }
                            Known::String(c) => {
                                let map: &Map<EntityId, String> = table.into();
                                bindings.retain(|binding| map[binding.last().unwrap()] == **c);
                            }
                        }
                    }
                }
            }

            if DEBUG {
                eprintln!("  after filtering {var:?} through {} wcops:", &wcops[1..].len());
                for b in &bindings { eprintln!("    {b:?}"); }
            }
        }
    }

    fn query(&self, database: &Instance) {
        assert!(Rc::ptr_eq(&self.schema, &database.schema));
        let var_order = self.pick_var_order();
        let plan = self.plan(&var_order);
        return self.execute(plan, database);
    }
}


// ---------- SELF CHECKS ON SCHEMAS & INSTANCES (ie type/tag checks) ----------
impl Schema {
    // check that the keys of self.entities and self.morphisms don't overlap.
    // check that every entity name used as dom/cod in a morphism type exists.
    fn self_check(&self) {
        for name in self.entities.iter() {
            if self.morphisms.contains_key(name) {
                panic!("Name {} used both as entity type and morphism", name)
            }
        }
        for (morphism, (dom_entity, cod)) in self.morphisms.iter() {
            if !self.entities.contains(dom_entity) {
                panic!("domain of {morphism} is {dom_entity} but there is no such entity");
            }
            if let EntityOrAttr::Entity(cod_entity) = cod {
                if !self.entities.contains(cod_entity) {
                    panic!("codomain of {morphism} is {dom_entity} but there is no such entity");
                }
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

            // FIXME: check morphism is defined over its entire domain!
            let domain: &Map<EntityId, ()> = (&self.mappings[dom]).into();
            for dom_id in domain.keys() {
                use TaggedMap::*;
                // This is inefficient; this tag check should be lifted out of the for
                // loop.
                let has_key = match mapping {
                    IdId(m) => m.contains_key(dom_id),
                    IdString(m) => m.contains_key(dom_id),
                    Id(_) => unimplemented!(),
                };
                if !has_key {
                    panic!("mapping `{name}' lacks entry for `{dom}' with id `{dom_id}'")
                }
            }
        }
    }
}


macro_rules! map {
    [$($x:expr => $y:expr),*,] => { [$(($x, $y)),*].into_iter().collect() };
    [$($x:expr => $y:expr),*]  => { [$(($x, $y)),*].into_iter().collect() };
}

#[allow(non_snake_case, unused_variables, unreachable_code)]
fn main() {
    // Let's make a simple schema, a simple query, and try planning it.
    println!("hello, world!");

    let Dept = "Dept".to_string();
    let Employee = "Employee".to_string();
    let dept = "dept".to_string();
    let name = "name".to_string();

    let entities: Vec<EntityName> = vec![Employee.clone(), Dept.clone()];
    let morphisms: Map<MorphismName, (EntityName, EntityOrAttr)> = map! {
        dept.clone() => (Employee.clone(), EntityOrAttr::Entity(Dept.clone())),
        name.clone() => (Dept.clone(), EntityOrAttr::Attr(Repr::String)),
    };
    let schema: Rc<Schema> = Rc::new(Schema { entities, morphisms });
    use TaggedMap::*;
    let mappings: HashMap<Name, TaggedMap> = map! {
        Employee.to_string() => Id(map!{1138 => ()}),
        Dept.to_string() => Id(map!{0 => ()}),
        dept.to_string() => IdId(map!{1138 => 0}),
        name.to_string() => IdString(map!{0 => "accounting".to_string()}),
    };
    let query = Instance { schema: schema, mappings };

    println!("Constructed query instance, checking it.");
    query.self_check();

    println!("Planning.");
    let var_order = query.pick_var_order();
    println!("  variable order  {var_order:?}");
    let plan = query.plan(&var_order);
    println!("  query plan:");
    for ((entity,id), wcops) in plan.iter() {
        println!("    {entity:>8} {id:>4}    {wcops:?}");
    }

    // let table: Vec<_> = plan.iter()
    //     .map(|((entity,id), wcops)|
    //          vec![format!("{entity}:{id}"), format!("{wcops:?}")])
    //     .collect();
    // if table.is_empty() {
    //     println!("  plan is empty?!");
    // } else {
    //     let colwidths = (0..table[0].len())
    //         .map(|i| table.iter().map(|v| v[i].len()).max().unwrap());
    //     for row in table {
    //         let [x,y] = row.as_slice() else { panic!() };
    //         println!("    {x}  {y}");
    //     }
    // }

    // let's try finding automorphisms from the query to itself.
    query.execute(plan, &query);

    println!("success!");
}
