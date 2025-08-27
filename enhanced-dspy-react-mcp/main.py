"""Main entry point for DSPy React MCP system."""

import asyncio
import logging
import signal
import sys
from pathlib import Path
from typing import Dict, Any, Optional

from agent import Agent
from mcpservermanager import MCPServerManager
from models import (
    Task, TaskStatus, AgentRoleType, AgentHumanRelationType, 
    Human, HumanAgentSystem
)
from config import config


# Setup logging
logging.basicConfig(
    level=getattr(logging, config.logging.level),
    format=config.logging.format,
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(config.logging.file) if config.logging.file else logging.NullHandler()
    ]
)

logger = logging.getLogger(__name__)


class DSPyReactMCPSystem:
    """Main system orchestrator for DSPy React MCP."""
    
    def __init__(self):
        """Initialize the system."""
        self.mcp_manager = MCPServerManager()
        self.boss_agent: Optional[Agent] = None
        self.human_agent_system = HumanAgentSystem()
        self.running = False
        self.shutdown_event = asyncio.Event()
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals."""
        logger.info(f"Received signal {signum}, initiating shutdown...")
        self.shutdown_event.set()
    
    async def start(self):
        """Start the DSPy React MCP system."""
        logger.info("Starting DSPy React MCP System")
        
        try:
            # Start MCP Server Manager
            await self.mcp_manager.start()
            
            # Create boss agent (agent 0)
            self.boss_agent = Agent(
                number=0,
                role_type=AgentRoleType.BOSS,
                capabilities=["management", "delegation", "coordination", "planning"],
                human_agent_system=self.human_agent_system
            )
            
            # Start boss agent
            await self.boss_agent.start(self.mcp_manager)
            
            # Create initial worker agents
            await self._create_initial_agents()
            
            self.running = True
            logger.info("DSPy React MCP System started successfully")
            
            # Run main loop
            await self._main_loop()
            
        except Exception as e:
            logger.error(f"Failed to start system: {e}")
            raise
    
    async def stop(self):
        """Stop the DSPy React MCP system."""
        logger.info("Stopping DSPy React MCP System")
        
        self.running = False
        
        # Stop boss agent (will cascade to sub-agents)
        if self.boss_agent:
            await self.boss_agent.stop()
        
        # Stop MCP Server Manager
        await self.mcp_manager.stop()
        
        logger.info("DSPy React MCP System stopped")
    
    async def _create_initial_agents(self):
        """Create initial set of worker agents."""
        # Create specialized agents
        specialists = [
            {
                "role_type": AgentRoleType.SPECIALIST,
                "capabilities": ["file_operations", "data_processing", "text_analysis"],
                "relationship_type": AgentHumanRelationType.PURE_AGENT
            },
            {
                "role_type": AgentRoleType.SPECIALIST,
                "capabilities": ["web_search", "information_retrieval", "research"],
                "relationship_type": AgentHumanRelationType.PURE_AGENT
            },
            {
                "role_type": AgentRoleType.WORKER,
                "capabilities": ["general_tasks", "computation", "problem_solving"],
                "relationship_type": AgentHumanRelationType.PURE_AGENT
            }
        ]
        
        for spec in specialists:
            await self.boss_agent.hire_sub_agent(
                role_type=spec["role_type"],
                capabilities=spec["capabilities"],
                relationship_type=spec["relationship_type"]
            )
        
        logger.info(f"Created {len(specialists)} initial agents")
    
    async def _main_loop(self):
        """Main system loop."""
        while self.running and not self.shutdown_event.is_set():
            try:
                # System health checks
                await self._health_check()
                
                # Process any system-level tasks
                await self._process_system_tasks()
                
                # Wait for shutdown signal or brief pause
                try:
                    await asyncio.wait_for(self.shutdown_event.wait(), timeout=5.0)
                    break  # Shutdown signal received
                except asyncio.TimeoutError:
                    continue  # Continue main loop
                
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                await asyncio.sleep(1)
    
    async def _health_check(self):
        """Perform system health checks."""
        if not self.boss_agent or not self.boss_agent.state.active:
            logger.error("Boss agent is not active!")
            self.shutdown_event.set()
            return
        
        # Check MCP servers
        server_statuses = self.mcp_manager.get_all_server_statuses()
        running_servers = sum(1 for status in server_statuses.values() if status.running)
        
        if running_servers == 0:
            logger.warning("No MCP servers are running")
        
        # Log system status periodically
        status = self.boss_agent.get_hierarchy_status()
        logger.debug(f"System status: {status}")
    
    async def _process_system_tasks(self):
        """Process any system-level administrative tasks."""
        # This could include:
        # - Monitoring agent performance
        # - Rebalancing workloads
        # - Cleaning up completed tasks
        # - Updating configurations
        pass
    
    async def submit_task(self, description: str, metadata: Dict[str, Any] = None) -> str:
        """Submit a task to the system."""
        if not self.boss_agent:
            raise RuntimeError("System not started")
        
        task = Task(
            description=description,
            metadata=metadata or {}
        )
        
        await self.boss_agent.receive_task(task)
        logger.info(f"Submitted task: {task.id}")
        return task.id
    
    async def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """Get status of a specific task."""
        if not self.boss_agent:
            return {"error": "System not started"}
        
        # Search through all agents for the task
        def find_task_in_agent(agent: Agent, task_id: str):
            # Check current tasks
            if task_id in agent.current_tasks:
                return agent.current_tasks[task_id]
            
            # Check completed tasks
            for task in agent.completed_tasks:
                if task.id == task_id:
                    return task
            
            # Check task queue
            for task in agent.task_queue:
                if task.id == task_id:
                    return task
            
            # Check sub-agents
            for sub_agent in agent.agents:
                result = find_task_in_agent(sub_agent, task_id)
                if result:
                    return result
            
            return None
        
        task = find_task_in_agent(self.boss_agent, task_id)
        if task:
            return {
                "id": task.id,
                "description": task.description,
                "status": task.status,
                "assigned_agent_id": task.assigned_agent_id,
                "created_at": task.created_at.isoformat(),
                "updated_at": task.updated_at.isoformat(),
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                "result": task.result,
                "error": task.error
            }
        
        return {"error": "Task not found"}
    
    async def add_human(self, name: str, email: str = None, skills: List[str] = None, expertise_areas: List[str] = None) -> str:
        """Add a human to the system."""
        human = Human(
            name=name,
            email=email,
            skills=skills or [],
            expertise_areas=expertise_areas or []
        )
        human_id = self.human_agent_system.add_human(human)
        logger.info(f"Added human {name} with ID {human_id}")
        return human_id
    
    async def create_human_agent_pair(
        self, 
        human_id: str, 
        role_type: AgentRoleType = AgentRoleType.WORKER,
        capabilities: List[str] = None,
        collaboration_rules: Dict[str, Any] = None
    ) -> Optional[str]:
        """Create a human-agent collaborative pair."""
        if not self.boss_agent:
            raise RuntimeError("System not started")
        
        if human_id not in self.human_agent_system.humans:
            raise ValueError(f"Human {human_id} not found")
        
        agent = await self.boss_agent.hire_sub_agent(
            role_type=role_type,
            capabilities=capabilities,
            relationship_type=AgentHumanRelationType.HUMAN_AGENT_PAIR,
            human_id=human_id,
            collaboration_rules=collaboration_rules or {
                "approval_required": ["high_priority_tasks", "external_communications"],
                "notification_types": ["task_completion", "errors", "status_updates"]
            }
        )
        
        if agent:
            logger.info(f"Created human-agent pair: Human {human_id} with Agent {agent.number}")
            return agent.id
        return None
    
    async def create_human_proxy_agent(
        self,
        human_id: str,
        role_type: AgentRoleType = AgentRoleType.WORKER,
        capabilities: List[str] = None,
        proxy_rules: Dict[str, Any] = None
    ) -> Optional[str]:
        """Create an agent that acts as a human proxy."""
        if not self.boss_agent:
            raise RuntimeError("System not started")
        
        if human_id not in self.human_agent_system.humans:
            raise ValueError(f"Human {human_id} not found")
        
        agent = await self.boss_agent.hire_sub_agent(
            role_type=role_type,
            capabilities=capabilities,
            relationship_type=AgentHumanRelationType.HUMAN_PROXY_AGENT,
            human_id=human_id,
            collaboration_rules=proxy_rules or {
                "act_as_human": True,
                "decision_authority": "full",
                "approval_required": [],
                "proxy_permissions": ["task_delegation", "resource_allocation", "communication"]
            }
        )
        
        if agent:
            logger.info(f"Created human proxy agent: Agent {agent.number} for Human {human_id}")
            return agent.id
        return None
    
    async def get_human_pending_approvals(self, human_id: str) -> List[Dict[str, Any]]:
        """Get pending approvals for a human."""
        if human_id not in self.human_agent_system.humans:
            return []
        
        pending = self.human_agent_system.get_pending_approvals_for_human(human_id)
        return [
            {
                "interaction_id": interaction.id,
                "type": interaction.interaction_type,
                "content": interaction.content,
                "timestamp": interaction.timestamp.isoformat(),
                "agent_id": self.human_agent_system.relationships[interaction.relationship_id].agent_id
            }
            for interaction in pending
        ]
    
    async def respond_to_agent(self, human_id: str, interaction_id: str, response: Dict[str, Any]) -> bool:
        """Human responds to agent request."""
        if human_id not in self.human_agent_system.humans:
            return False
        
        # Find the agent that made the request
        for interaction in self.human_agent_system.interactions:
            if interaction.id == interaction_id:
                relationship = self.human_agent_system.relationships.get(interaction.relationship_id)
                if relationship and relationship.human_id == human_id:
                    # Find the agent and deliver the response
                    agent = self._find_agent_by_id(relationship.agent_id)
                    if agent:
                        return await agent.receive_human_response(interaction_id, response)
        
        return False
    
    def _find_agent_by_id(self, agent_id: str) -> Optional[Agent]:
        """Find an agent by ID in the hierarchy."""
        if not self.boss_agent:
            return None
        
        def search_agent(agent: Agent) -> Optional[Agent]:
            if agent.id == agent_id:
                return agent
            for sub_agent in agent.agents:
                result = search_agent(sub_agent)
                if result:
                    return result
            return None
        
        return search_agent(self.boss_agent)
    
    async def get_system_status(self) -> Dict[str, Any]:
        """Get overall system status."""
        if not self.boss_agent:
            return {"error": "System not started"}
        
        # Get agent hierarchy status
        agent_status = self.boss_agent.get_hierarchy_status()
        
        # Get MCP server status
        server_statuses = self.mcp_manager.get_all_server_statuses()
        
        # Get available tools
        available_tools = await self.mcp_manager.get_available_tools()
        
        # Get human-agent system stats
        total_humans = len(self.human_agent_system.humans)
        total_relationships = len(self.human_agent_system.relationships)
        pure_agents = sum(1 for r in self.human_agent_system.relationships.values() if r.is_pure_agent())
        human_paired = sum(1 for r in self.human_agent_system.relationships.values() if r.is_human_paired())
        human_proxy = sum(1 for r in self.human_agent_system.relationships.values() if r.is_human_proxy())
        pending_approvals = len(self.human_agent_system.pending_approvals)
        
        return {
            "running": self.running,
            "agents": agent_status,
            "human_agent_system": {
                "total_humans": total_humans,
                "total_relationships": total_relationships,
                "pure_agents": pure_agents,
                "human_paired_agents": human_paired,
                "human_proxy_agents": human_proxy,
                "pending_approvals": pending_approvals
            },
            "mcp_servers": {
                name: {
                    "running": status.running,
                    "tools": len(status.tools),
                    "error": status.error
                }
                for name, status in server_statuses.items()
            },
            "available_tools": [tool.name for tool in available_tools],
            "total_tools": len(available_tools)
        }


async def main():
    """Main entry point."""
    system = DSPyReactMCPSystem()
    
    try:
        await system.start()
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
    except Exception as e:
        logger.error(f"System error: {e}")
    finally:
        await system.stop()


def demo_usage():
    """Demonstrate system usage with human-agent relationships."""
    async def demo():
        system = DSPyReactMCPSystem()
        
        try:
            # Start the system
            await system.start()
            print("✅ System started with pure agents")
            
            # Add humans to the system
            alice_id = await system.add_human(
                name="Alice Johnson",
                email="alice@example.com",
                skills=["data_analysis", "project_management"],
                expertise_areas=["business_intelligence", "process_optimization"]
            )
            
            bob_id = await system.add_human(
                name="Bob Smith", 
                email="bob@example.com",
                skills=["software_development", "system_architecture"],
                expertise_areas=["backend_systems", "api_design"]
            )
            print(f"✅ Added humans: Alice ({alice_id[:8]}...) and Bob ({bob_id[:8]}...)")
            
            # Create human-agent collaborative pairs
            alice_agent_id = await system.create_human_agent_pair(
                human_id=alice_id,
                role_type=AgentRoleType.ANALYST,
                capabilities=["data_analysis", "reporting", "visualization"],
                collaboration_rules={
                    "approval_required": ["external_reports", "data_sharing"],
                    "notification_types": ["analysis_complete", "anomalies_detected"]
                }
            )
            
            # Create human proxy agent
            bob_proxy_id = await system.create_human_proxy_agent(
                human_id=bob_id,
                role_type=AgentRoleType.COORDINATOR,
                capabilities=["system_coordination", "technical_decisions", "resource_allocation"],
                proxy_rules={
                    "act_as_human": True,
                    "decision_authority": "full",
                    "proxy_permissions": ["task_delegation", "priority_setting", "resource_allocation"]
                }
            )
            
            print(f"✅ Created Alice's collaborative agent ({alice_agent_id[:8]}...) and Bob's proxy agent ({bob_proxy_id[:8]}...)")
            
            # Submit tasks to different agent types
            print("\n📋 Submitting tasks to different agent types...")
            
            # Task for pure agent
            pure_task_id = await system.submit_task(
                "Analyze system logs for errors",
                metadata={"priority": "medium", "type": "analysis", "agent_type": "pure"}
            )
            
            # Task that might require human approval (Alice's agent)
            collab_task_id = await system.submit_task(
                "Generate quarterly performance report for external stakeholders",
                metadata={"priority": "high", "type": "external_reports", "requires_approval": True}
            )
            
            # Task for proxy agent (Bob's agent acting as Bob)
            proxy_task_id = await system.submit_task(
                "Coordinate system maintenance schedule across teams",
                metadata={"priority": "high", "type": "coordination", "proxy_decision": True}
            )
            
            print(f"✅ Submitted tasks: Pure ({pure_task_id[:8]}...), Collaborative ({collab_task_id[:8]}...), Proxy ({proxy_task_id[:8]}...)")
            
            # Wait for initial processing
            await asyncio.sleep(5)
            
            # Check for pending human approvals
            alice_approvals = await system.get_human_pending_approvals(alice_id)
            if alice_approvals:
                print(f"\n🔔 Alice has {len(alice_approvals)} pending approvals:")
                for approval in alice_approvals:
                    print(f"  - {approval['type']}: {approval['content']}")
                    
                    # Simulate Alice approving the request
                    await system.respond_to_agent(
                        human_id=alice_id,
                        interaction_id=approval['interaction_id'],
                        response={
                            "approved": True,
                            "comments": "Approved with minor formatting suggestions",
                            "modifications": ["Add executive summary", "Include trend analysis"]
                        }
                    )
                    print(f"  ✅ Alice approved interaction {approval['interaction_id'][:8]}...")
            
            # Wait for task processing
            await asyncio.sleep(10)
            
            # Check all task statuses
            print("\n📊 Task Status Summary:")
            for task_id, task_type in [
                (pure_task_id, "Pure Agent Task"),
                (collab_task_id, "Collaborative Task"),
                (proxy_task_id, "Proxy Agent Task")
            ]:
                status = await system.get_task_status(task_id)
                print(f"  {task_type}: {status.get('status', 'unknown')}")
                if status.get('result'):
                    print(f"    Result: {str(status['result'])[:100]}...")
            
            # Get comprehensive system status
            system_status = await system.get_system_status()
            print(f"\n🏗️  System Status:")
            print(f"  Total Agents: {system_status['human_agent_system']['total_relationships']}")
            print(f"  Pure Agents: {system_status['human_agent_system']['pure_agents']}")
            print(f"  Human-Paired Agents: {system_status['human_agent_system']['human_paired_agents']}")
            print(f"  Human Proxy Agents: {system_status['human_agent_system']['human_proxy_agents']}")
            print(f"  Total Humans: {system_status['human_agent_system']['total_humans']}")
            print(f"  Pending Approvals: {system_status['human_agent_system']['pending_approvals']}")
            
            # Show agent hierarchy with relationship types
            print(f"\n🌳 Agent Hierarchy:")
            def print_agent_tree(agent_data, indent=0):
                prefix = "  " * indent
                rel_type = agent_data.get('relationship_type', 'unknown')
                human_info = ""
                if agent_data.get('human_context'):
                    human_info = f" (paired with {agent_data['human_context']['name']})"
                
                print(f"{prefix}Agent {agent_data['number']}: {agent_data['role_type']} - {rel_type}{human_info}")
                
                for sub_agent in agent_data.get('sub_agents', []):
                    print_agent_tree(sub_agent, indent + 1)
            
            print_agent_tree(system_status['agents'])
            
            print(f"\n⏱️  Letting system run for 30 more seconds...")
            await asyncio.sleep(30)
            
        except Exception as e:
            print(f"❌ Demo failed: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await system.stop()
            print("🛑 System stopped")
    
    asyncio.run(demo())


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "demo":
        demo_usage()
    else:
        asyncio.run(main())