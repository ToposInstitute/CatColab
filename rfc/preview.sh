#!/usr/bin/env bash
# Lightweight RFC previewer: render a Quarto-flavored .md to standalone HTML
# with MathJax, without invoking Quarto.
#
#   ./preview.sh 0009          # build once and open
#   ./preview.sh 0009 --watch  # serve + live-reload on save
set -euo pipefail
cd "$(dirname "$0")"

num="${1:?usage: preview.sh <rfc-number, e.g. 0009> [--watch]}"
mode="${2:-}"
src="${num}.md"
out="${num}.preview.html"
port=8765

# Live-reload snippet: poll this page's Last-Modified over HTTP and reload only
# when it changes, preserving scroll position across reloads.
reload_js="$(cat <<'EOF'
<script>
(function () {
  var key = "rfcScroll:" + location.pathname;
  var y = sessionStorage.getItem(key);
  if (y !== null) window.addEventListener("load", function () { window.scrollTo(0, +y); });
  window.addEventListener("beforeunload", function () {
    sessionStorage.setItem(key, window.scrollY);
  });
  var last = null;
  setInterval(function () {
    fetch(location.href, { method: "HEAD", cache: "no-store" }).then(function (r) {
      var lm = r.headers.get("Last-Modified");
      if (last && lm && lm !== last) location.reload();
      last = lm;
    }).catch(function () {});
  }, 1000);
})();
</script>
EOF
)"

build() {
  local tmp after mfile
  tmp="$(mktemp -t rfc-preview-XXXX).md"
  after="$(mktemp -t rfc-reload-XXXX).html"
  mfile="$(mktemp -t rfc-macros-XXXX).js"
  printf '%s\n' "$reload_js" > "$after"

  # Collect \newcommand macros from each {{< include FILE.qmd >}} as KaTeX
  # `macros` option entries ("\\name": "body"), mirroring how Quarto feeds
  # _macros.qmd to KaTeX. KaTeX infers arity from #1.. in the body, so the
  # optional [n] is dropped; backslashes/quotes are escaped for the JS string.
  : > "$mfile"
  grep -oE '\{\{< include [^ ]+\.qmd' "$src" | awk '{print $3}' | while read -r inc; do
    [ -f "$inc" ] && perl -ne '
      next if /^\s*<!--/;
      if (/\\(?:re)?newcommand\{(\\[A-Za-z]+)\}(?:\[\d+\])?\{(.*)\}\s*$/) {
        my ($k, $v) = ($1, $2);
        s/\\/\\\\/g, s/"/\\"/g for ($k, $v);
        print qq(    "$k": "$v",\n);
      }' "$inc" >> "$mfile"
  done

  # Body without the include directives.
  grep -v '{{< include' "$src" > "$tmp"

  # Resolve citations ([@key]) against the bib, using the repo's CSL if present.
  local cite=()
  if [ -f _references.bib ]; then
    cite+=(--citeproc --bibliography _references.bib)
    [ -f chicago-author-date.csl ] && cite+=(--csl chicago-author-date.csl)
  fi

  pandoc "$tmp" \
    --from markdown --to html5 --standalone --katex \
    --metadata title="RFC ${num}" \
    "${cite[@]}" \
    --include-after-body "$after" \
    -o "$out"

  # Splice our macros into pandoc's stock KaTeX render call (`var macros = [];`)
  # so every equation sees them — KaTeX, unlike MathJax, scopes \newcommand per
  # element, so page-global macros must go through the `macros` option instead.
  MFILE="$mfile" perl -0777 -i -pe '
    BEGIN { open my $f, "<", $ENV{MFILE}; local $/; our $m = <$f>; close $f; }
    s/var macros = \[\];/"var macros = {\n" . $m . "  };"/e;
  ' "$out"

  rm -f "$tmp" "$after" "$mfile"
}

if [ "$mode" = "--watch" ] || [ "$mode" = "watch" ]; then
  build
  python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
  server=$!
  trap 'kill "$server" 2>/dev/null' EXIT
  url="http://127.0.0.1:${port}/${out}"
  echo "Serving $url  (watching $src, Ctrl-C to stop)"
  open "$url"
  # Rebuild on every change to the source or its included macro files.
  fswatch -o "$src" $(grep -oE '\{\{< include [^ ]+\.qmd' "$src" | awk '{print $3}') | while read -r _; do
    echo "rebuild $(date +%H:%M:%S)"
    build || echo "build failed"
  done
else
  build
  echo "Wrote $out"
  open "$out"
fi
