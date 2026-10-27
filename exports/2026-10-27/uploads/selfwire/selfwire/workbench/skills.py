"""
skills.py — markdown skill files the agent reads into its context and can
create, edit, and delete itself.

Layout: `skills/<name>/SKILL.md`, with a frontmatter block:

    ---
    name: self-improve
    description: one line saying when to use it
    ---
    body...

All file access goes through the Workspace, so skills get the same path
safety, protected-path rules, and live `file` events as any other edit.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Optional

from pydantic import BaseModel

if TYPE_CHECKING:
    from .workspace import Workspace

_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


class SkillError(ValueError):
    pass


class Skill(BaseModel):
    name: str
    description: str
    path: str
    content: Optional[str] = None


def parse_frontmatter(content: str) -> dict[str, str]:
    if not content.startswith("---"):
        return {}
    end = content.find("\n---", 3)
    if end == -1:
        return {}
    meta: dict[str, str] = {}
    for line in content[3:end].splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip().strip('"').strip("'")
    return meta


class SkillStore:
    def __init__(self, workspace: "Workspace", dirname: str = "skills") -> None:
        self.workspace = workspace
        self.dirname = dirname.strip("/")

    def _path(self, name: str) -> str:
        if not _NAME_RE.match(name or ""):
            raise SkillError(f"invalid skill name {name!r}: use lowercase letters, digits, '-' or '_'")
        return f"{self.dirname}/{name}/SKILL.md"

    def list(self) -> list[Skill]:
        prefix = self.dirname + "/"
        skills: list[Skill] = []
        for info in self.workspace.list_files():
            parts = info.path.split("/")
            if not info.path.startswith(prefix) or len(parts) != 3 or parts[2] != "SKILL.md":
                continue
            try:
                meta = parse_frontmatter(self.workspace.read(info.path))
            except (OSError, ValueError):
                meta = {}
            skills.append(Skill(name=parts[1], description=meta.get("description", ""), path=info.path))
        return sorted(skills, key=lambda s: s.name)

    def get(self, name: str) -> Skill:
        path = self._path(name)
        content = self.workspace.read(path)  # FileNotFoundError when missing
        meta = parse_frontmatter(content)
        return Skill(name=name, description=meta.get("description", ""), path=path, content=content)

    def put(self, name: str, content: str) -> Skill:
        path = self._path(name)
        if not content.strip():
            raise SkillError("skill content is empty")
        if not parse_frontmatter(content):
            content = f"---\nname: {name}\ndescription: \n---\n\n{content.lstrip()}"
        self.workspace.write(path, content)
        return self.get(name)

    def delete(self, name: str) -> str:
        return self.workspace.delete(self._path(name))

    def context_block(self, max_chars: int = 3000) -> str:
        skills = self.list()
        if not skills:
            return "SKILLS: (none)"
        lines = ["SKILLS (read one with read_skill(name) before doing that kind of work):"]
        for s in skills:
            lines.append(f"  - {s.name}: {s.description or '(no description)'}")
        return "\n".join(lines)[:max_chars]
