"""
settings.py — which language model the workbench's agent and improvement
loop use. The API key is held in process memory only: never written to disk,
never returned by the API (only `has_key`).

Environment defaults: SELFWIRE_LM_MODEL, SELFWIRE_LM_API_KEY,
SELFWIRE_LM_API_BASE, SELFWIRE_MAX_ITERS, SELFWIRE_ALLOW_UNSAFE_LEVERS.

`allow_unsafe_levers` (default off) re-enables the agent's `write_tool`
(python exec inside the server) and `add_mcp_server` (launch any command)
actions in the workbench. Off by default because code running inside the
server can rewrite the gate itself; with it on, the moat no longer holds. Provider keys litellm already reads
on its own (ANTHROPIC_API_KEY, OPENAI_API_KEY, ...) count as "has a key".
"""

from __future__ import annotations

import os
import threading
from typing import Any, Optional

import dspy

PROVIDER_ENV_KEYS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "groq": "GROQ_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "together_ai": "TOGETHERAI_API_KEY",
}
_UNSET: Any = object()


class LMNotConfigured(RuntimeError):
    pass


class WorkbenchSettings:
    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        api_base: Optional[str] = None,
        max_iters: int = 8,
        lm_override: Optional[dspy.LM] = None,
        allow_unsafe_levers: bool = False,
    ) -> None:
        self._lock = threading.Lock()
        self.model = model or None
        self._api_key = api_key or None
        self.api_base = api_base or None
        self.max_iters = max_iters
        self.lm_override = lm_override
        self.allow_unsafe_levers = allow_unsafe_levers
        self._cached: Optional[tuple[tuple, dspy.LM]] = None

    @classmethod
    def from_env(cls, lm_override: Optional[dspy.LM] = None) -> "WorkbenchSettings":
        try:
            max_iters = int(os.environ.get("SELFWIRE_MAX_ITERS", "8"))
        except ValueError:
            max_iters = 8
        return cls(
            model=os.environ.get("SELFWIRE_LM_MODEL"),
            api_key=os.environ.get("SELFWIRE_LM_API_KEY"),
            api_base=os.environ.get("SELFWIRE_LM_API_BASE"),
            max_iters=max_iters,
            lm_override=lm_override,
            allow_unsafe_levers=os.environ.get("SELFWIRE_ALLOW_UNSAFE_LEVERS", "").lower() in ("1", "true", "yes"),
        )

    def update(self, *, model: Any = _UNSET, api_key: Any = _UNSET, api_base: Any = _UNSET, max_iters: Any = _UNSET,
               allow_unsafe_levers: Any = _UNSET) -> dict:
        with self._lock:
            if model is not _UNSET:
                self.model = (model or "").strip() or None
            if api_key is not _UNSET:
                self._api_key = (api_key or "").strip() or None
            if api_base is not _UNSET:
                self.api_base = (api_base or "").strip() or None
            if max_iters is not _UNSET and max_iters is not None:
                value = int(max_iters)
                if not 1 <= value <= 50:
                    raise ValueError("max_iters must be between 1 and 50")
                self.max_iters = value
            if allow_unsafe_levers is not _UNSET and allow_unsafe_levers is not None:
                self.allow_unsafe_levers = bool(allow_unsafe_levers)
            self._cached = None
        return self.public()

    def configured(self) -> bool:
        return self.lm_override is not None or bool(self.model)

    def has_key(self) -> bool:
        if self._api_key:
            return True
        provider = (self.model or "").split("/", 1)[0]
        env_name = PROVIDER_ENV_KEYS.get(provider)
        return bool(env_name and os.environ.get(env_name))

    def build_lm(self) -> dspy.LM:
        if self.lm_override is not None:
            return self.lm_override
        with self._lock:
            if not self.model:
                raise LMNotConfigured("no language model configured: set one in Settings or with `/model <litellm-id>`")
            key = (self.model, self._api_key, self.api_base)
            if self._cached is not None and self._cached[0] == key:
                return self._cached[1]
            kwargs: dict[str, Any] = {}
            if self._api_key:
                kwargs["api_key"] = self._api_key
            if self.api_base:
                kwargs["api_base"] = self.api_base
            lm = dspy.LM(self.model, **kwargs)
            self._cached = (key, lm)
            return lm

    def public(self) -> dict:
        return {
            "model": self.model if self.lm_override is None else (self.model or "test-override"),
            "has_key": self.has_key() or self.lm_override is not None,
            "api_base": self.api_base,
            "max_iters": self.max_iters,
            "allow_unsafe_levers": self.allow_unsafe_levers,
        }
