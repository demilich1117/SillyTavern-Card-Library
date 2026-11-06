"""Build a small, dependency-free install ZIP from an explicit allowlist."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
assert manifest["version"] == package["version"]
files = ["manifest.json", "index.js", "core.js", "library-index.js", "persistent-cache.js", "host.js", "preview.js", "opencode.js", "ui.js", "style.css", "README.md", "DESIGN.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "CHANGELOG.md", "references/compatibility.md", "validation-2026-11-06.md"]
for name in (manifest["js"], manifest["css"]):
    assert name in files and (root / name).is_file()
output = root / "output"
output.mkdir(exist_ok=True)
archive = output / f"SillyTavern-Card-Library-v{manifest['version']}.zip"
with ZipFile(archive, "w", ZIP_DEFLATED, compresslevel=9) as bundle:
    for relative in files:
        source = root / relative
        assert source.is_file(), relative
        bundle.write(source, f"SillyTavern-Card-Library/{relative}")
with ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    assert len(bundle.namelist()) == len(files)
    for relative in files:
        assert bundle.read(f"SillyTavern-Card-Library/{relative}") == (root / relative).read_bytes()
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / f"{archive.name}.sha256").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
print(f"{archive.name}: {len(files)} files, {archive.stat().st_size:,} bytes, verified")
print(f"SHA-256: {digest}")
