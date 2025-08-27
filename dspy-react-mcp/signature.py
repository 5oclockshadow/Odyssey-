"""DSPy signatures for the React MCP system."""

import dspy
from typing import Any, Dict, Union, List, Optional
from pydantic import BaseModel, Field


class FlexibleInput(BaseModel):
    """Flexible input that can accept various data types and kwargs."""
    data: Union[str, Dict[str, Any], List[Any], int, float, bool]
    context: Optional[Dict[str, Any]] = Field(default_factory=dict)
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    
    def __init__(self, data: Any = None, **kwargs):
        """Initialize with data and any additional kwargs."""
        if data is None and kwargs:
            data = kwargs
        elif isinstance(data, dict) and kwargs:
            data.update(kwargs)
        
        # Extract context and metadata if present
        context = kwargs.pop('context', {})
        metadata = kwargs.pop('metadata', {})
        
        super().__init__(
            data=data,
            context=context,
            metadata=metadata
        )


class TaskOutput(BaseModel):
    """Task execution output."""
    result: Any
    success: bool = True
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ReasoningOutput(BaseModel):
    """Reasoning process output."""
    thoughts: List[str]
    conclusion: str
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    reasoning_chain: List[Dict[str, Any]] = Field(default_factory=list)


class ActionOutput(BaseModel):
    """Action execution output."""
    action: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    result: Any = None
    success: bool = True
    error: Optional[str] = None


class DelegationOutput(BaseModel):
    """Task delegation output."""
    delegated_to: str
    task_id: str
    expected_completion: Optional[str] = None
    delegation_reason: str


class AnalysisOutput(BaseModel):
    """Analysis output."""
    analysis: str
    insights: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class UnifiedOutput(BaseModel):
    """Unified output that can represent different types of results."""
    output_type: str
    content: Union[
        TaskOutput,
        ReasoningOutput, 
        ActionOutput,
        DelegationOutput,
        AnalysisOutput,
        str,
        Dict[str, Any],
        List[Any]
    ]
    timestamp: Optional[str] = None
    agent_id: Optional[str] = None
    
    @classmethod
    def from_task_output(cls, output: TaskOutput, agent_id: str = None) -> "UnifiedOutput":
        """Create from task output."""
        return cls(
            output_type="task",
            content=output,
            agent_id=agent_id
        )
    
    @classmethod
    def from_reasoning_output(cls, output: ReasoningOutput, agent_id: str = None) -> "UnifiedOutput":
        """Create from reasoning output."""
        return cls(
            output_type="reasoning",
            content=output,
            agent_id=agent_id
        )
    
    @classmethod
    def from_action_output(cls, output: ActionOutput, agent_id: str = None) -> "UnifiedOutput":
        """Create from action output."""
        return cls(
            output_type="action",
            content=output,
            agent_id=agent_id
        )
    
    @classmethod
    def from_delegation_output(cls, output: DelegationOutput, agent_id: str = None) -> "UnifiedOutput":
        """Create from delegation output."""
        return cls(
            output_type="delegation",
            content=output,
            agent_id=agent_id
        )
    
    @classmethod
    def from_analysis_output(cls, output: AnalysisOutput, agent_id: str = None) -> "UnifiedOutput":
        """Create from analysis output."""
        return cls(
            output_type="analysis",
            content=output,
            agent_id=agent_id
        )
    
    @classmethod
    def from_simple(cls, content: Union[str, Dict, List], output_type: str = "simple", agent_id: str = None) -> "UnifiedOutput":
        """Create from simple content."""
        return cls(
            output_type=output_type,
            content=content,
            agent_id=agent_id
        )


class ReactSignature(dspy.Signature):
    """Main React signature for the DSPy system."""
    input: FlexibleInput = dspy.InputField(
        desc="Flexible input that can accept various data types and runtime kwargs"
    )
    output: UnifiedOutput = dspy.OutputField(
        desc="Unified output that can represent different types of results including tasks, reasoning, actions, delegations, and analysis"
    )


class TaskExecutionSignature(dspy.Signature):
    """Signature for task execution."""
    task_description: str = dspy.InputField(desc="Description of the task to execute")
    context: Dict[str, Any] = dspy.InputField(desc="Context information for task execution")
    available_tools: List[str] = dspy.InputField(desc="List of available tools/capabilities")
    
    result: TaskOutput = dspy.OutputField(desc="Task execution result")


class ReasoningSignature(dspy.Signature):
    """Signature for reasoning processes."""
    problem: str = dspy.InputField(desc="Problem or question to reason about")
    context: Dict[str, Any] = dspy.InputField(desc="Relevant context information")
    constraints: List[str] = dspy.InputField(desc="Constraints or limitations to consider")
    
    reasoning: ReasoningOutput = dspy.OutputField(desc="Reasoning process and conclusion")


class ActionPlanningSignature(dspy.Signature):
    """Signature for action planning."""
    goal: str = dspy.InputField(desc="Goal to achieve")
    current_state: Dict[str, Any] = dspy.InputField(desc="Current state of the system")
    available_actions: List[str] = dspy.InputField(desc="Available actions to choose from")
    
    action_plan: ActionOutput = dspy.OutputField(desc="Planned action with parameters")


class DelegationSignature(dspy.Signature):
    """Signature for task delegation."""
    task: str = dspy.InputField(desc="Task to potentially delegate")
    agent_capabilities: Dict[str, List[str]] = dspy.InputField(desc="Capabilities of available agents")
    workload: Dict[str, float] = dspy.InputField(desc="Current workload of agents")
    
    delegation_decision: DelegationOutput = dspy.OutputField(desc="Delegation decision and details")


class AnalysisSignature(dspy.Signature):
    """Signature for data analysis."""
    data: Union[str, Dict, List] = dspy.InputField(desc="Data to analyze")
    analysis_type: str = dspy.InputField(desc="Type of analysis to perform")
    parameters: Dict[str, Any] = dspy.InputField(desc="Analysis parameters")
    
    analysis_result: AnalysisOutput = dspy.OutputField(desc="Analysis results and insights")


class CommunicationSignature(dspy.Signature):
    """Signature for inter-agent communication."""
    message: str = dspy.InputField(desc="Message to communicate")
    recipient_context: Dict[str, Any] = dspy.InputField(desc="Context about the recipient")
    communication_goal: str = dspy.InputField(desc="Goal of the communication")
    
    formatted_message: str = dspy.OutputField(desc="Formatted message for the recipient")
    communication_strategy: str = dspy.OutputField(desc="Strategy for effective communication")


class ErrorHandlingSignature(dspy.Signature):
    """Signature for error handling and recovery."""
    error: str = dspy.InputField(desc="Error that occurred")
    context: Dict[str, Any] = dspy.InputField(desc="Context when error occurred")
    previous_attempts: List[str] = dspy.InputField(desc="Previous recovery attempts")
    
    recovery_plan: str = dspy.OutputField(desc="Plan to recover from the error")
    alternative_approach: str = dspy.OutputField(desc="Alternative approach if recovery fails")


class MetaReasoningSignature(dspy.Signature):
    """Signature for meta-reasoning about the reasoning process."""
    reasoning_history: List[Dict[str, Any]] = dspy.InputField(desc="History of reasoning steps")
    current_problem: str = dspy.InputField(desc="Current problem being solved")
    performance_metrics: Dict[str, float] = dspy.InputField(desc="Performance metrics")
    
    reasoning_quality: float = dspy.OutputField(desc="Quality assessment of reasoning")
    improvement_suggestions: List[str] = dspy.OutputField(desc="Suggestions for improvement")
    next_reasoning_strategy: str = dspy.OutputField(desc="Recommended strategy for next reasoning step")