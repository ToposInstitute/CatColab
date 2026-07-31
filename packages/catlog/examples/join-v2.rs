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
// the relation:

type IndexShape = Vec<IndexColumnShape>; // length = arity of relation
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
enum IndexColumnShape {   // what to do with column i.
    TrieLevel(usize), // TrieLevel(k) => becomes trie level k.
    EqConst(Value),   // EqConst(v)   => filter: equal to v, otherwise discard.
    EqColumn(usize),  // EqColumn(j)  => filter: equal to column j, otherwise discard.
}

// The filters must be checked for each row before modifying the trie.
//
// Interpreting these IndexShapes to build trie indexes is likely to be somewhat
// inefficient due to having interpretative overhead in the inner loop. TODO: Measure this
// and redesign if too slow. My instincts: instead of one loop over every row that
// examines the IndexShape each time, turn IndexShape into a pipeline of ops, each one of
// which turns into one loop over the rows. The filters (EqConst, EqColumn) should be
// pretty straightforward to do this way. The trie shaping is a little less obvious.

impl Trie {
    fn build<Db: Database>(db: Db, rel: Db::RelId, shape: &IndexShape) -> Option<Trie> {
        // Option<Trie> because it the result may be empty. E.g. if the atom is R(2), then
        // the result will be Some(Leaf) if R(2) holds and None otherwise.
        todo!("build a trie from db.rows(rel) using `shape`");
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
