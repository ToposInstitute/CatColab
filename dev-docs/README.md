# CatColab: Design documents

This folder contains mathematical and technical design documents for CatColab,
written using [forester](https://sr.ht/~jonsterling/forester/).

## Building the forest

*The following instructions are adapted from the upstream [forest template](https://git.sr.ht/~jonsterling/forest-template).*

To build this forest, you need to have a working installation of the following software:

- LaTeX, preferably the _full_ [TeXLive distribution](https://tug.org/texlive/)

- `forester`, which you can install using `opam install forester`

Once you have ensured that these programs are installed and in your `PATH`, simply run `forester build`. To view the forest, you can open `output/index.xml` in your favorite browser: for Firefox, you may need to set `security.fileuri.strict_origin_policy` to `false` in `about:config`. Alternatively, you can serve the `output` directory from a local webserver to avoid this.

If you have `inotifywait` installed, you can run `./watch.sh` to watch for changes to the `trees` directory and rebuild accordingly.
