"""Simple test script to verify the DSPy React MCP system with human-agent relationships."""

import asyncio
import logging
from main import DSPyReactMCPSystem
from models import AgentRoleType, AgentHumanRelationType

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_basic_functionality():
    """Test basic system functionality."""
    logger.info("Starting basic functionality test")
    
    system = DSPyReactMCPSystem()
    
    try:
        # Start the system
        logger.info("Starting system...")
        await system.start()
        
        # Wait a moment for initialization
        await asyncio.sleep(2)
        
        # Check system status
        status = await system.get_system_status()
        logger.info(f"System status: {status}")
        
        # Submit a simple task
        task_id = await system.submit_task(
            "Test task: Print hello world",
            metadata={"test": True, "priority": "low"}
        )
        logger.info(f"Submitted test task: {task_id}")
        
        # Wait for task processing
        await asyncio.sleep(5)
        
        # Check task status
        task_status = await system.get_task_status(task_id)
        logger.info(f"Task status: {task_status}")
        
        # Get final system status
        final_status = await system.get_system_status()
        logger.info(f"Final system status: {final_status}")
        
        logger.info("Basic functionality test completed successfully")
        
    except Exception as e:
        logger.error(f"Test failed: {e}")
        raise
    finally:
        # Stop the system
        await system.stop()
        logger.info("System stopped")


async def test_human_agent_relationships():
    """Test human-agent relationship functionality."""
    logger.info("Starting human-agent relationship test")
    
    system = DSPyReactMCPSystem()
    
    try:
        await system.start()
        await asyncio.sleep(2)
        
        # Add a human to the system
        human_id = await system.add_human(
            name="Test User",
            email="test@example.com",
            skills=["testing", "validation"],
            expertise_areas=["quality_assurance"]
        )
        logger.info(f"Added human: {human_id}")
        
        # Create human-agent pair
        pair_agent_id = await system.create_human_agent_pair(
            human_id=human_id,
            role_type=AgentRoleType.ANALYST,
            capabilities=["analysis", "reporting"],
            collaboration_rules={
                "approval_required": ["reports"],
                "notification_types": ["completion"]
            }
        )
        logger.info(f"Created human-agent pair: {pair_agent_id}")
        
        # Create human proxy agent
        proxy_agent_id = await system.create_human_proxy_agent(
            human_id=human_id,
            role_type=AgentRoleType.COORDINATOR,
            capabilities=["coordination", "decision_making"]
        )
        logger.info(f"Created human proxy agent: {proxy_agent_id}")
        
        # Submit tasks
        task1_id = await system.submit_task(
            "Generate test report",
            metadata={"type": "reports", "requires_approval": True}
        )
        
        task2_id = await system.submit_task(
            "Coordinate test activities",
            metadata={"type": "coordination", "proxy_decision": True}
        )
        
        logger.info(f"Submitted tasks: {task1_id}, {task2_id}")
        
        # Wait for processing
        await asyncio.sleep(5)
        
        # Check for pending approvals
        approvals = await system.get_human_pending_approvals(human_id)
        logger.info(f"Pending approvals: {len(approvals)}")
        
        # Simulate human response
        if approvals:
            for approval in approvals:
                await system.respond_to_agent(
                    human_id=human_id,
                    interaction_id=approval['interaction_id'],
                    response={"approved": True, "comments": "Test approval"}
                )
                logger.info(f"Approved interaction: {approval['interaction_id']}")
        
        # Wait for completion
        await asyncio.sleep(5)
        
        # Check final status
        status = await system.get_system_status()
        logger.info(f"Final system status: {status['human_agent_system']}")
        
        logger.info("Human-agent relationship test completed")
        
    except Exception as e:
        logger.error(f"Human-agent relationship test failed: {e}")
        raise
    finally:
        await system.stop()


async def test_agent_hierarchy():
    """Test agent hierarchy and delegation."""
    logger.info("Starting agent hierarchy test")
    
    system = DSPyReactMCPSystem()
    
    try:
        await system.start()
        await asyncio.sleep(2)
        
        # Submit multiple tasks to test delegation
        tasks = []
        for i in range(3):
            task_id = await system.submit_task(
                f"Task {i+1}: Process data item {i+1}",
                metadata={"batch": True, "item": i+1}
            )
            tasks.append(task_id)
            logger.info(f"Submitted task {i+1}: {task_id}")
        
        # Wait for processing
        await asyncio.sleep(10)
        
        # Check all task statuses
        for i, task_id in enumerate(tasks):
            status = await system.get_task_status(task_id)
            logger.info(f"Task {i+1} status: {status}")
        
        # Check agent hierarchy
        if system.boss_agent:
            hierarchy = system.boss_agent.get_hierarchy_status()
            logger.info(f"Agent hierarchy: {hierarchy}")
        
        logger.info("Agent hierarchy test completed")
        
    except Exception as e:
        logger.error(f"Hierarchy test failed: {e}")
        raise
    finally:
        await system.stop()


if __name__ == "__main__":
    print("DSPy React MCP System Test")
    print("=" * 40)
    
    # Run basic functionality test
    try:
        asyncio.run(test_basic_functionality())
        print("\n✅ Basic functionality test passed")
    except Exception as e:
        print(f"\n❌ Basic functionality test failed: {e}")
    
    print("\n" + "=" * 40)
    
    # Run human-agent relationship test
    try:
        asyncio.run(test_human_agent_relationships())
        print("\n✅ Human-agent relationship test passed")
    except Exception as e:
        print(f"\n❌ Human-agent relationship test failed: {e}")
    
    print("\n" + "=" * 40)
    
    # Run agent hierarchy test
    try:
        asyncio.run(test_agent_hierarchy())
        print("\n✅ Agent hierarchy test passed")
    except Exception as e:
        print(f"\n❌ Agent hierarchy test failed: {e}")
    
    print("\n" + "=" * 40)
    print("Test suite completed")