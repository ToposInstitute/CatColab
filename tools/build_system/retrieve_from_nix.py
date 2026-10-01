from pathlib import Path
import shutil
import subprocess
import sys


def retrieve_from_nix(root: Path, targets: dict, names: list[str]) -> None:
    """
    Build target outputs via nix (cached if already built) and copy them to
    the build directory.

    The target needs to have a flake package of the same name.
    """
    for name in names:
        spec = targets[name]
        result = subprocess.run(
            ["nix", "build", f"{root}#{name}", "--no-link", "--print-out-paths"],
            check=True,
            capture_output=True,
            text=True,
        )
        store_path = Path(result.stdout.strip().splitlines()[-1])
        for rel in spec["outputs"]:
            dest = root / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            # installPhase in ninja-target.nix copies outputs flat into $out.
            shutil.copyfile(store_path / Path(rel).name, dest)
            dest.chmod(0o644)
        print(f"retrieved {name} from {store_path}", file=sys.stderr)
