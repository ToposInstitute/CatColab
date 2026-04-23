# CatColab document methods for TypeScript

This package extends the document types defined in
[`document-types`](../document-types) with methods operating on them that can be
called from TypeScript. The reason this package exists is that the TypeScript
type definitions are exported from a Rust crate; thus, any TypeScript functions
acting on the data must be defined separately.

This package is used in [`frontend`](../frontend) but unlike the frontend, it
does not depend any UI libraries and can be used in any environment that can
execute JavaScript, including headless ones.
