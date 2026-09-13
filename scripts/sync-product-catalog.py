"""Import the MPR UI product directory from an explicit source directory."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "data/product-catalog.json": "data/product-catalog.json",
    "product-catalog.mjs": "js/core/productCatalog.js",
    "product-directory.css": "assets/css/product-directory.css",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    arguments = parser.parse_args()
    payloads = {source: (arguments.source / source).read_bytes() for source in FILES}
    receipt = {"sourceRepository": "https://github.com/MarcoPoloResearchLab/mpr-ui", "files": []}
    for source, destination in FILES.items():
        content = payloads[source]
        (ROOT / destination).write_bytes(content)
        receipt["files"].append({"source": source, "destination": destination, "sha256": hashlib.sha256(content).hexdigest()})
    (ROOT / "data/product-catalog-source.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
