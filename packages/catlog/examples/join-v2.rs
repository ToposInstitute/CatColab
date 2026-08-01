#![allow(missing_docs, unused, dead_code)]

use std::io::prelude::*;
use std::time::Instant;
use std::collections::HashMap;
use std::collections::HashSet;
use std::hash::Hash;

const DEBUG: bool = true;
// Debug-print vectors of length <= PRINTMAX.
const PRINTMAX: usize = 40;

macro_rules! print_flush {
    ($($e:tt)*) => { { print!($($e)*); std::io::stdout().flush().unwrap() } }
}

fn clone_with_capacity<A: Clone>(n: usize, src: &Vec<A>) -> Vec<A> { // TODO: eliminate if unused
    debug_assert!(n >= src.len());
    let mut r = Vec::with_capacity(n);
    r.extend_from_slice(src);
    return r;
}

// I'm assuming we intern everything up front. This makes things simpler than figuring out
// where to put tags to minimize tag-checking overhead.
type Value = usize;


// ---------- Loading SNAP graph datasets ----------
// Set EDGES environment variable to override; EDGES=all for no limit.
const DEFAULT_MAX_EDGES: usize = 1_000;
const DEFAULT_FILE: &str = "examples/data/ca-GrQc.txt";

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


// ---------- DATABASES AND QUERIES ----------
//
// A database is something which has relations and can tabulate them.
//
// TODO: how do I incorporate functional dependency information here?
//
// ANSWER: simplest way is to let each relation declare a primary key, which all other
// keys are determined by. This is less general than full FDs but easier to represent and
// plan around and handles ACSet-type schemas.
trait Database {
    type RelId: Eq + Hash + Clone;
    fn arity(&self, r: Self::RelId) -> usize;
    fn count(&self, r: Self::RelId) -> usize;
    fn rows(&self, r: Self::RelId) -> impl Iterator<Item = &[Value]>;
}

// impl<Db: Database> Database for &Db {
//     type RelId = Db::RelId;
//     fn arity(&self, r: Db::RelId) -> usize { (*self).arity(r) }
//     fn count(&self, r: Db::RelId) -> usize { (*self).count(r) }
//     fn rows(&self, r: Db::RelId) -> impl Iterator<Item = &[Value]> { (*self).rows(r) }
// }

// TODO: how do we represent constants in atoms?
struct Atom<RelId, Var> {
    relation: RelId,
    vars: Vec<Var>,
}

struct Query<Db: Database, Var: Eq + Hash + Copy> {
    vars: Vec<Var>,
    atoms: Vec<Atom<Db::RelId, Var>>,
}

struct QueryContext<Db: Database, Var: Eq + Hash + Copy> {
    db: Db,
    query: Query<Db, Var>,
}

// A plan has one `indexes` entry for each atom in the query and one level for each
// variable. The index entries may happen to be duplicates of the same index; that's
// deliberate: when we execute the plan, we're going to maintain some distinct mutable
// state corresponding to each entry.
//
// levels[i]: bounds for variable i.
// levels[i][j]: the trie which we should use to bound this variable.
// Let t = indexes[k] be a trie and d be its depth. Then `k` should occur exactly `d`
// times in `levels`, each occurrence corresponding to one level of `t`.
//
// Example: Consider the query
//
//     E(x,y) E(y,z) E(z,x) with variable order x,y,z
//
// We'll need two indexes, fwd(x,y) = E(x,y) and bwd(y,x) = E(x,y). You can think of this
// as rewriting the query so that every atom has the same variable order:
//
//     fwd(x,y) fwd(y,z) bwd(x,z)
//
// Then this becomes:
//
//     QueryPlan {
//         indexes: [&fwd, &fwd, &bwd],
//         levels: [[0,2],      // x ← fwd    ∩ bwd    = {x : ∃y,z. E(x,y) ∧ E(z,x)}
//                  [0,1],      // y ← fwd[x] ∩ fwd    = {y : E(x,y) ∧ ∃z. E(y,z)}
//                  [1,2]],     // z ← fwd[y] ∩ bwd[x] = {z : E(y,z) ∧ E(z,x) }
//     }
struct QueryPlan<'a> {
    // May contain duplicates. This is deliberate. TODO EXPLAIN
    indexes: Vec<&'a Trie>,
    levels: Vec<Vec<usize>>,
}

impl<'a> QueryPlan<'a> {
    fn execute_dfs<F>(&self, mut f: F) where F: FnMut(&[Value]) {
        // Execute via depth-first backtracking.
        QueryDfsState {
            tries: self.indexes.clone(),
            levels_reverse: self.levels.iter().rev().cloned().collect(),
            prefix: Vec::with_capacity(self.levels.len()),
            callback: f,
        }.execute()
    }
}

struct QueryDfsState<'a, F> {
    callback: F,
    tries: Vec<&'a Trie>,       // the current node in each trie that we're investigating.
    levels_reverse: Vec<Vec<usize>>,
    prefix: Vec<Value>,      // partial solution: prefix[i] = value of ith variable.
    // scratch: Vec<&'a Trie>,  // a scratch vector of tries used when trying to find a match
    // stack: Vec<&'a Trie>,  // a stack of trie nodes, used to save & restore tries
    // // Every time we enter a level, we push the trie nodes for that level on the stack.
    // //
    // // Eg. if we enter a level [0,2] and our stack is [s...]
    // // we push plan.tries[0] and plan.tries[2] on the stack
    // // so now our stack is [s..., plan.tries[0], plan.tries[2]].
}

impl<'a, F: FnMut(&[Value])> QueryDfsState<'a, F> {
    fn execute(&mut self) {
        assert!(!self.levels_reverse.is_empty());
        let level: Vec<usize> = self.levels_reverse.pop().unwrap();
        // For each trie in this level, snapshot its current node so we can restore it
        // when we're done.
        //
        // TODO: instead of allocating many small vectors here, add a stack Vec to
        // QueryDfsState for saving this information (one big Vec) and push/pop it.
        let level_tries: Vec<&Trie> = level.iter().map(|&trie_idx| self.tries[trie_idx]).collect();
        // Get the trie maps for each trie we're using in this level.
        // TODO: either avoid this allocation or put it into a mutable vec on QueryDfsState.
        let level_maps: Vec<&HashMap<Value, Trie>> = level_tries.iter().copied()
            .map(|trie| match trie {
                Trie::Node(map) => map,
                Trie::Leaf => panic!("trie ran out of levels too soon"),
            }).collect();
        // Which map has the smallest count?
        let proposer_map_idx: usize = level_maps.iter()
            .enumerate()
            .min_by_key(|(map_idx, map)| map.len())
            .unwrap()
            .0;

        'keys: for (key, child) in level_maps[proposer_map_idx] {
            let mut children = Vec::new();
            // Look up this key in each trie at this level. If any trie lacks this key,
            // skip to the next key.
            for (pos, &trie_idx) in level.iter().enumerate() {
                if pos == proposer_map_idx { children.push(child); continue; }
                match level_maps[pos].get(key) {
                    Some(child) => children.push(child),
                    None => continue 'keys,
                }
            }
            // Write the children into `self.tries` and recurse.
            for (pos, &trie_idx) in level.iter().enumerate() {
                self.tries[trie_idx] = children[pos];
            }
            self.recur(*key)
        }

        // Restore every trie in this level to the parent node the caller left it at.
        for (pos, &trie_idx) in level.iter().enumerate() {
            self.tries[trie_idx] = level_tries[pos];
        }
        self.levels_reverse.push(level);
    }

    fn recur(&mut self, next: Value) {
        self.prefix.push(next);
        if self.levels_reverse.is_empty() {
            (self.callback)(self.prefix.as_slice());
        } else {
            self.execute();
        }
        let popped = self.prefix.pop();
        debug_assert!(popped == Some(next));
    }
}

// ==== ON IMPLEMENTING COMPUTATIONAL ATOMS ====
//
// Frank McSherry's DataToad project takes a "breadth-first" approach to solving WCOJs,
// maintaining a vector of partial solutions for the first N variables, then extending to
// partial solutions for N+1, etc. LFTJ takes a "depth first" or backtracking approach
// instead. Both of these can incorporate computational atoms:
//
// - Frank McSherry has a blog post about how to plan & execute computational atoms:
//
//   https://github.com/frankmcsherry/blog/blob/master/posts/2025-12-23.md
//
//   Email me (Michael Arntzenius, daekharel@gmail.com) if you're having trouble
//   understanding it or how it relates to this implementation; or email Frank and cc me,
//   he's quite friendly (but won't know anything about this implementation).
//
// - The Leapfrog Triejoin paper discusses some kinds of computational atoms:
//
//   https://arxiv.org/abs/1210.0481
//
//   LFTJ uses a "trie iterator" interface. If you line things up right it's possible for
//   many computational atoms to satisfy this interface. You can think of this as
//   materializing the trie lazily/on-demand. Of course, computational atoms can't
//   materialize levels of the trie that correspond to their *input* variables, but they
//   can be told to "seek to position x" (this assigns that input variable to x). As long
//   as *some* atom/trie iterator can materialize a list of candidates for this variable,
//   things work out eventually.
//
//   See section 3.4, p6, list item 1, which discusses equality atoms, and section 6.2,
//   numbered list, elements 2-3 ("Functions", "Primitives") and 6 ("Ranges"). (Note that
//   "Function" does NOT mean computational function here: it means functionaln
//   dependency.)


// ---------- TRIE INDEXES ----------
enum Trie {
    Leaf,
    Node(HashMap<Value, Trie>),
}

// ==== LONG ASIDE ABOUT LEAPFROG TRIEJOIN AND SORTING-BASED APPROACHES TO WCOJS ====
//
// This is the hash-based or nested approach to trie indexes. (Of course, we could use a
// BTreeMap instead for each trie level but that is essentially the same approach.)
//
// An alternative approach is to use a sorted index for the entire "trie". For instance, a
// vector sorted in lexical order can be treated as a "trie" implicitly. This results in a
// join that looks more like Leapfrog Triejoin (LFTJ), where we intersect iterators at a
// given trie level by round-robinning between them, advancing the most lagging iterators
// toward the most advanced one until they all agree. This is how dijkstralog works, for
// instance (https://github.com/rntz/dijkstralog).
//
// Unfortunately, while sorted vectors are simple and efficient, they can't be updated
// in-place efficiently. So you'll need a B-tree, LSM-tree, or similar. These are quite a
// bit more complicated to implement and work with than a hash-based Trie. (My vague
// feeling, not substantiated by any actual benchmarking, is that B-trees are better for
// reads and worse for large writes than LSM-trees. Dijkstralog contains an LSM
// implementation.)
//
// You might think we could reuse the Rust stdlib's BTreeMap. Unfortunately, it doesn't
// support the primitives needed for LFTJ: we need to be able to keep an internal iterator
// into the BTree that can efficiently "seek" forward toward an upper bound. We can't do
// this with standard iterators. There's an experimental "Cursor" interface on BTrees
// available on Rust nightly (as of 2026-07-31) that gets partway there:
//
// https://github.com/rust-lang/rust/issues/107540
// https://doc.rust-lang.org/std/collections/btree_map/struct.Cursor.html
// https://doc.rust-lang.org/std/collections/struct.BTreeMap.html#method.lower_bound
//
// But I think this interface isn't rich enough to handle LFTJ: it doesn't support seeking
// an existing Cursor forward toward a bound. (Also, for proper asymptotics on your join
// you want the search implementation to use galloping/exponential search, not binary
// search; I'm not sure which they're using. Using binary search can make dense joins,
// where many values match, quite inefficient.)


// ---------- ON TRIE INDEXING FOR WCOJs ----------
//
// Each relation may need multiple trie indexes, because with a single variable order
// different atoms may traverse it differently, e.g. S(x,y) S(y,x). These indexes will in
// general not be simply permutations of the variable order, for two reasons:
//
//     1. Constants, eg: S(x,2).
//     2. Variable re-occurrences, eg: S(x,x).
//
// A trie index for an atom R(xs...) will have N levels, where N is the # of distinct
// variables in xs. An index can be specified by indicating what to do for each column of
// the relation.

type IndexShape = Vec<IndexColumnShape>; // length = arity of relation
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
enum IndexColumnShape {   // what to do with column i.
    TrieLevel(usize), // TrieLevel(k) => becomes trie level k.
    EqConst(Value),   // EqConst(v)   => filter: equal to v, otherwise discard.
    EqColumn(usize),  // EqColumn(j)  => filter: equal to column j, otherwise discard.
}

// INVARIANT: If shape[i] = EqColumn(j), we should have j < i and shape[j] = TrieLevel(_).
// This ensures that shapes which denote equivalent indexes are equal on the nose.

impl Trie {
    // Trie::build() returns None if the trie is empty. This is necessary to distinguish
    // between Some(Trie::Leaf()), a trie containing an single empty tuple, and None, an
    // empty trie.
    //
    // TODO: Trie::build() may be slow due to the interpretative overhead of examining
    // filters and level_to_col in the inner loop. Measure this and redesign if too slow.
    // Instead of one loop interpreting these for each row each filter could become its
    // own loop, and level_to_col a final loop (or maybe there's some way to pipeline even
    // further?).
    fn build<Db: Database>(db: &Db, rel: Db::RelId, shape: &IndexShape) -> Option<Trie> {
        // Preprocess `shape` once, outside the row loop:
        //  - `level_to_col[k]` is the column that becomes trie level k.
        //  - `filters` are the columns carrying EqConst/EqColumn checks.
        let n_levels = shape.iter().filter(|c| matches!(c, IndexColumnShape::TrieLevel(_))).count();
        let mut level_to_col: Vec<Option<usize>> = vec![None; n_levels];
        let mut filters: Vec<(usize, &IndexColumnShape)> = Vec::new();
        for (col, colshape) in shape.iter().enumerate() {
            match colshape {
                IndexColumnShape::TrieLevel(k) => {
                    // The TrieLevels must form a permutation of 0..n_levels: each level in
                    // range and assigned exactly once.
                    assert!(*k < n_levels, "TrieLevel({k}) out of range for {n_levels} levels");
                    assert!(level_to_col[*k].is_none(), "TrieLevel({k}) assigned twice");
                    level_to_col[*k] = Some(col);
                }
                IndexColumnShape::EqConst(_) => filters.push((col, colshape)),
                IndexColumnShape::EqColumn(j) => {
                    // Enforce the invariant on Shape.
                    assert!(*j < col, "EqColumn({j}) at column {col} is not a backreference");
                    assert!(matches!(shape[*j], IndexColumnShape::TrieLevel(_)),
                            "EqColumn({j}) at column {col} must point to a TrieLevel");
                    filters.push((col, colshape));
                }
            }
        }
        // Every level got a column (follows from the count + range + no-dup asserts, but
        // make it explicit): unwrap the Options into a plain Vec<usize>.
        let level_to_col: Vec<usize> =
            level_to_col.into_iter().map(|c| c.expect("every trie level must have a column")).collect();

        let arity = shape.len();
        let mut root = Trie::Node(HashMap::new());
        // For the N == 0 case (an atom with no variables, like R(2)) there is no root
        // Node; we only need to know whether any row survived the filters.
        let mut any_row = false;

        for row in db.rows(rel) {
            debug_assert!(row.len() == arity, "row arity {} != shape arity {arity}", row.len());

            // Apply filters; discard the row on any failure.
            let keep = filters.iter().all(|(col, colshape)| match colshape {
                IndexColumnShape::EqConst(v) => row[*col] == *v,
                IndexColumnShape::EqColumn(j) => row[*col] == row[*j],
                IndexColumnShape::TrieLevel(_) => unreachable!("filters holds no TrieLevels"),
            });
            if !keep { continue }
            any_row = true;

            // Walk the surviving row's path into the trie, materializing intermediate
            // Nodes on the way down and a Leaf at the bottom.
            let mut node = &mut root;
            for (level, &col) in level_to_col.iter().enumerate() {
                let deepest = level == n_levels - 1;
                match node {
                    Trie::Node(map) => {
                        node = map.entry(row[col]).or_insert_with(|| {
                            if deepest { Trie::Leaf } else { Trie::Node(HashMap::new()) }
                        });
                    }
                    Trie::Leaf => unreachable!("only the deepest level holds Leaves"),
                }
            }
        }

        if !any_row { None }
        else if n_levels == 0 { Some(Trie::Leaf) }
        else { Some(root) }
    }
}

// ---------- AN ALTERNATIVE APPROACH TO CONSTANTS & VARIABLE DUPLICATION ----------
//
// Constants can be handled by rewriting the query to use singleton relations:
//
//     R(x,2) ---> R(x,y) is2(y)
//
// Where is2 = {2}. Singleton relations are easily materialized.
//
// Variable duplication can be handled with a non-materializable equality relation:
//
//     R(x,x) --> R(x,y) equal(x,y)
//
// We want to handle non-materializable relations eventually, so once we do, we might be
// able to simplify this code.

// ---------- ON TRIE INDEX SHARING ----------
//
// For now, we only re-use trie indexes when they have the same IndexShape. For instance,
// if the variable order is x,y,z then the atoms R(x,y), R(y,z), R(x,z) use the same
// index, but R(y,x) will need a different one.
//
// In principle we can do more interesting re-use, for instance, R(x,y) and R(2,x) and
// R(x,x) can use the same index. It is more obvious how to do this using the "alternative
// approach" of desugaring constants and variable re-use into separate atoms.


// ---------- STEPS FOR EXECUTING A QUERY ----------
//
// 1. CHASING FDS GOES HERE?
//    I think chasing FDs may be more important than semijoin reduction if I
//    only have time to do one.
//
// 2. SEMIJOIN REDUCTION GOES HERE?
//
// 3. Get statistics on it, eg. for each variable, the min across all relations
//    of the # of values it could have. We can approximate that using the size
//    of the relation, but can do even better by actually counting distinct
//    values.
//
// 4. Use these stats (& FDs once we have them) to pick a variable order.
//
// 5. Build trie indexes on each relation.
//
// 6. Execute query using the indexes.


// ---------- MAIN ----------
fn main() { tests::run_all(); }


// ============================================================================
// ===================== TESTS (mostly claude-generated)  =====================
// ============================================================================
//
// Everything below is test-only code. Run with:
//
//     cargo run --example join-v2
//
// Since query planning / variable-order selection don't exist yet, each test
// hand-builds the trie indexes and the `QueryPlan` (indexes + levels) that a
// planner would eventually produce, then checks `Trie::build` and
// `QueryPlan::execute_dfs` against a brute-force computation over small data.
mod tests {
    use super::*;
    use super::IndexColumnShape::{TrieLevel, EqColumn, EqConst};
    use std::collections::{HashMap, HashSet};

    // ---- A trivial in-memory Database backed by Vecs. ----
    struct VecDb {
        // name -> (arity, rows)
        rels: HashMap<&'static str, (usize, Vec<Vec<Value>>)>,
    }

    impl VecDb {
        fn new() -> Self { VecDb { rels: HashMap::new() } }

        // Builder-style: add a relation. Panics if a row's width != arity.
        fn rel(mut self, name: &'static str, arity: usize, rows: Vec<Vec<Value>>) -> Self {
            for row in &rows { assert_eq!(row.len(), arity, "bad row width in {name}"); }
            self.rels.insert(name, (arity, rows));
            self
        }
    }

    impl Database for VecDb {
        type RelId = &'static str;
        fn arity(&self, r: &'static str) -> usize { self.rels[r].0 }
        fn count(&self, r: &'static str) -> usize { self.rels[r].1.len() }
        fn rows(&self, r: &'static str) -> impl Iterator<Item = &[Value]> {
            self.rels[r].1.iter().map(|row| row.as_slice())
        }
    }

    // ---- Small helpers. ----

    // Sorted keys of a trie node's map.
    fn keys(node: &Trie) -> Vec<Value> {
        match node {
            Trie::Node(map) => { let mut k: Vec<Value> = map.keys().copied().collect(); k.sort(); k }
            Trie::Leaf => panic!("expected a Trie::Node, got a Leaf"),
        }
    }

    // Child of a node under `key` (panics if absent or if node is a Leaf).
    fn child<'a>(node: &'a Trie, key: Value) -> &'a Trie {
        match node {
            Trie::Node(map) => map.get(&key).expect("missing key"),
            Trie::Leaf => panic!("expected a Trie::Node, got a Leaf"),
        }
    }

    fn is_leaf(node: &Trie) -> bool { matches!(node, Trie::Leaf) }

    // Run a plan and return its output rows, sorted & de-duplicated.
    fn run_plan(plan: &QueryPlan) -> Vec<Vec<Value>> {
        let mut out: Vec<Vec<Value>> = Vec::new();
        plan.execute_dfs(|row| out.push(row.to_vec()));
        out.sort();
        out.dedup();
        out
    }

    fn normalize(mut v: Vec<Vec<Value>>) -> Vec<Vec<Value>> {
        v.sort();
        v.dedup();
        v
    }

    // ---- Test 1: Trie::build across all IndexColumnShape kinds. ----
    //
    // Exercises: multi-level tries, a non-identity permutation shape, the
    // EqColumn filter (R(x,x)), empty results (-> None), and the zero-level
    // EqConst path (-> Some(Leaf) / None).
    fn test_trie_build() {
        let db = VecDb::new()
            .rel("E", 2, vec![vec![0, 1], vec![0, 2], vec![1, 2]])
            .rel("R", 2, vec![vec![0, 0], vec![1, 2], vec![3, 3], vec![2, 2]])
            .rel("S", 2, vec![vec![0, 1], vec![1, 0]])
            .rel("T", 1, vec![vec![5], vec![6]]);

        // Forward index E(x,y): level 0 = col 0, level 1 = col 1.
        let fwd = Trie::build(&db, "E", &vec![TrieLevel(0), TrieLevel(1)]).unwrap();
        assert_eq!(keys(&fwd), vec![0, 1]);
        assert_eq!(keys(child(&fwd, 0)), vec![1, 2]);
        assert_eq!(keys(child(&fwd, 1)), vec![2]);
        assert!(is_leaf(child(child(&fwd, 0), 1)));

        // Backward index E(x,y) with a *swapped* shape: level 0 = col 1 (the
        // destination), level 1 = col 0 (the source). So top-level keys are the
        // set of destinations.
        let bwd = Trie::build(&db, "E", &vec![TrieLevel(1), TrieLevel(0)]).unwrap();
        assert_eq!(keys(&bwd), vec![1, 2]);       // destinations
        assert_eq!(keys(child(&bwd, 2)), vec![0, 1]); // sources of edges into 2

        // R(x,x): EqColumn(0) keeps only rows where col1 == col0; depth-1 trie.
        let diag = Trie::build(&db, "R", &vec![TrieLevel(0), EqColumn(0)]).unwrap();
        assert_eq!(keys(&diag), vec![0, 2, 3]);
        assert!(is_leaf(child(&diag, 0)));

        // S has no diagonal rows, so R(x,x)-style build over S is empty -> None.
        assert!(Trie::build(&db, "S", &vec![TrieLevel(0), EqColumn(0)]).is_none());

        // Zero-level (fully constant) atom via EqConst: Some(Leaf) iff a match exists.
        match Trie::build(&db, "T", &vec![EqConst(5)]) {
            Some(Trie::Leaf) => {}
            other => panic!("T(5) should build Some(Leaf), got {:?}", other.is_some()),
        }
        assert!(Trie::build(&db, "T", &vec![EqConst(9)]).is_none());
    }

    // ---- Test 2: triangle query E(x,y) E(y,z) E(z,x), order x,y,z. ----
    //
    // This is the worked example in the QueryPlan doc comment: the canonical
    // worst-case-optimal-join workload. Checked against a brute-force scan.
    fn test_triangle_query() {
        let edges: Vec<(Value, Value)> = vec![
            (0, 1), (1, 2), (2, 0),   // a directed 3-cycle
            (0, 2), (2, 1), (1, 0),   // and its reverse
            (1, 3), (3, 1),           // extra edges, not in any triangle here
        ];
        let db = edge_db(&edges);

        // fwd = E indexed (source, dest); bwd = E indexed (dest, source).
        let fwd = Trie::build(&db, "E", &vec![TrieLevel(0), TrieLevel(1)]).unwrap();
        let bwd = Trie::build(&db, "E", &vec![TrieLevel(1), TrieLevel(0)]).unwrap();

        // Rewritten atoms: fwd(x,y) fwd(y,z) bwd(x,z).
        let plan = QueryPlan {
            indexes: vec![&fwd, &fwd, &bwd],
            levels: vec![vec![0, 2], vec![0, 1], vec![1, 2]],
        };
        let got = run_plan(&plan);

        // Brute force: all (x,y,z) with x->y, y->z, z->x.
        let edge_set: HashSet<(Value, Value)> = edges.iter().copied().collect();
        let mut want: Vec<Vec<Value>> = Vec::new();
        for &(x, y) in &edges {
            for &(y2, z) in &edges {
                if y2 == y && edge_set.contains(&(z, x)) {
                    want.push(vec![x, y, z]);
                }
            }
        }
        let want = normalize(want);

        assert!(!want.is_empty(), "test data should contain triangles");
        assert_eq!(got, want, "triangle join mismatch");
    }

    // ---- Test 3: two-atom path query E(x,y) E(y,z), order x,y,z. ----
    //
    // A trie shared by two atom-entries (both use `fwd`), so it exercises the
    // save/restore of a trie that participates in multiple levels.
    fn test_path_query() {
        let edges: Vec<(Value, Value)> = vec![
            (0, 1), (1, 2), (1, 3), (2, 3), (3, 0),
        ];
        let db = edge_db(&edges);
        let fwd = Trie::build(&db, "E", &vec![TrieLevel(0), TrieLevel(1)]).unwrap();

        // levels: x <- entry0; y <- entry0 ∩ entry1; z <- entry1.
        let plan = QueryPlan {
            indexes: vec![&fwd, &fwd],
            levels: vec![vec![0], vec![0, 1], vec![1]],
        };
        let got = run_plan(&plan);

        let mut want: Vec<Vec<Value>> = Vec::new();
        for &(x, y) in &edges {
            for &(y2, z) in &edges {
                if y2 == y { want.push(vec![x, y, z]); }
            }
        }
        let want = normalize(want);

        assert!(!want.is_empty(), "test data should contain 2-paths");
        assert_eq!(got, want, "path join mismatch");
    }

    // ---- Test 4: single self-join atom R(x,x), order x. ----
    //
    // Exercises the EqColumn trie inside execute_dfs (a depth-1 join whose only
    // trie came from a variable-reuse shape).
    fn test_self_loop_query() {
        let db = VecDb::new().rel(
            "R", 2,
            vec![vec![0, 0], vec![1, 1], vec![2, 3], vec![4, 4], vec![5, 6]],
        );
        let diag = Trie::build(&db, "R", &vec![TrieLevel(0), EqColumn(0)]).unwrap();
        let plan = QueryPlan { indexes: vec![&diag], levels: vec![vec![0]] };
        let got = run_plan(&plan);
        assert_eq!(got, vec![vec![0], vec![1], vec![4]], "self-loop mismatch");
    }

    // Build a Database with a single binary relation "E" from an edge list.
    fn edge_db(edges: &[(Value, Value)]) -> VecDb {
        let rows: Vec<Vec<Value>> = edges.iter().map(|&(a, b)| vec![a, b]).collect();
        VecDb::new().rel("E", 2, rows)
    }

    pub fn run_all() {
        test_trie_build();       println!("ok  test_trie_build");
        test_triangle_query();   println!("ok  test_triangle_query");
        test_path_query();       println!("ok  test_path_query");
        test_self_loop_query();  println!("ok  test_self_loop_query");
        println!("all tests passed");
    }
}
