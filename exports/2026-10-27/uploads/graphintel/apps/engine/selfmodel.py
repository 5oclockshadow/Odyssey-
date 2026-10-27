"""The agent's static picture of its own source: every file, class and function in apps/engine as a node, tied to its file.
Runtime signatures (observe.signed) add the live side; together the graph knows what exists and what ran. Read-only."""
import ast
from pathlib import Path


def scan(root: Path) -> tuple[list, list]:
    nodes, edges = [], []
    for p in sorted(Path(root).glob("*.py")):
        fid = f"file:{p.name}"
        nodes.append({"id": fid, "type": "file", "label": p.name, "path": str(p), "tel": True})
        for n in ast.parse(p.read_text()).body:
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                cid = f"code:{p.stem}.{n.name}"
                nodes.append({"id": cid, "type": "code", "label": f"{p.stem}.{n.name}", "file": str(p), "line": n.lineno,
                              "doc": (ast.get_docstring(n) or "")[:160], "tel": True})
                edges.append({"id": f"{cid}>file", "relation": "defined_in", "members": [cid, fid]})
    return nodes, edges


def load(graph, root: Path) -> int:
    nodes, edges = scan(root)
    graph.observe(nodes, edges, w=0.7)
    return len(nodes)
