#![allow(missing_docs, unused, dead_code)]

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
fn main() { todo!("main"); }
