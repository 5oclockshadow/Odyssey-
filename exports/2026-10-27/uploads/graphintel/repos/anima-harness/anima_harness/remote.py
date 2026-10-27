"""A model rung over any OpenAI-compatible server (vLLM, llama.cpp, the small/fast container). Uses the network; the
tests never import it. Under Q it is shown the facts within two hops of the subject and the rules."""
import json
import urllib.request

ASK = "Answer with one word, yes or no. Is {rel}({x}, {y}) true?"


class OpenAICompatible:
    def __init__(self, name: str, base_url: str, model: str, api_key: str = "", timeout: float = 60.0):
        self.name, self.base, self.model, self.key, self.timeout = name, base_url.rstrip("/"), model, api_key, timeout

    def shown(self, q, ctx) -> str:
        if ctx.condition == "0":
            return ""
        if ctx.text is not None:
            return "Facts and rules, one JSON array per line. A rule [rule, a, b, c] means a(x, y) and b(y, z) give c(x, z).\n" + ctx.text
        near = ctx.lookup(q["x"])
        near += [f for _, _, y in list(near) for f in ctx.lookup(y)]
        rules = [" ".join(r) for r in ctx.rules]
        return "Facts:\n" + "\n".join(" ".join(f) for f in near) + ("\nRules, a b c meaning a(x, y) and b(y, z) give c(x, z):\n" + "\n".join(rules) if rules else "")

    def answer(self, q, ctx):
        body = {"model": self.model, "temperature": 0, "max_tokens": 3,
                "messages": [{"role": "system", "content": self.shown(q, ctx)}, {"role": "user", "content": ASK.format(**q)}]}
        head = {"content-type": "application/json"}
        if self.key:
            head["authorization"] = "Bearer " + self.key
        req = urllib.request.Request(self.base + "/v1/chat/completions", data=json.dumps(body).encode(), headers=head)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            text = json.loads(r.read())["choices"][0]["message"]["content"].strip().lower()
        return True if text.startswith("yes") else False if text.startswith("no") else text
