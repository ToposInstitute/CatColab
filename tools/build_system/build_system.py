from io import StringIO
from pathlib import Path
import os
import sys

from ninja.ninja_syntax import Writer

from .retrieve_from_nix import retrieve_from_nix


class BuildSystem:
    """Build stamped targets with Ninja, or retrieve their outputs via Nix."""

    def __init__(
        self,
        root: Path,
        common_inputs: list[str],
        build_dir: str = "target/ninja",
    ) -> None:
        self.root = root.resolve()
        self.build_dir = build_dir
        self.common_inputs = common_inputs + ["tools/build_system"]
        self.targets: dict = {}
        self.buffer = StringIO()
        self.writer = Writer(self.buffer)
        self.writer.variable("builddir", build_dir)
        self.writer.newline()

    def expand_inputs(self, inputs: list[str]) -> list[str]:
        """Expand directories to files, as Ninja needs file dependencies."""
        files: set[Path] = set()
        for rel in inputs:
            path = self.root / rel
            if path.is_dir():
                files.update(
                    p for p in path.rglob("*")
                    if p.is_file() and "__pycache__" not in p.parts
                )
            else:
                files.add(path)
        return sorted(p.relative_to(self.root).as_posix() for p in files)

    def pool(self, name: str, depth: int) -> None:
        self.writer.pool(name, depth=depth)
        self.writer.newline()

    def rule(self, name: str, command: str, **options) -> None:
        """Declare a rule; the command is wrapped to update the target's stamp."""
        # The stamp ($out) is how ninja tracks freshness; commands typically
        # only write the implicit outputs, so touch it here.
        command = f"{command} && touch $out"
        self.writer.rule(name, command, **options)
        self.writer.newline()

    def target(self, name: str, spec: dict, rule: str, variables: dict) -> None:
        self.targets[name] = spec
        stamp = f"{self.build_dir}/{name}.stamp"
        self.writer.build(
            stamp,
            rule,
            inputs=self.expand_inputs(self.common_inputs + spec["inputs"]),
            implicit_outputs=spec["outputs"],
            variables=variables,
        )
        self.writer.build(name, "phony", stamp)
        self.writer.newline()

    def run(self) -> None:
        """Build the targets named on the command line (default: all)."""
        names = [arg for arg in sys.argv[1:] if arg in self.targets]
        names = names or list(self.targets)

        if os.environ.get("CATCOLAB_BUILD_SYSTEM_RETRIEVE_FROM_NIX") == "true":
            retrieve_from_nix(self.root, self.targets, names)
            return

        import ninja

        contents = self.buffer.getvalue() + "default " + " ".join(self.targets) + "\n"
        build_file = self.root / "build.ninja"
        if not build_file.exists() or build_file.read_text() != contents:
            build_file.write_text(contents)

        os.chdir(self.root)
        ninja.ninja()
