"""The one Signature. Depth two: nine fields, free text first, flat lists of typed records, ids for every edge."""
from pydantic import BaseModel, Field
import dspy


class TypeDef(BaseModel):
    name: str
    definition: str = Field(description="one sentence: what makes a thing this type and not its nearest neighbour")
    nearest: str | None = Field(None, description="existing type it was nearly merged with; null if none")


class Node(BaseModel):
    id: str = Field(description="stable slug; reuse an existing id when it is the same thing")
    type: str = Field(description="a seeded type or one defined in `definitions` this round")
    label: str


class Hyperedge(BaseModel):
    id: str
    relation: str = Field(description="mint only if no existing relation fits, then define it in `definitions`")
    members: list[str] = Field(min_length=2, description="node ids, any arity")
    inferred: bool = Field(False, description="true when derived rather than observed")


class EnergyReport(BaseModel):
    delta: float = Field(description="change in consistency energy this round; negative means the graph got more consistent")
    violations: list[str] = Field(default_factory=list, description="constraint ids violated, if any")


class Round(BaseModel):
    reasoning: str                     # free text first: the answer may use it, nothing above may
    evidence: list[str]                # rank 0 input: what was observed in the intake
    definitions: list[TypeDef]         # ontology delta: types and relations minted this round
    nodes: list[Node]                  # rank 0
    hyperedges: list[Hyperedge]        # rank 1
    closure: list[Hyperedge]           # rank 2: inferred, flagged
    actors: list[Node]                 # the actor layer: people, agents, roles
    answer: str                        # what the operator or the record sees
    energy: EnergyReport


class Act(dspy.Signature):
    """Replaced at import by institute.yaml → mission (see round.py)."""
    intake: str = dspy.InputField(desc="the graph slice, then the kind of round, then the input")
    out: Round = dspy.OutputField()
