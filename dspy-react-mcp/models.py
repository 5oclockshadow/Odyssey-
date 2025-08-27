"""Data models for DSPy React MCP system."""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from enum import Enum
from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    """Status of a task."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentRoleType(str, Enum):
    """Type of role an agent can have."""
    BOSS = "boss"
    WORKER = "worker"
    SPECIALIST = "specialist"
    COORDINATOR = "coordinator"
    ANALYST = "analyst"
    EXECUTOR = "executor"
    RESEARCHER = "researcher"
    COMMUNICATOR = "communicator"


class AgentHumanRelationType(str, Enum):
    """Type of agent-human relationship."""
    PURE_AGENT = "pure_agent"  # Just an agent, no human involvement
    HUMAN_AGENT_PAIR = "human_agent_pair"  # Agent paired with human for collaboration
    HUMAN_PROXY_AGENT = "human_proxy_agent"  # Agent acting as human representative


class ThoughtType(str, Enum):
    """Type of thought in the thought graph."""
    OBSERVATION = "observation"
    REASONING = "reasoning"
    PLANNING = "planning"
    ACTION = "action"
    REFLECTION = "reflection"


class Thought(BaseModel):
    """Individual thought in the thought graph."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: ThoughtType
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    parent_id: Optional[str] = None
    children_ids: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ThoughtGraph(BaseModel):
    """Graph structure for agent thoughts and reasoning."""
    root_id: Optional[str] = None
    thoughts: Dict[str, Thought] = Field(default_factory=dict)
    current_thought_id: Optional[str] = None
    
    def add_thought(self, thought: Thought, parent_id: Optional[str] = None) -> str:
        """Add a thought to the graph."""
        if parent_id and parent_id in self.thoughts:
            thought.parent_id = parent_id
            self.thoughts[parent_id].children_ids.append(thought.id)
        elif not self.root_id:
            self.root_id = thought.id
        
        self.thoughts[thought.id] = thought
        self.current_thought_id = thought.id
        return thought.id
    
    def get_thought_chain(self, thought_id: Optional[str] = None) -> List[Thought]:
        """Get the chain of thoughts leading to a specific thought."""
        if not thought_id:
            thought_id = self.current_thought_id
        
        if not thought_id or thought_id not in self.thoughts:
            return []
        
        chain = []
        current = self.thoughts[thought_id]
        
        while current:
            chain.insert(0, current)
            if current.parent_id and current.parent_id in self.thoughts:
                current = self.thoughts[current.parent_id]
            else:
                break
        
        return chain


class Task(BaseModel):
    """Task model for agent work."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str
    status: TaskStatus = TaskStatus.PENDING
    assigned_agent_id: Optional[str] = None
    parent_task_id: Optional[str] = None
    subtasks: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class MCPTool(BaseModel):
    """MCP tool definition."""
    name: str
    description: str
    input_schema: Dict[str, Any]
    server_name: str
    enabled: bool = True


class MCPServerStatus(BaseModel):
    """Status of an MCP server."""
    name: str
    running: bool = False
    pid: Optional[int] = None
    last_heartbeat: Optional[datetime] = None
    tools: List[MCPTool] = Field(default_factory=list)
    error: Optional[str] = None


class AgentMemory(BaseModel):
    """Memory structure for agents."""
    short_term: List[Dict[str, Any]] = Field(default_factory=list)
    long_term: Dict[str, Any] = Field(default_factory=dict)
    episodic: List[Dict[str, Any]] = Field(default_factory=list)
    semantic: Dict[str, Any] = Field(default_factory=dict)
    
    def add_short_term(self, memory: Dict[str, Any], max_size: int = 100):
        """Add to short-term memory with size limit."""
        self.short_term.append({
            **memory,
            "timestamp": datetime.utcnow().isoformat()
        })
        if len(self.short_term) > max_size:
            self.short_term.pop(0)
    
    def add_episodic(self, episode: Dict[str, Any]):
        """Add episodic memory."""
        self.episodic.append({
            **episode,
            "timestamp": datetime.utcnow().isoformat()
        })
    
    def update_semantic(self, key: str, value: Any):
        """Update semantic memory."""
        self.semantic[key] = value


class Human(BaseModel):
    """Human user model."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: Optional[str] = None
    preferences: Dict[str, Any] = Field(default_factory=dict)
    skills: List[str] = Field(default_factory=list)
    availability_status: str = "available"  # available, busy, offline
    communication_style: str = "collaborative"  # collaborative, directive, hands_off
    expertise_areas: List[str] = Field(default_factory=list)
    last_interaction: Optional[datetime] = None
    interaction_history: List[Dict[str, Any]] = Field(default_factory=list)
    
    def add_interaction(self, interaction_type: str, content: Dict[str, Any]):
        """Add an interaction to history."""
        self.interaction_history.append({
            "type": interaction_type,
            "content": content,
            "timestamp": datetime.utcnow().isoformat()
        })
        self.last_interaction = datetime.utcnow()


class AgentHumanRelationship(BaseModel):
    """Base model for agent-human relationships."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relation_type: AgentHumanRelationType
    agent_id: str
    human_id: Optional[str] = None  # None for pure agents
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = "active"  # active, paused, terminated
    collaboration_rules: Dict[str, Any] = Field(default_factory=dict)
    communication_preferences: Dict[str, Any] = Field(default_factory=dict)
    
    def is_pure_agent(self) -> bool:
        """Check if this is a pure agent relationship."""
        return self.relation_type == AgentHumanRelationType.PURE_AGENT
    
    def is_human_paired(self) -> bool:
        """Check if this involves human pairing."""
        return self.relation_type == AgentHumanRelationType.HUMAN_AGENT_PAIR
    
    def is_human_proxy(self) -> bool:
        """Check if this is a human proxy agent."""
        return self.relation_type == AgentHumanRelationType.HUMAN_PROXY_AGENT
    
    def requires_human_approval(self, task_type: str = None) -> bool:
        """Check if human approval is required for certain actions."""
        if self.is_pure_agent():
            return False
        
        approval_rules = self.collaboration_rules.get("approval_required", [])
        if task_type:
            return task_type in approval_rules
        return len(approval_rules) > 0


class HumanAgentInteraction(BaseModel):
    """Model for human-agent interactions."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relationship_id: str
    interaction_type: str  # task_assignment, approval_request, status_update, question, etc.
    from_human: bool  # True if from human to agent, False if from agent to human
    content: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    status: str = "pending"  # pending, acknowledged, responded, completed
    response: Optional[Dict[str, Any]] = None
    response_timestamp: Optional[datetime] = None


class AgentState(BaseModel):
    """Current state of an agent."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: int
    role_type: AgentRoleType = AgentRoleType.WORKER
    relationship: AgentHumanRelationship
    active: bool = True
    current_task_id: Optional[str] = None
    busy: bool = False
    last_activity: datetime = Field(default_factory=datetime.utcnow)
    capabilities: List[str] = Field(default_factory=list)
    performance_metrics: Dict[str, float] = Field(default_factory=dict)
    
    def is_boss(self) -> bool:
        """Check if this agent is a boss."""
        return self.number == 0 or self.role_type == AgentRoleType.BOSS
    
    def requires_human_input(self) -> bool:
        """Check if agent requires human input for current state."""
        return (
            self.relationship.is_human_paired() and 
            self.busy and 
            self.relationship.requires_human_approval()
        )


class DelegationRequest(BaseModel):
    """Request for task delegation."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_agent_id: str
    task: Task
    required_capabilities: List[str] = Field(default_factory=list)
    priority: int = Field(default=5, ge=1, le=10)
    deadline: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AgentCommunication(BaseModel):
    """Communication between agents."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_agent_id: str
    to_agent_id: str
    message_type: str
    content: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    acknowledged: bool = False


class HumanAgentSystem(BaseModel):
    """System for managing humans and their agent relationships."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    humans: Dict[str, Human] = Field(default_factory=dict)
    relationships: Dict[str, AgentHumanRelationship] = Field(default_factory=dict)
    interactions: List[HumanAgentInteraction] = Field(default_factory=list)
    pending_approvals: List[str] = Field(default_factory=list)  # interaction IDs
    
    def add_human(self, human: Human) -> str:
        """Add a human to the system."""
        self.humans[human.id] = human
        return human.id
    
    def create_pure_agent_relationship(self, agent_id: str) -> AgentHumanRelationship:
        """Create a pure agent relationship (no human involvement)."""
        relationship = AgentHumanRelationship(
            relation_type=AgentHumanRelationType.PURE_AGENT,
            agent_id=agent_id,
            human_id=None
        )
        self.relationships[relationship.id] = relationship
        return relationship
    
    def create_human_agent_pair(
        self, 
        agent_id: str, 
        human_id: str,
        collaboration_rules: Dict[str, Any] = None
    ) -> AgentHumanRelationship:
        """Create a human-agent collaborative pair."""
        relationship = AgentHumanRelationship(
            relation_type=AgentHumanRelationType.HUMAN_AGENT_PAIR,
            agent_id=agent_id,
            human_id=human_id,
            collaboration_rules=collaboration_rules or {}
        )
        self.relationships[relationship.id] = relationship
        return relationship
    
    def create_human_proxy_agent(
        self, 
        agent_id: str, 
        human_id: str,
        proxy_rules: Dict[str, Any] = None
    ) -> AgentHumanRelationship:
        """Create an agent that acts as a human proxy."""
        relationship = AgentHumanRelationship(
            relation_type=AgentHumanRelationType.HUMAN_PROXY_AGENT,
            agent_id=agent_id,
            human_id=human_id,
            collaboration_rules=proxy_rules or {
                "act_as_human": True,
                "decision_authority": "full",
                "approval_required": []
            }
        )
        self.relationships[relationship.id] = relationship
        return relationship
    
    def get_human_agents(self, human_id: str) -> List[AgentHumanRelationship]:
        """Get all agent relationships for a human."""
        return [
            rel for rel in self.relationships.values() 
            if rel.human_id == human_id
        ]
    
    def get_agent_relationship(self, agent_id: str) -> Optional[AgentHumanRelationship]:
        """Get the relationship for an agent."""
        for rel in self.relationships.values():
            if rel.agent_id == agent_id:
                return rel
        return None
    
    def add_interaction(self, interaction: HumanAgentInteraction):
        """Add a human-agent interaction."""
        self.interactions.append(interaction)
        if interaction.status == "pending" and not interaction.from_human:
            self.pending_approvals.append(interaction.id)
    
    def get_pending_approvals_for_human(self, human_id: str) -> List[HumanAgentInteraction]:
        """Get pending approvals for a specific human."""
        pending = []
        for interaction in self.interactions:
            if (interaction.id in self.pending_approvals and 
                interaction.status == "pending"):
                # Find the relationship to check if it belongs to this human
                rel = self.relationships.get(interaction.relationship_id)
                if rel and rel.human_id == human_id:
                    pending.append(interaction)
        return pending


class SystemMetrics(BaseModel):
    """System-wide metrics."""
    total_agents: int = 0
    active_agents: int = 0
    pure_agents: int = 0
    human_paired_agents: int = 0
    human_proxy_agents: int = 0
    total_humans: int = 0
    active_humans: int = 0
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    pending_human_approvals: int = 0
    average_task_completion_time: float = 0.0
    system_load: float = 0.0
    memory_usage: float = 0.0
    uptime: float = 0.0
    last_updated: datetime = Field(default_factory=datetime.utcnow)


# Output Models for Agent Operations
class TaskOutput(BaseModel):
    """Output from task execution."""
    result: Any
    status: TaskStatus
    reasoning: Optional[str] = None
    actions_taken: List[str] = Field(default_factory=list)
    tools_used: List[str] = Field(default_factory=list)
    execution_time: Optional[float] = None
    error: Optional[str] = None


class ReasoningOutput(BaseModel):
    """Output from reasoning operations."""
    conclusion: str
    reasoning_steps: List[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    assumptions: List[str] = Field(default_factory=list)
    alternatives_considered: List[str] = Field(default_factory=list)


class ActionOutput(BaseModel):
    """Output from action execution."""
    action_type: str
    result: Any
    success: bool = True
    error_message: Optional[str] = None
    side_effects: List[str] = Field(default_factory=list)
    resources_used: List[str] = Field(default_factory=list)


class DelegationOutput(BaseModel):
    """Output from delegation operations."""
    delegated_to: str  # Agent ID
    task_id: str
    delegation_reason: str
    expected_completion: Optional[datetime] = None
    success: bool = True
    error_message: Optional[str] = None


# MCP Server Models
class MCPServerConfig(BaseModel):
    """Configuration for an MCP server."""
    name: str
    command: str
    args: List[str] = Field(default_factory=list)
    env: Dict[str, str] = Field(default_factory=dict)
    enabled: bool = True
    timeout: int = 30
    retry_count: int = 3
    heartbeat_interval: int = 60


class MCPTool(BaseModel):
    """Represents an MCP tool."""
    name: str
    description: str
    input_schema: Dict[str, Any] = Field(default_factory=dict)
    server_name: str
    enabled: bool = True


class MCPServerStatus(BaseModel):
    """Status of an MCP server."""
    name: str
    running: bool = False
    pid: Optional[int] = None
    last_heartbeat: Optional[datetime] = None
    tools: List[MCPTool] = Field(default_factory=list)
    error: Optional[str] = None
    restart_count: int = 0
    uptime: float = 0.0