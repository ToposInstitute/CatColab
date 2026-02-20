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
