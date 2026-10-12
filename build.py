#!/usr/bin/env python3

from pathlib import Path
import json

from tools.build_system import BuildSystem


ROOT = Path(__file__).resolve().parent


targets = json.loads((ROOT / "build-targets.json").read_text())
build = BuildSystem(ROOT, common_inputs=["build.py", "build-targets.json"])

# Serialize the builds: they share the cargo target directory.
build.pool("serial_pool", depth=1)
build.rule(
    "run_target_command",
    command="$target_command",
    description="BUILD $target_name",
    pool="serial_pool",
    restat=True,
)
for name, spec in targets.items():
    build.target(
        name,
        spec,
        rule="run_target_command",
        variables={"target_command": spec["command"], "target_name": name},
    )
build.run()


