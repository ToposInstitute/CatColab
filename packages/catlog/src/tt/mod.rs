//! Type theory for catlog
#[allow(unused)]
mod eval;
#[allow(unused)]
mod prelude;
#[allow(unused)]
mod stx;
#[allow(unused)]
mod toplevel;
#[allow(unused)]
mod util;
#[allow(unused)]
mod val;

// How are we going to use memory in this module?
//
// In the prototype, I used a bump allocator which ended up turning out pretty nicely.
// In this version, we have to maintain a cache of elaborated notebooks, which might
// persist indefinitely.
//
// I think to be compatible with the rest of catlog, we should use Rc.
