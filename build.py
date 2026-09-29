#!/usr/bin/env python3

from io import StringIO
from pathlib import Path
import json
import os

import ninja
from ninja.ninja_syntax import Writer


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "build-targets.json"
BUILD_FILE = ROOT / "build.ninja"
BUILD_DIR = "target/ninja"

# Inputs shared by every target; changing the build definition rebuilds everything.
COMMON_INPUTS = ["build.py", "build-targets.json"]


def expand_inputs(inputs: list[str]) -> list[str]:
    """Expand directory inputs to the files they contain, as ninja needs files."""
    files: set[Path] = set()
    for rel in inputs:
        path = ROOT / rel
        if path.is_dir():
            files.update(p for p in path.rglob("*") if p.is_file())
        else:
            files.add(path)
    return sorted(p.relative_to(ROOT).as_posix() for p in files)


targets = json.loads(MANIFEST.read_text())

buffer = StringIO()
w = Writer(buffer)

w.variable("builddir", BUILD_DIR)
w.newline()

w.pool("wasm_pool", depth=1)
w.newline()

w.rule(
    "wasm_pack",
    command=f"mkdir -p {BUILD_DIR} && $wasm_pack_command && touch $out",
    description="WASM-PACK $target_name",
    pool="wasm_pool",
    restat=True,
)
w.newline()

for name, target in targets.items():
    stamp = f"{BUILD_DIR}/{name}.stamp"
    w.build(
        stamp,
        "wasm_pack",
        inputs=expand_inputs(COMMON_INPUTS + target["inputs"]),
        implicit_outputs=target["outputs"],
        variables={
            "wasm_pack_command": target["command"],
            "target_name": name,
        },
    )
    w.build(name, "phony", stamp)
    w.newline()

w.build("wasm", "phony", list(targets))
w.default("wasm")

contents = buffer.getvalue()
if not BUILD_FILE.exists() or BUILD_FILE.read_text() != contents:
    BUILD_FILE.write_text(contents)

os.chdir(ROOT)
ninja.ninja()
