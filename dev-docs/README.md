# CatColab: Design documents

This folder contains mathematical and technical design documents for CatColab,
written using [forester](https://sr.ht/~jonsterling/forester/).

## Building the forest

*The following instructions are adapted from the upstream [forest template](https://git.sr.ht/~jonsterling/forest-template).*

To build this forest, you need to have a working installation of the following software:

- LaTeX, preferably the _full_ [TeXLive distribution](https://tug.org/texlive/)

To build the forest, then simply run `./forester build`. To view the forest, run `./serve.sh` and go to `http://localhost:8080/index.xml` in your web browser. Note that you will need python installed for `./serve.sh` to work properly.

If you have `inotifywait` installed, you can run `./watch.sh` to watch for changes to the `trees` directory and rebuild accordingly.