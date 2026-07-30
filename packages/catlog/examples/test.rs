#![allow(missing_docs)]

// use catlog::zero::column::{Column, Mapping};
use std::io::prelude::*;
use std::time::Instant;
use std::collections::HashMap;
use std::collections::HashSet;
use std::fmt::Display;
use std::rc::Rc;
use std::hash::Hash;
use std::cmp::Ordering;

const DEBUG: bool = true;
// Debug-print vectors of length <= PRINTMAX.
const PRINTMAX: usize = 40;

macro_rules! print_flush {
    ($($e:tt)*) => { { print!($($e)*); std::io::stdout().flush().unwrap() } }
}

fn clone_with_capacity<A: Clone>(n: usize, src: &Vec<A>) -> Vec<A> {
    debug_assert!(n >= src.len());
    let mut r = Vec::with_capacity(n);
    r.extend_from_slice(src);
    return r;
}


// ---------- MAPS & TAGGED MAPS ----------
// TODO: use IndexMap for deterministic ordering? or BTreeMap?
type Map<K, V> = HashMap<K, V>;

macro_rules! map {
    [$($x:expr => $y:expr),*,] => { [$(($x, $y)),*].into_iter().collect() };
    [$($x:expr => $y:expr),*]  => { [$(($x, $y)),*].into_iter().collect() };
}

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

// TODO: does derive_more allow me to auto-generate this?
#[derive(Debug)]
enum TaggedMap {
    Id(Map<EntityId, ()>),
    IdId(Map<EntityId, EntityId>),
    IdString(Map<EntityId, String>),
}

impl TaggedMap {
    // fn dom(&self) -> Repr { self.dom_cod().0 }
    // fn cod(&self) -> Option<Repr> { self.dom_cod().1 }
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


// ---------- SCHEMAS & INSTANCES ----------
// TODO: I'm cloning strings all over the place, this is dumb.
// TODO: make EntityName != MorphismName so the typechecker double-checks me.
type Name = String;
type EntityName = Name;
type MorphismName = Name;

/// The underlying relational data of an instance.
type Mappings = HashMap<Name, TaggedMap>;

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
enum EntityOrAttr { Entity(EntityName), Attr(Repr), }

#[derive(Debug, PartialEq, Eq)]
struct Schema {
    /// Set of names for entity objects. TODO: either make this a HashSet or manually
    /// implement Eq so that equality is correct rather than caring about entity order.
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


// ---------- SELF CHECKS ON SCHEMAS & INSTANCES ----------
// On a schema, we check:
// 0. Entity & morphism names are disjoint.
// 1. All names used as dom/cod types refer to entities.
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

// On an instance, we also check:
// 2. Everything in mappings is in the schema.
// 3. Everything in the schema is in mappings, and its tag matches its type.
// 4. Every morphism mapping is total (defined over its entire domain entity type).
impl Instance {
    fn self_check(&self) {
        self.schema.self_check();

        // Check that everything in self.mappings is in the schema (no extraneous mappings).
        for (name, _) in self.mappings.iter() {
            if self.schema.entities.contains(name) { continue }
            if self.schema.morphisms.contains_key(name) { continue }
            panic!("Unrecognized mapping ‘{name}’");
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

            match mapping {
                TaggedMap::IdId(m) => self.check_domain(dom, name, m),
                TaggedMap::IdString(m) => self.check_domain(dom, name, m),
                TaggedMap::Id(_) => unimplemented!("impossible - morphism data is never TaggedMap::Id"),
            }
        }
    }

    fn check_domain<V>(&self, dom: &EntityName, morphism: &MorphismName, map: &Map<EntityId, V>) {
        let domain: &Map<EntityId, ()> = (&self.mappings[dom]).into();
        for id in domain.keys() {
            if !map.contains_key(id) {
                panic!("mapping ‘{morphism}’ lacks entry for ‘{dom}’ with id {id}")
            }
        }
        for id in map.keys() {
            if !domain.contains_key(id) {
                panic!("mapping ‘{morphism}’ has entry for id {id}, but there is no ‘{dom}’ with id {id}");
            }
        }
    }
}


// ---------- QUERYING, WORST-CASE OPTIMALLY ----------
// A query "var" is an entity in self.mappings[map] for map ∈ schema.entities.
// A query "atom" is a row in self.mappings[map] for map ∈ schema.morphisms.
//
// A var is represented as (entity_name: &EntityName, entity_id: EntityId).
// We don't need to represent atoms per se yet.
type Var<'a> = (&'a EntityName, EntityId);

// Binding represents a partial var-entity binding during a WCOJ. We go through vars in a
// fixed order, and each var gets mapped to a particular EntityId, so a partial binding is
// just a Vec<EntityId>. TODO LATER: Once we have multiple entity representations this may
// cause tagging overhead!
type Binding = Vec<EntityId>;

// ##### CONCRETE EXAMPLE OF SOLVING A QUERY #####
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
//   dept(e) = d
//   name(d) = "accounting"
//
// We start by solving for d = ("Dept", 0); there are two relevant atoms,
//
//   1) name(d) = "accounting"
//   2) dept(e) = d                (but e is unknown!)
//
// so we can either 1) enumerate departments named "accounting"
//               or 2) enumerate all departments in the image of `dept`.
// and then filter by whichever condition we didn't enumerate by.
//
// Once we have picked such a d and are solving for e = ("Employee", 0), then the relevant
// atom is
//
//   dept(e) = d
//
// and we must enumerate employees whose department is d, i.e. the preimage dept^{-1}(d).

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
// Of these, 1 needs forward lookup (no index needed), 3 and 4 need a reverse index, and 5
// needs a diagonal index. 2 is weird: we could do it by enumerating the domain of the
// function, but since all maps are total, this is equivalent to enumerating all entities
// of that type (and does nothing when used as a filter). So we actually don't have a
// Strategy for this. Instead, if a particular entity/var ends up with *no* strategies,
// we just enumerate all entity values.
type Wcop<'a> = (&'a MorphismName, Strategy<'a>); // worst-case optimal operator
#[derive(Debug, Clone)]
enum Strategy<'a> {
    Lookup(Known<'a>),
    Preimage(Known<'a>),
    Image,
    Diagonal,
}
#[derive(Debug, Clone)]
enum Known<'a> {
    Var(usize), // gives index of var in var order so we can look it up in existing binding
    String(&'a String),
    Usize(usize),
}

type WcoPlan<'a> = Vec<(Var<'a>, Vec<Wcop<'a>>)>;

struct QueryContext<'a,'b> {
    plan: WcoPlan<'a>,
    database: &'b Instance,
    index_reverse: HashMap<&'a Name, TaggedReverseIndex>,
    index_diagonal: HashMap<&'a Name, HashSet<EntityId>>,
}

impl<'a,'b> QueryContext<'a,'b> {
    fn new(plan: WcoPlan<'a>, database: &'b Instance) -> Self {
        let mut cx = QueryContext {
            plan,
            database,
            index_reverse: HashMap::new(),
            index_diagonal: HashMap::new(),
        };
        // Build indexes on `database` needed for `plan`.
        for (_var, wcops) in &cx.plan {
            for &(morphism, ref strategy) in wcops {
                match strategy {
                    Strategy::Lookup(_) => {},
                    Strategy::Preimage(_) | Strategy::Image => {
                        cx.index_reverse.entry(morphism).or_insert_with(||
                            cx.database.mappings[morphism].build_reverse_index()
                        );
                    }
                    Strategy::Diagonal => {
                        cx.index_diagonal.entry(morphism).or_insert_with(|| {
                            let map: &Map<EntityId, EntityId> =
                                (&cx.database.mappings[morphism]).into();
                            map.iter()
                            .filter_map(|(k, v)| if k == v { Some(*k) } else { None })
                            .collect()
                        });
                    }
                }
            }
        }
        return cx
    }

    fn execute(&self) -> Vec<Binding> {
        // Following the recipe from
        // https://github.com/frankmcsherry/blog/blob/master/posts/2025-12-23.md#atomization
        //
        // 1 For each var in some order,
        // 2   For each atom that mentions the var,
        // 2a    For each binding of values to prior vars,
        // 2b    Count the # of distinct values that extend that binding.
        // 3   For each atom that mentions the var,
        // 3a    For each binding of values to prior vars,
        // 3b    If this atom had least count, enumerate new values.
        // 4   For each atom that mentions the var,
        // 4a    For each binding of values to prior and new vars,
        // 4b    If the binding is not in the atom, discard the binding.
        //
        let mut bindings: Vec<Binding> = vec![Vec::with_capacity(self.plan.len())];
        for (var, wcops) in &self.plan { // 1 For each var in some order
            let n_wcops = wcops.len();
            if n_wcops == 0 {
                if DEBUG { print_flush!("  {var:?}\tenumerate {}", var.0); }
                // If all atoms that mention this var are of the form f(X) = V for unknown
                // V, all we can do it enumerate its entity table.
                let entities: &Map<EntityId, ()> = (&self.database.mappings[var.0]).into();
                // TODO LATER: could easily pre-allocate the number of vectors we need here.
                for binding in std::mem::take(&mut bindings) {
                    for &x in entities.keys() {
                        // DANGER! ALLOCATION IN INNER LOOP!
                        let mut b = clone_with_capacity(self.plan.len(), &binding);
                        b.push(x);
                        bindings.push(b);
                    }
                }
                if DEBUG {
                    println!(": {}", bindings.len());
                }
                continue;
            }

            // 2   For each atom that mentions the var,
            // 2a    For each binding of values to prior vars,
            // 2b    Count the # of distinct values that extend that binding.
            //
            // We also find which one is the minimum in this step: `wcops[proposers[i]]` is used to
            // propose new bindings extending `bindings[i]`; the other wcops are used to filter.
            let counts: Vec<Vec<usize>> =
                wcops.iter().map(|w| self.wco_count(w, &bindings)).collect();
            let proposers: Vec<usize> = (0..bindings.len())
                .map(|i| (0..n_wcops).min_by_key(|&j| counts[j][i]).unwrap())
                .collect();

            // 3 For each atom that mentions this var,
            // 3a For each binding of values to prior vars
            // 3b If this atom had the least count, enumerate the new values.
            if DEBUG {
                print_flush!("  {var:?}\tpropose {wcops:?}");
            }
            for (i, binding) in std::mem::take(&mut bindings).into_iter().enumerate() {
                let wcop = &wcops[proposers[i]];
                self.wco_propose(wcop, binding, &mut bindings);
            }
            if DEBUG {
                let n = bindings.len();
                println!(": {n}");
                if n <= PRINTMAX {
                    for b in &bindings { println!("    {b:?}"); }
                }
            }

            // 4   For each atom that mentions the var,
            if n_wcops <= 1 { continue } // only one wcop, no need to filter.
            if DEBUG {
                print_flush!("  {var:?}\tfilter {:?}", &wcops);
            }
            for wcop in wcops {
                // 4a    For each binding of values to prior and new vars,
                // 4b    If the binding is not in the atom, discard the binding.
                self.wco_filter(wcop, &mut bindings);
            }
            if DEBUG {
                let n = bindings.len();
                println!(": {n}");
                if n <= PRINTMAX {
                    for b in &bindings { println!("    {b:?}"); }
                }
            }
        }

        return bindings;
    }

    fn wco_count(&self, wcop: &Wcop, bindings: &Vec<Binding>) -> Vec<usize> {
        let &(morphism, ref strategy) = wcop;
        match strategy {
            &Strategy::Image => {
                let TaggedReverseIndex::IdId(index) = &self.index_reverse[morphism] else {
                    panic!("reverse index tag error")
                };
                vec![index.len(); bindings.len()]
            }
            &Strategy::Diagonal => vec![self.index_diagonal[morphism].len(); bindings.len()],
            &Strategy::Lookup(_) => vec![1; bindings.len()],
            // TODO: macro-generate these branches?
            &Strategy::Preimage(Known::Usize(ref v))  => {
                let TaggedReverseIndex::IdId(index) = &self.index_reverse[morphism] else {
                    panic!("reverse index tag error")
                };
                vec![index.get(v).map_or(0, |set| set.len()); bindings.len()]
            }
            &Strategy::Preimage(Known::String(s)) => {
                let TaggedReverseIndex::IdString(index) = &self.index_reverse[morphism] else {
                    panic!("reverse index tag error")
                };
                vec![index.get(s).map_or(0, |set| set.len()); bindings.len()]
            }
            // NB. only this case actually depends on the binding. TODO LATER: in future, we could
            // optimize this by pre-computing strategies that don't depend on the binding. In
            // particular, if any strategy is Lookup, we should use that one to propose and the
            // others to filter.
            &Strategy::Preimage(Known::Var(known_idx)) => {
                let TaggedReverseIndex::IdId(index) = &self.index_reverse[morphism] else {
                    panic!("reverse index tag error")
                };
                bindings.iter().map(|b| index[&b[known_idx]].len()).collect()
            }
        }
    }

    fn wco_propose(&self, wcop: &Wcop, binding: Binding, bindings: &mut Vec<Binding>) {
        fn extend_and_push(mut binding: Binding, x: EntityId, bindings: &mut Vec<Binding>) {
            binding.push(x);
            bindings.push(binding);
        }

        let &(morphism, ref strategy) = wcop;
        match strategy {
            Strategy::Image => { // use reverse index
                // f(V) = X: X is an entity, so f is entity->entity (IdId reverse
                // index), and its keys are exactly the image of f.
                let TaggedReverseIndex::IdId(index) = &self.index_reverse[morphism] else {
                    panic!("reverse index tag error")
                };
                for &x in index.keys() {
                    // DANGER! ALLOCATION IN INNER LOOP!
                    extend_and_push(clone_with_capacity(self.plan.len(), &binding), x, bindings)
                }
            }

            // BRANCH NOT YET TESTED
            Strategy::Diagonal => { // use diagonal index
                let index = &self.index_diagonal[morphism];
                for &x in index {
                    // DANGER! ALLOCATION IN INNER LOOP!
                    extend_and_push(clone_with_capacity(self.plan.len(), &binding), x, bindings);
                }
            }

            Strategy::Lookup(known) => { // look `known` up in `mapping`
                // f(C) = X, so it must be an entity-entity map.
                let Known::Var(var_index) = known else {
                    panic!("Lookup with attribute key shouldn't be possible");
                };
                let map: &Map<EntityId, EntityId> =
                    (&self.database.mappings[morphism]).into();
                // We can reuse the existing binding since we only generate one result
                // from it.
                let x = map[&binding[*var_index]];
                extend_and_push(binding, x, bindings);
            }

            Strategy::Preimage(known) => { // look `known` up in reverse index
                let index: &TaggedReverseIndex = &self.index_reverse[morphism];
                // TODO: factor out the commonality between these three cases.
                match *known {
                    Known::Var(known_var_index) => {
                        let k = &binding[known_var_index];
                        let TaggedReverseIndex::IdId(index) = index else {
                            panic!("reverse index tag error");
                        };
                        let entities: &HashSet<EntityId> = &index[k];
                        for &entity in entities {
                            // DANGER! ALLOCATION IN INNER LOOP!
                            extend_and_push(clone_with_capacity(self.plan.len(), &binding), entity, bindings);
                        }
                    }
                    Known::Usize(_k) => todo!("preimage usize"),
                    Known::String(k) => {
                        // TODO: this let-else should become a macro-generated .into() method.
                        let TaggedReverseIndex::IdString(index) = index else {
                            panic!("reverse index tag error")
                        };
                        let entities: &HashSet<EntityId> = &index[k];
                        for &entity in entities {
                            // DANGER! ALLOCATION IN INNER LOOP!
                            extend_and_push(clone_with_capacity(self.plan.len(), &binding), entity, bindings);
                        }
                    }
                }
            } // Strategy::Preimage
        } // match strategy
    } // fn wco_propose

    fn wco_filter(&self, wcop: &Wcop, bindings: &mut Vec<Binding>) {
        let &(morphism, ref strategy) = wcop;
        let table = &self.database.mappings[morphism];
        match strategy {
            Strategy::Image => {
                // f(V) = X: keep bindings whose X is in the image of f.
                // X is an entity, so f is entity->entity (IdId reverse index).
                let TaggedReverseIndex::IdId(index) = &self.index_reverse[morphism] else {
                    panic!("reverse index tag error")
                };
                bindings.retain(|binding| index.contains_key(binding.last().unwrap()));
            }
            Strategy::Diagonal => {
                // f(X) = X: keep bindings whose X is on the diagonal of f.
                let index = &self.index_diagonal[morphism];
                bindings.retain(|binding| index.contains(binding.last().unwrap()));
            }
            Strategy::Lookup(k) => {
                // f(C) = X: check that f(C) equals the proposed X. X is an
                // entity, so f is an entity->entity map.
                let Known::Var(j) = k else {
                    panic!("Lookup with constant key should not occur")
                };
                let map: &Map<EntityId, EntityId> = table.into();
                bindings.retain(|binding| map[&binding[*j]] == *binding.last().unwrap());
            }
            Strategy::Preimage(k) => {
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
            } // Strategy::Preimage
        } // match strategy
    } // fn wco_filter

} // impl QueryContext

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
                            // so  X gets  f(X) = V     fully enumerate; don't push a strategy
                            // and Y gets  f(C) = Y     Lookup(C)
                            Ordering::Less => {
                                plan[tgt_i].1.push((morphism, Strategy::Lookup(Known::Var(src_i))));
                            }
                            // [Case B]  Y precedes X
                            // so  Y gets  f(V) = Y     Image
                            // and X gets  f(X) = C     Preimage(C)
                            Ordering::Greater => {
                                plan[tgt_i].1.push((morphism, Strategy::Image));
                                plan[src_i].1
                                    .push((morphism, Strategy::Preimage(Known::Var(tgt_i))));
                            }
                            // [Case C]  X == Y --> f(X) = X --> X gets Diagonal
                            Ordering::Equal => { // case 5, f(X) = x
                                assert!(dom_entity == cod_entity && src == tgt);
                                plan[src_i].1.push((morphism, Strategy::Diagonal));
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
                        plan[i].1.push((morphism, Strategy::Preimage(Known::Usize(*tgt_value))));
                    }
                }
                EntityOrAttr::Attr(Repr::String) => {
                    let map: &Map<EntityId, String> = (&self.mappings[morphism]).into();
                    for (&src_id, tgt_value) in map.iter() { // TODO: determinize!
                        // We have f(X) = C so we emit Preimage(C).
                        let i = var_position[&(dom_entity, src_id)];
                        plan[i].1.push((morphism, Strategy::Preimage(Known::String(tgt_value))));
                    }
                }
            }
        }

        return plan
    }

    fn execute(&self, database: &Instance, plan: WcoPlan) -> Vec<Binding> {
        assert!(Rc::ptr_eq(&self.schema, &database.schema));
        QueryContext::new(plan, database).execute()
    }
}


// ---------- Loading SNAP graph datasets ----------
// Set EDGES environment variable to override; EDGES=all for no limit.
const DEFAULT_MAX_EDGES: usize = 1_000;
const DEFAULT_FILE: &str = "data/ca-GrQc.txt";

macro_rules! print_flush {
    ($($e:tt)*) => { { print!($($e)*); std::io::stdout().flush().unwrap() } }
}

#[allow(non_snake_case)]
fn graph_schema() -> Rc<Schema> {
    let Node = "Node".to_string();
    let Edge = "Edge".to_string();
    Rc::new(Schema {
        entities: vec![Node.clone(), Edge.clone()],
        morphisms: map! {
            "src".to_string() => (Edge.clone(), EntityOrAttr::Entity(Node.clone())),
            "dst".to_string() => (Edge.clone(), EntityOrAttr::Entity(Node.clone())),
            // "id".to_string() => (Node.clone(), EntityOrAttr::Attr(Repr::Usize)),
        },
    })
}

fn load_edges_from<R: std::io::Read>(source: R, max_edges: Option<usize>) -> Vec<(usize, usize)> {
    if let Some(n) = max_edges {
        println!("Reading at most {n} edges...");
    } else {
        println!("Reading all edges...");
    }
    use std::io::{BufRead, BufReader};
    let file = BufReader::new(source);
    let mut edges: Vec<(usize, usize)> = Vec::new();
    for readline in file.lines() {
        if max_edges.is_some_and(|n| n <= edges.len()) { break }
        let line = readline.expect("read error");
        if line.is_empty() { continue }
        if line.starts_with('#') { continue }
        let mut elts = line[..].split_whitespace();
        let v: usize = elts.next().unwrap().parse().expect("malformed src");
        let u: usize = elts.next().unwrap().parse().expect("malformed dst");
        edges.push((v,u));
    }
    print_flush!("{} edges", edges.len());
    if edges.is_sorted() {
        println!(", already sorted");
    } else {
        println!(", sorting...");
        edges.sort_unstable();
        println!("sorted!");
    }
    return edges;
}

fn load_edges() -> Vec<(usize, usize)> {
    use std::ffi::OsString;
    use std::fs::File;
    use std::env::{var, VarError};
    let args = std::env::args_os();
    let path: OsString = args.skip(1).next().unwrap_or(DEFAULT_FILE.into());
    println!("Reading from {:?}", path);
    let file = File::open(&path).expect("couldn't open file");
    let max_edges: Option<usize> = match var("EDGES") {
        Err(VarError::NotPresent) => Some(DEFAULT_MAX_EDGES), // default
        Err(VarError::NotUnicode(_)) => panic!("EDGES not valid unicode"),
        // explicit ways to set "no limit"
        Ok(s) if s == "all" => None,
        Ok(s) => Some({
            let (factor, s) = if let Some(t) = s.strip_suffix("k") {
                (1_000, t)
            } else if let Some(t) = s.strip_suffix("M") {
                (1_000_000, t)
            } else if let Some(t) = s.strip_suffix("m") {
                (1_000_000, t)
            } else {
                (1, &s[..])
            };
            factor * s.parse::<usize>().expect("malformed MAX_EDGES")
        }),
    };
    return load_edges_from(file, max_edges)
}

fn graph_from_edges(schema: Rc<Schema>, edges: Vec<(usize, usize)>) -> Instance {
    assert!(schema == graph_schema());
    let mappings = map! {
        "Node".to_string() => TaggedMap::Id(edges.iter().flat_map(|e| [(e.0, ()), (e.1, ())]).collect()),
        "Edge".to_string() => TaggedMap::Id((0..edges.len()).map(|i| (i, ())).collect()),
        "src".to_string() => TaggedMap::IdId(
            edges.iter().map(|x| x.0).enumerate().collect()
        ),
        "dst".to_string() => TaggedMap::IdId(
            edges.iter().map(|x| x.1).enumerate().collect()
        ),
    };
    let i = Instance { schema, mappings };
    i.self_check();
    return i;
}


// ---------- MAIN ----------
macro_rules! entities {
    [$($t:tt)*] => {
        TaggedMap::Id(vec![$($t)*].into_iter().map(|x| (x, ())).collect())
    }
}

#[allow(non_snake_case)]
fn example_accounting_employees() {
    // Let's make a simple schema, a simple query, and try planning it.
    println!("hello, world!");

    let Dept = "Dept".to_string();
    let Employee = "Employee".to_string();
    let dept = "dept".to_string();
    let name = "name".to_string();

    let entities: Vec<EntityName> = vec![Dept.clone(), Employee.clone()];
    let morphisms: Map<MorphismName, (EntityName, EntityOrAttr)> = map! {
        dept.clone() => (Employee.clone(), EntityOrAttr::Entity(Dept.clone())),
        name.clone() => (Dept.clone(), EntityOrAttr::Attr(Repr::String)),
    };
    let schema: Rc<Schema> = Rc::new(Schema { entities, morphisms });

    use TaggedMap::*;
    let mappings: HashMap<Name, TaggedMap> = map! {
        Employee.to_string() => entities!(1138),
        Dept.to_string() => entities!(0),
        dept.to_string() => IdId(map!{1138 => 0}),
        name.to_string() => IdString(map!{0 => "accounting".to_string()}),
    };
    let query = Instance { schema: schema.clone(), mappings };

    println!("Constructed query instance, checking it.");
    query.self_check();

    let db_mappings: HashMap<Name, TaggedMap> = map! {
        Employee.to_string() => Id(map!{101 => (), 102 => (), 103 => ()}),
        Dept.to_string() => Id(map!{1 => (), 2 => ()}),
        dept.to_string() => IdId(map!{101 => 1, 102 => 2, 103 => 1}),
        name.to_string() => IdString(map!{1 => "accounting".to_string(),
                                          2 => "hr".to_string()}),
    };
    let db = Instance { schema: schema.clone(), mappings: db_mappings };
    db.self_check();

    println!("Planning.");
    let var_order = query.pick_var_order();
    println!("  variable order  {var_order:?}");
    let plan = query.plan(&var_order);
    println!("  query plan:");
    for ((entity,id), wcops) in plan.iter() {
        println!("    {entity:>8} {id:>4}    {wcops:?}");
    }

    let bindings = query.execute(&db, plan);
    println!("RESULT BINDINGS"); // TODO: Print column headers (variables)
    for b in bindings {
        println!("  {b:?}");
    }

    println!("success on basic query!");
}

fn example_snap() {
    let total = Instant::now();
    let cwd = std::env::current_dir();
    println!("current working directory: {cwd:?}");

    let schema = graph_schema();

    use TaggedMap::*;
    let triangle = Instance {
        schema: schema.clone(),
        // edge(z,y) edge(y,x) edge(z,x)
        mappings: map!{
            "Node".to_string() => entities![0, 1, 2],
            "Edge".to_string() => entities![21, 10, 20],
            "src".to_string() => IdId(map! { 21 => 2, 10 => 1, 20 => 2 }),
            "dst".to_string() => IdId(map! { 21 => 1, 10 => 0, 20 => 0 }),
        }
    };
    triangle.self_check();
    println!("Planning.");

    let var_order = if false {
        triangle.pick_var_order()
    } else {                    // sensible variable order
        #[allow(non_snake_case)]
        let Edge: &EntityName = triangle.schema.entities.iter().find(|x| *x == "Edge").unwrap();
        #[allow(non_snake_case)]
        let Node: &EntityName = triangle.schema.entities.iter().find(|x| *x == "Node").unwrap();
        vec![
            (Edge, 21), (Node, 2), (Node, 1),
            (Edge, 10), (Node, 0),
            (Edge, 20)
        ]
    };

    println!("  variable order  {var_order:?}");
    let plan = triangle.plan(&var_order);
    println!("  query plan:");
    for ((entity,id), wcops) in plan.iter() {
        println!("    {entity:>8} {id:>4}    {wcops:?}");
    }

    let load = Instant::now();
    let mut edges: Vec<(usize, usize)> = load_edges();
    // We redirect all edges x -> y to point from low to high vertex numbers, and drop self-loops x
    // -> x. This should make our directed triangle query find all undirected triangles in the
    // original graph, just as SNAP and Dijkstralog do.
    //
    // Note that the timing is HIGHLY VARIABLE, eg with 10k edges fastest I've seen is 57ms, usual
    // ~1200ms, slowest 8895ms! Propose-smallest is crucial!
    edges.retain_mut(|edge| {
        if edge.1 < edge.0 {
            *edge = (edge.1, edge.0);
        }
        edge.0 != edge.1
    });
    // Remove duplicate edges by sorting & dedup()ing.
    edges.sort_unstable();
    edges.dedup();
    println!("Removed duplicate and self edges, yielding {} edges.", edges.len());
    let small_graph = edges.len() <= PRINTMAX;
    if DEBUG && small_graph {
        println!("edges:");
        for (a,b) in &edges { println!("  {a} {b}"); }
    }
    let graph = graph_from_edges(schema.clone(), edges);
    let load_ns = load.elapsed().as_nanos();
    if DEBUG && small_graph { dbg!(&graph); };

    // Run the query.
    println!("Executing query.");
    let compute = Instant::now();
    let bindings = triangle.execute(&graph, plan);
    let compute_ns = compute.elapsed().as_nanos();
    println!("Done! Found {} triangles.", bindings.len());
    if DEBUG && bindings.len() < PRINTMAX {
        println!("bindings for var order: {var_order:?}");
        for b in &bindings { println!("  {b:?}"); }
    }

    let total_ns = total.elapsed().as_nanos();
    println!("  loading {:6}ms", load_ns / 1_000_000);
    println!("    query {:6}ms", compute_ns / 1_000_000);
    println!("    total {:6}ms", total_ns / 1_000_000);

    // // PRINT THE ACTUAL TRIANGLES
    // println!();
    // let mut triangles: Vec<_> = bindings.into_iter().map(|x| (x[1], x[2], x[4])).collect();
    // triangles.sort_unstable();
    // for (x,y,z) in triangles { println!("{x} {y} {z}"); }
}

fn main() {
    println!("---------- 1. EMPLOYEES OF DEPT NAMED ACCOUNTING ----------");
    example_accounting_employees();
    print!("\n\n");

    println!("---------- 2. SNAP DATASET TRIANGLES ----------");
    example_snap();
}
