# Changelog

Notable changes to CatColab will be documented in this file.

Since CatColab is first and foremost an application, not a library, the project
does not follow [semantic versioning](https://semver.org/). Major versions are
released when enough significant new features are accumulated to justify an
announcement and a blog post. Minor versions are not announced but allow
features and fixes to be released with greater frequency. Minor versions often
include notable new features.

## [Unreleased]

### Added

- New service: the backend now provides a compute service for
  [Julia](https://julialang.org/) and
  [AlgebraicJulia](https://www.algebraicjulia.org/)
  ([#1132](https://github.com/ToposInstitute/CatColab/pull/1132))
- New analysis: table view for instances of a schema
  ([#835](https://github.com/ToposInstitute/CatColab/pull/835)), based on the
  new Julia service
- New logic: systems of polynomial ODEs
  ([#1176](https://github.com/ToposInstitute/CatColab/pull/1176))
- Experimental: Petri nets created in
  [Petrinaut](https://www.npmjs.com/package/@hashintel/petrinaut) and exported
  as JSON can be imported into CatColab
  ([#1187](https://github.com/ToposInstitute/CatColab/pull/1187))

### Changed

- Backend re-architecture: Automerge meta-documents are now created by the
  backend to maintain user state, such as the user's list of documents
  ([#976](https://github.com/ToposInstitute/CatColab/pull/976))

## [v0.5.1](https://github.com/ToposInstitute/CatColab/releases/tag/v0.5.1) & [v0.5.2](https://github.com/ToposInstitute/CatColab/releases/tag/v0.5.2) (2026-03-24)

### Added

- Rich text editor now supports inline math based on KaTeX
  ([#1087](https://github.com/ToposInstitute/CatColab/pull/1087)), in addition
  to display math
- New analysis: visualize composition pattern of instantiated models as an
  undirected wiring diagram
  ([#1069](https://github.com/ToposInstitute/CatColab/pull/1069),
  [#1117](https://github.com/ToposInstitute/CatColab/pull/1117/))

### Changed

- For developers: switched from Biome to [Oxc](https://oxc.rs/) for TypeScript
  formatting and linting
  ([#1146](https://github.com/ToposInstitute/CatColab/pull/1146))

## [v0.5.0](https://github.com/ToposInstitute/CatColab/releases/tag/v0.5.0) (2026-03-09)

Blog post: [CatColab v0.5:
Sandpiper](https://topos.institute/blog/2026-03-23-catcolab-0-5-sandpiper/)

### Added

- Composing Petri nets by sharing/identifying places
- [ELK](https://github.com/kieler/elkjs) is now available as an alternative to
  Graphviz for graph layout in graph visualization analyses
  ([#1019](https://github.com/ToposInstitute/CatColab/pull/1019))
- New analysis: display the system of equations for mass-action dynamics in
  mathematical notation
  ([#954](https://github.com/ToposInstitute/CatColab/pull/954))
- New analysis: unbalanced mass-action dynamics (i.e. distinct consumption and
  production rates) for Petri nets and stock-flow diagrams
  ([#1000](https://github.com/ToposInstitute/CatColab/pull/1000), [#1045](https://github.com/ToposInstitute/CatColab/pull/1045))
- New analysis: generate SQL schema definitions from schemas in CatColab
  ([#843](https://github.com/ToposInstitute/CatColab/pull/843))

### Changed

- Backend re-architecture
  ([#875](https://github.com/ToposInstitute/CatColab/pull/875)): syncing of
  [Automerge](https://automerge.org/) documents is now provided by the Rust
  crate [samod](https://github.com/alexjg/samod) instead of the Node package
  [automerge-repo](https://github.com/automerge/automerge-repo). As a result,
  100% of the CatColab backend is now written in Rust.

### Fixed

- A serious bug related to the rich text editor that could result in document
  corruption has been fixed
  [upstream](https://github.com/automerge/automerge/pull/1279)
  ([#1056](https://github.com/ToposInstitute/CatColab/pull/1056))

## [v0.4.3](https://github.com/ToposInstitute/CatColab/releases/tag/v0.4.3) (2026-01-13)

Two new [example models](https://catcolab.org/help/guides/example-models) and a bug fix.

## [v0.4.2](https://github.com/ToposInstitute/CatColab/releases/tag/v0.4.2) (2026-01-08)

### Added

- New logic: stock flow diagrams with signed links
  ([#905](https://github.com/ToposInstitute/CatColab/pull/905))
- New analysis: visualization of schemas as entity-relation diagrams
  ([#918](https://github.com/ToposInstitute/CatColab/pull/918))
- Meaningful browser titles for all pages in CatColab
  ([#933](https://github.com/ToposInstitute/CatColab/pull/933))

### Changed

- More clear and consistent UI for analysis settings
  ([#929](https://github.com/ToposInstitute/CatColab/pull/929))
- Usability fixes to revamped split pane UI, following its introduction in v0.4

## [v0.4.1](https://github.com/ToposInstitute/CatColab/releases/tag/v0.4.1) (2025-12-04)

Bug fixes following the v0.4 major release.

## v0.4 and earlier

Maintenance of this changelog started after the v0.4 release. These earlier
releases are summarized in the blog posts:

- [v0.3 - v0.4: Robin](https://topos.institute/blog/2026-01-08-catcolab-0-4-robin/)
- [v0.2: Wren](https://topos.institute/blog/2025-02-05-catcolab-0-2-wren/)
- [v0.1: Hummingbird](https://topos.institute/blog/2024-10-02-introducing-catcolab/)
