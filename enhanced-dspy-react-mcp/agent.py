"""Agent implementation with hierarchical delegation and thought graph."""

import asyncio
import uuid
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from contextlib import asynccontextmanager

import dspy
from models import (
    AgentState, AgentRoleType, AgentHumanRelationType, AgentHumanRelationship,
    Human, HumanAgentSystem, HumanAgentInteraction, Task, TaskStatus, 
    ThoughtGraph, Thought, ThoughtType, AgentMemory, DelegationRequest, 
    AgentCommunication, TaskOutput, ReasoningOutput, ActionOutput, DelegationOutput
)
from signature import (
    ReactSignature, TaskExecutionSignature, ReasoningSignature,
    ActionPlanningSignature, DelegationSignature, FlexibleInput, UnifiedOutput
)
from mcpservermanager import MCPServerManager
from config import config


logger = logging.getLogger(__name__)


class Agent:
    """Intelligent agent with hierarchical delegation and thought graph reasoning."""
    
    def __init__(
        self,
        number: int,
        role_type: AgentRoleType = AgentRoleType.WORKER,
        relationship: AgentHumanRelationship = None,
        model_name: str = None,
        capabilities: List[str] = None,
        max_sub_agents: int = 5,
        human_agent_system: HumanAgentSystem = None
    ):
        """Initialize the agent."""
        self.id = str(uuid.uuid4())
        self.number = number
        self.role_type = role_type if number != 0 else AgentRoleType.BOSS
        self.model_name = model_name or config.agent.default_model
        self.max_sub_agents = max_sub_agents
        
        # Human-Agent relationship system
        self.human_agent_system = human_agent_system or HumanAgentSystem()
        
        # Create or use provided relationship
        if relationship is None:
            relationship = self.human_agent_system.create_pure_agent_relationship(self.id)
        else:
            relationship.agent_id = self.id
            self.human_agent_system.relationships[relationship.id] = relationship
        
        # Agent state
        self.state = AgentState(
            id=self.id,
            number=number,
            role_type=self.role_type,
            relationship=relationship,
            capabilities=capabilities or []
        )
        
        # Agent hierarchy
        self.agents: List['Agent'] = []  # Sub-agents
        self.parent_agent: Optional['Agent'] = None
        
        # Memory and reasoning
        self.memory = AgentMemory()
        self.thought_graph = ThoughtGraph()
        
        # Task management
        self.current_tasks: Dict[str, Task] = {}
        self.completed_tasks: List[Task] = []
        self.task_queue: List[Task] = []
        
        # Communication
        self.message_queue: List[AgentCommunication] = []
        
        # DSPy modules
        self._setup_dspy_modules()
        
        # MCP Server Manager (shared across agents)
        self.mcp_manager: Optional[MCPServerManager] = None
        
        logger.info(f"Initialized Agent {self.number} ({self.role_type}) with ID {self.id} - Relationship: {relationship.relation_type}")
    
    def _setup_dspy_modules(self):
        """Setup DSPy modules for different agent capabilities."""
        # Configure DSPy with the specified model
        if self.model_name in config.models:
            model_config = config.models[self.model_name]
            if model_config.provider == "openai":
                lm = dspy.OpenAI(
                    model=model_config.name,
                    api_key=model_config.api_key,
                    max_tokens=model_config.max_tokens,
                    temperature=model_config.temperature
                )
            elif model_config.provider == "anthropic":
                # Note: This would need proper Anthropic integration
                lm = dspy.OpenAI(  # Fallback for now
                    model="gpt-3.5-turbo",
                    api_key=config.models["gpt-3.5-turbo"].api_key if "gpt-3.5-turbo" in config.models else None
                )
            else:
                lm = dspy.OpenAI(model="gpt-3.5-turbo")
            
            dspy.settings.configure(lm=lm)
        
        # Initialize DSPy modules
        self.react_module = dspy.ChainOfThought(ReactSignature)
        self.task_executor = dspy.ChainOfThought(TaskExecutionSignature)
        self.reasoner = dspy.ChainOfThought(ReasoningSignature)
        self.action_planner = dspy.ChainOfThought(ActionPlanningSignature)
        self.delegator = dspy.ChainOfThought(DelegationSignature)
    
    async def start(self, mcp_manager: MCPServerManager = None):
        """Start the agent."""
        self.mcp_manager = mcp_manager
        self.state.active = True
        self.state.last_activity = datetime.utcnow()
        
        # Start processing loop
        asyncio.create_task(self._processing_loop())
        
        logger.info(f"Agent {self.number} started")
    
    async def stop(self):
        """Stop the agent and all sub-agents."""
        self.state.active = False
        
        # Stop all sub-agents
        for agent in self.agents:
            await agent.stop()
        
        logger.info(f"Agent {self.number} stopped")
    
    async def hire_sub_agent(
        self,
        role_type: AgentRoleType = AgentRoleType.WORKER,
        capabilities: List[str] = None,
        relationship_type: AgentHumanRelationType = AgentHumanRelationType.PURE_AGENT,
        human_id: str = None,
        collaboration_rules: Dict[str, Any] = None
    ) -> Optional['Agent']:
        """Hire a sub-agent."""
        if len(self.agents) >= self.max_sub_agents:
            logger.warning(f"Agent {self.number} cannot hire more sub-agents (max: {self.max_sub_agents})")
            return None
        
        # Generate next agent number
        next_number = max([agent.number for agent in self.agents] + [self.number]) + 1
        
        # Create relationship for sub-agent
        if relationship_type == AgentHumanRelationType.PURE_AGENT:
            relationship = None  # Will be created automatically
        elif relationship_type == AgentHumanRelationType.HUMAN_AGENT_PAIR:
            if not human_id:
                logger.error("Human ID required for human-agent pair")
                return None
            relationship = self.human_agent_system.create_human_agent_pair(
                agent_id="",  # Will be set in Agent.__init__
                human_id=human_id,
                collaboration_rules=collaboration_rules
            )
        elif relationship_type == AgentHumanRelationType.HUMAN_PROXY_AGENT:
            if not human_id:
                logger.error("Human ID required for human proxy agent")
                return None
            relationship = self.human_agent_system.create_human_proxy_agent(
                agent_id="",  # Will be set in Agent.__init__
                human_id=human_id,
                proxy_rules=collaboration_rules
            )
        else:
            relationship = None
        
        # Create sub-agent
        sub_agent = Agent(
            number=next_number,
            role_type=role_type,
            relationship=relationship,
            capabilities=capabilities,
            max_sub_agents=self.max_sub_agents,
            human_agent_system=self.human_agent_system
        )
        sub_agent.parent_agent = self
        
        # Add to agents list
        self.agents.append(sub_agent)
        
        # Start the sub-agent
        await sub_agent.start(self.mcp_manager)
        
        # Record in memory
        self.memory.add_episodic({
            "action": "hired_sub_agent",
            "agent_id": sub_agent.id,
            "agent_number": sub_agent.number,
            "role_type": sub_agent.role_type,
            "relationship_type": sub_agent.state.relationship.relation_type,
            "capabilities": capabilities or []
        })
        
        logger.info(f"Agent {self.number} hired sub-agent {sub_agent.number} ({sub_agent.state.relationship.relation_type})")
        return sub_agent
    
    async def fire_sub_agent(self, agent_id: str) -> bool:
        """Fire a sub-agent."""
        for i, agent in enumerate(self.agents):
            if agent.id == agent_id:
                await agent.stop()
                del self.agents[i]
                
                # Record in memory
                self.memory.add_episodic({
                    "action": "fired_sub_agent",
                    "agent_id": agent_id,
                    "agent_number": agent.number
                })
                
                logger.info(f"Agent {self.number} fired sub-agent {agent.number}")
                return True
        
        return False
    
    async def delegate_task(self, task: Task, required_capabilities: List[str] = None) -> Optional[str]:
        """Delegate a task to a sub-agent."""
        if not self.agents:
            return None
        
        # Find best agent for the task
        best_agent = None
        best_score = -1
        
        for agent in self.agents:
            if not agent.state.active or agent.state.busy:
                continue
            
            # Calculate capability match score
            score = 0
            if required_capabilities:
                matching_caps = set(agent.state.capabilities) & set(required_capabilities)
                score = len(matching_caps) / len(required_capabilities)
            else:
                score = 0.5  # Default score
            
            # Consider workload
            workload_penalty = len(agent.current_tasks) * 0.1
            score -= workload_penalty
            
            if score > best_score:
                best_score = score
                best_agent = agent
        
        if best_agent:
            # Create delegation request
            delegation_request = DelegationRequest(
                from_agent_id=self.id,
                task=task,
                required_capabilities=required_capabilities or []
            )
            
            # Send task to sub-agent
            await best_agent.receive_task(task)
            
            # Record delegation
            self.memory.add_episodic({
                "action": "delegated_task",
                "task_id": task.id,
                "to_agent_id": best_agent.id,
                "to_agent_number": best_agent.number
            })
            
            logger.info(f"Agent {self.number} delegated task {task.id} to agent {best_agent.number}")
            return best_agent.id
        
        return None
    
    async def receive_task(self, task: Task):
        """Receive a task from parent or external source."""
        task.assigned_agent_id = self.id
        task.status = TaskStatus.PENDING
        task.updated_at = datetime.utcnow()
        
        self.task_queue.append(task)
        
        logger.info(f"Agent {self.number} received task: {task.description}")
    
    async def execute_task(self, task: Task) -> TaskOutput:
        """Execute a task using DSPy reasoning."""
        try:
            self.state.busy = True
            self.state.current_task_id = task.id
            task.status = TaskStatus.IN_PROGRESS
            task.updated_at = datetime.utcnow()
            
            # Add task to current tasks
            self.current_tasks[task.id] = task
            
            # Add initial thought
            initial_thought = Thought(
                type=ThoughtType.OBSERVATION,
                content=f"Starting task: {task.description}"
            )
            self.thought_graph.add_thought(initial_thought)
            
            # Get available tools
            available_tools = []
            if self.mcp_manager:
                tools = await self.mcp_manager.get_available_tools()
                available_tools = [tool.name for tool in tools]
            
            # Execute task using DSPy
            result = self.task_executor(
                task_description=task.description,
                context=task.metadata,
                available_tools=available_tools
            )
            
            # Create task output
            task_output = TaskOutput(
                result=result.result if hasattr(result, 'result') else str(result),
                success=True,
                metadata={
                    "agent_id": self.id,
                    "agent_number": self.number,
                    "execution_time": datetime.utcnow().isoformat()
                }
            )
            
            # Update task
            task.status = TaskStatus.COMPLETED
            task.result = task_output.result
            task.completed_at = datetime.utcnow()
            task.updated_at = datetime.utcnow()
            
            # Move to completed tasks
            del self.current_tasks[task.id]
            self.completed_tasks.append(task)
            
            # Add completion thought
            completion_thought = Thought(
                type=ThoughtType.ACTION,
                content=f"Completed task: {task.description}",
                parent_id=initial_thought.id
            )
            self.thought_graph.add_thought(completion_thought, initial_thought.id)
            
            # Update memory
            self.memory.add_episodic({
                "action": "completed_task",
                "task_id": task.id,
                "result": task_output.result,
                "success": True
            })
            
            logger.info(f"Agent {self.number} completed task {task.id}")
            return task_output
            
        except Exception as e:
            # Handle task failure
            task.status = TaskStatus.FAILED
            task.error = str(e)
            task.updated_at = datetime.utcnow()
            
            task_output = TaskOutput(
                result=None,
                success=False,
                error=str(e),
                metadata={
                    "agent_id": self.id,
                    "agent_number": self.number,
                    "execution_time": datetime.utcnow().isoformat()
                }
            )
            
            # Move to completed tasks
            if task.id in self.current_tasks:
                del self.current_tasks[task.id]
            self.completed_tasks.append(task)
            
            # Add failure thought
            failure_thought = Thought(
                type=ThoughtType.REFLECTION,
                content=f"Failed to complete task: {task.description}. Error: {str(e)}"
            )
            self.thought_graph.add_thought(failure_thought)
            
            # Update memory
            self.memory.add_episodic({
                "action": "failed_task",
                "task_id": task.id,
                "error": str(e),
                "success": False
            })
            
            logger.error(f"Agent {self.number} failed task {task.id}: {e}")
            return task_output
            
        finally:
            self.state.busy = False
            self.state.current_task_id = None
            self.state.last_activity = datetime.utcnow()
    
    async def reason_about(self, problem: str, context: Dict[str, Any] = None) -> ReasoningOutput:
        """Use DSPy to reason about a problem."""
        reasoning_thought = Thought(
            type=ThoughtType.REASONING,
            content=f"Reasoning about: {problem}"
        )
        self.thought_graph.add_thought(reasoning_thought)
        
        try:
            result = self.reasoner(
                problem=problem,
                context=context or {},
                constraints=[]
            )
            
            reasoning_output = ReasoningOutput(
                thoughts=[reasoning_thought.content],
                conclusion=result.reasoning.conclusion if hasattr(result, 'reasoning') else str(result),
                confidence=0.8,
                reasoning_chain=[{
                    "step": "reasoning",
                    "content": str(result),
                    "timestamp": datetime.utcnow().isoformat()
                }]
            )
            
            # Add conclusion thought
            conclusion_thought = Thought(
                type=ThoughtType.REASONING,
                content=f"Conclusion: {reasoning_output.conclusion}",
                parent_id=reasoning_thought.id
            )
            self.thought_graph.add_thought(conclusion_thought, reasoning_thought.id)
            
            return reasoning_output
            
        except Exception as e:
            logger.error(f"Agent {self.number} reasoning failed: {e}")
            return ReasoningOutput(
                thoughts=[reasoning_thought.content],
                conclusion=f"Reasoning failed: {str(e)}",
                confidence=0.0
            )
    
    async def plan_action(self, goal: str, current_state: Dict[str, Any] = None) -> ActionOutput:
        """Plan an action to achieve a goal."""
        planning_thought = Thought(
            type=ThoughtType.PLANNING,
            content=f"Planning action for goal: {goal}"
        )
        self.thought_graph.add_thought(planning_thought)
        
        try:
            # Get available actions (tools)
            available_actions = []
            if self.mcp_manager:
                tools = await self.mcp_manager.get_available_tools()
                available_actions = [tool.name for tool in tools]
            
            result = self.action_planner(
                goal=goal,
                current_state=current_state or {},
                available_actions=available_actions
            )
            
            action_output = ActionOutput(
                action=result.action_plan.action if hasattr(result, 'action_plan') else "unknown",
                parameters=result.action_plan.parameters if hasattr(result, 'action_plan') else {},
                success=True
            )
            
            # Add action thought
            action_thought = Thought(
                type=ThoughtType.ACTION,
                content=f"Planned action: {action_output.action}",
                parent_id=planning_thought.id
            )
            self.thought_graph.add_thought(action_thought, planning_thought.id)
            
            return action_output
            
        except Exception as e:
            logger.error(f"Agent {self.number} action planning failed: {e}")
            return ActionOutput(
                action="error",
                success=False,
                error=str(e)
            )
    
    async def request_human_approval(self, request_type: str, content: Dict[str, Any]) -> Optional[str]:
        """Request approval from paired human."""
        if self.state.relationship.is_pure_agent():
            logger.warning(f"Agent {self.number} is pure agent, cannot request human approval")
            return None
        
        if not self.state.relationship.human_id:
            logger.error(f"Agent {self.number} has no associated human")
            return None
        
        # Create interaction
        interaction = HumanAgentInteraction(
            relationship_id=self.state.relationship.id,
            interaction_type=request_type,
            from_human=False,
            content=content,
            status="pending"
        )
        
        # Add to system
        self.human_agent_system.add_interaction(interaction)
        
        # Add to memory
        self.memory.add_short_term({
            "type": "human_approval_requested",
            "interaction_id": interaction.id,
            "request_type": request_type,
            "content": content
        })
        
        logger.info(f"Agent {self.number} requested human approval: {request_type}")
        return interaction.id
    
    async def notify_human(self, notification_type: str, content: Dict[str, Any]) -> Optional[str]:
        """Send notification to paired human."""
        if self.state.relationship.is_pure_agent():
            return None
        
        if not self.state.relationship.human_id:
            return None
        
        # Create interaction
        interaction = HumanAgentInteraction(
            relationship_id=self.state.relationship.id,
            interaction_type=notification_type,
            from_human=False,
            content=content,
            status="sent"
        )
        
        # Add to system
        self.human_agent_system.add_interaction(interaction)
        
        logger.info(f"Agent {self.number} sent notification to human: {notification_type}")
        return interaction.id
    
    async def receive_human_response(self, interaction_id: str, response: Dict[str, Any]) -> bool:
        """Receive response from human."""
        # Find the interaction
        for interaction in self.human_agent_system.interactions:
            if interaction.id == interaction_id:
                interaction.response = response
                interaction.response_timestamp = datetime.utcnow()
                interaction.status = "responded"
                
                # Remove from pending approvals if applicable
                if interaction_id in self.human_agent_system.pending_approvals:
                    self.human_agent_system.pending_approvals.remove(interaction_id)
                
                # Add to memory
                self.memory.add_short_term({
                    "type": "human_response_received",
                    "interaction_id": interaction_id,
                    "response": response
                })
                
                logger.info(f"Agent {self.number} received human response for interaction {interaction_id}")
                return True
        
        return False
    
    def get_human_context(self) -> Optional[Dict[str, Any]]:
        """Get context about paired human."""
        if self.state.relationship.is_pure_agent():
            return None
        
        human_id = self.state.relationship.human_id
        if not human_id or human_id not in self.human_agent_system.humans:
            return None
        
        human = self.human_agent_system.humans[human_id]
        return {
            "human_id": human.id,
            "name": human.name,
            "skills": human.skills,
            "expertise_areas": human.expertise_areas,
            "availability_status": human.availability_status,
            "communication_style": human.communication_style,
            "last_interaction": human.last_interaction.isoformat() if human.last_interaction else None
        }
    
    async def act_as_human_proxy(self, decision_context: Dict[str, Any]) -> Dict[str, Any]:
        """Act as a proxy for the human in decision making."""
        if not self.state.relationship.is_human_proxy():
            raise ValueError("Agent is not configured as human proxy")
        
        human_context = self.get_human_context()
        if not human_context:
            raise ValueError("No human context available for proxy decision")
        
        # Use DSPy to make decision as human would
        proxy_thought = Thought(
            type=ThoughtType.REASONING,
            content=f"Acting as proxy for {human_context['name']} in decision: {decision_context}"
        )
        self.thought_graph.add_thought(proxy_thought)
        
        # This would use a specialized DSPy module for human-like decision making
        # For now, return a basic response
        decision = {
            "decision": "approved",  # This would be more sophisticated
            "reasoning": f"Based on {human_context['name']}'s preferences and expertise",
            "confidence": 0.7,
            "proxy_agent": self.id
        }
        
        # Record the proxy decision
        self.memory.add_episodic({
            "action": "proxy_decision",
            "context": decision_context,
            "decision": decision,
            "human_represented": human_context["human_id"]
        })
        
        return decision
    
    async def communicate_with_agent(self, agent_id: str, message: str, message_type: str = "general"):
        """Send a message to another agent."""
        communication = AgentCommunication(
            from_agent_id=self.id,
            to_agent_id=agent_id,
            message_type=message_type,
            content={"message": message}
        )
        
        # Find target agent
        target_agent = None
        if self.parent_agent and self.parent_agent.id == agent_id:
            target_agent = self.parent_agent
        else:
            for agent in self.agents:
                if agent.id == agent_id:
                    target_agent = agent
                    break
        
        if target_agent:
            target_agent.message_queue.append(communication)
            logger.info(f"Agent {self.number} sent message to agent {target_agent.number}")
        else:
            logger.warning(f"Agent {self.number} could not find target agent {agent_id}")
    
    async def process_messages(self):
        """Process incoming messages."""
        while self.message_queue:
            message = self.message_queue.pop(0)
            
            # Add to memory
            self.memory.add_short_term({
                "type": "received_message",
                "from_agent": message.from_agent_id,
                "message_type": message.message_type,
                "content": message.content
            })
            
            # Mark as acknowledged
            message.acknowledged = True
            
            logger.info(f"Agent {self.number} processed message from agent {message.from_agent_id}")
    
    async def _processing_loop(self):
        """Main processing loop for the agent."""
        while self.state.active:
            try:
                # Process messages
                await self.process_messages()
                
                # Process tasks from queue
                if self.task_queue and not self.state.busy:
                    task = self.task_queue.pop(0)
                    
                    # Decide whether to execute or delegate
                    if self.agents and len(self.current_tasks) > 2:  # Delegate if busy
                        delegated_to = await self.delegate_task(task)
                        if not delegated_to:
                            # If delegation failed, execute ourselves
                            await self.execute_task(task)
                    else:
                        await self.execute_task(task)
                
                # Brief pause
                await asyncio.sleep(0.1)
                
            except Exception as e:
                logger.error(f"Error in agent {self.number} processing loop: {e}")
                await asyncio.sleep(1)
    
    def get_status(self) -> Dict[str, Any]:
        """Get current agent status."""
        human_context = self.get_human_context()
        
        return {
            "id": self.id,
            "number": self.number,
            "role_type": self.role_type,
            "relationship_type": self.state.relationship.relation_type,
            "human_context": human_context,
            "active": self.state.active,
            "busy": self.state.busy,
            "current_tasks": len(self.current_tasks),
            "completed_tasks": len(self.completed_tasks),
            "queued_tasks": len(self.task_queue),
            "sub_agents": len(self.agents),
            "capabilities": self.state.capabilities,
            "last_activity": self.state.last_activity.isoformat() if self.state.last_activity else None,
            "thought_count": len(self.thought_graph.thoughts),
            "memory_items": len(self.memory.short_term) + len(self.memory.episodic),
            "pending_human_approvals": len([
                i for i in self.human_agent_system.interactions 
                if i.relationship_id == self.state.relationship.id and i.status == "pending"
            ]) if not self.state.relationship.is_pure_agent() else 0
        }
    
    def get_hierarchy_status(self) -> Dict[str, Any]:
        """Get status of entire agent hierarchy."""
        status = self.get_status()
        status["sub_agents"] = [agent.get_hierarchy_status() for agent in self.agents]
        return status
    
    @asynccontextmanager
    async def temporary_sub_agent(self, capabilities: List[str] = None):
        """Context manager for temporary sub-agent."""
        sub_agent = await self.hire_sub_agent(capabilities=capabilities)
        try:
            yield sub_agent
        finally:
            if sub_agent:
                await self.fire_sub_agent(sub_agent.id)