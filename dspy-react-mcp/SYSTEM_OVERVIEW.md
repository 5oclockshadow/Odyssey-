# DSPy React MCP System Overview

## System Architecture

This is a comprehensive DSPy-based React (Reasoning and Acting) system with MCP (Model Context Protocol) server integration. The system implements a hierarchical multi-agent architecture with dynamic tool availability and sophisticated reasoning capabilities.

## Core Components

### 1. **Environment Configuration (.env)**
- API keys for various LLM providers
- System configuration parameters
- MCP server settings
- Logging configuration

### 2. **Configuration Management (config.py)**
- Centralized configuration using Pydantic models
- Support for multiple LLM providers (OpenAI, Anthropic, Google)
- MCP server configuration management
- Environment variable integration

### 3. **Data Models (models.py)**
- **BaseModel-based structures** with extensive nesting capability
- **ThoughtGraph**: Hierarchical reasoning structure with parent-child relationships
- **AgentState**: Complete agent status and capability tracking
- **Task**: Comprehensive task lifecycle management
- **Memory**: Multi-layered memory system (short-term, long-term, episodic, semantic)
- **Communication**: Inter-agent messaging system

### 4. **DSPy Signatures (signature.py)**
- **FlexibleInput**: Single input field accepting any data type with runtime **kwargs support
- **UnifiedOutput**: Union type supporting multiple output formats (TaskOutput, ReasoningOutput, ActionOutput, DelegationOutput, AnalysisOutput)
- **Specialized Signatures**: Task execution, reasoning, action planning, delegation, analysis
- **BaseModel Integration**: All signatures use Pydantic BaseModel for structure

### 5. **Agent System (agent.py)**
- **Hierarchical Structure**: 
  - `self.agents` - List of sub-agents for delegation
  - `self.id` - UUID for each agent instance
  - `self.number` - Direct mapping (0 = boss, others = workers/specialists)
  - Sub-agents can hire their own sub-agents with proper management
- **ThoughtGraph Integration**: Each agent maintains detailed reasoning graphs
- **Memory System**: Multi-layered memory with episodic and semantic components
- **Task Management**: Queue, execution, and delegation capabilities
- **DSPy Integration**: Uses ChainOfThought modules for reasoning

### 6. **MCP Server Manager (mcpservermanager.py)**
- **Runtime Async Tool Availability**: Dynamic tool discovery and management
- **Server Lifecycle Management**: Start, stop, restart, health monitoring
- **Cleanup Operations**: Automatic process cleanup and resource management
- **Tool Execution**: Async tool invocation with error handling
- **Configuration Loading**: JSON-based server configuration

### 7. **Main System (main.py)**
- **System Orchestration**: Coordinates all components
- **Agent Initialization**: Creates boss agent and initial worker pool
- **Task Submission**: External interface for task submission
- **Status Monitoring**: System-wide status and health checks
- **Graceful Shutdown**: Proper cleanup of all resources

## Key Features

### Human-Agent Relationship System
- **Pure Agents**: Traditional autonomous agents (boss/worker/specialist)
- **Human-Agent Pairs**: Collaborative human-agent teams with approval workflows
- **Human Proxy Agents**: Agents acting as human representatives with full decision authority
- **Dynamic Relationship Management**: Runtime creation and management of human-agent relationships

### Hierarchical Agent Management
- **Boss Agent (Agent 0)**: Management, delegation, coordination
- **Worker Agents**: Task execution and specialized capabilities
- **Specialist Agents**: Domain-specific expertise (Analyst, Coordinator, Researcher, etc.)
- **Dynamic Hiring**: Agents can create sub-agents with different relationship types
- **Proper Delegation**: Capability-based task routing with human approval integration

### Thought Graph Reasoning
- **Nested Structure**: Parent-child thought relationships
- **Thought Types**: Observation, Reasoning, Planning, Action, Reflection
- **Granular Tracking**: Detailed reasoning process capture
- **Memory Integration**: Thoughts feed into memory systems

### MCP Integration
- **Dynamic Tools**: Runtime tool discovery from MCP servers
- **Async Operations**: Non-blocking tool execution
- **Server Management**: Automatic server lifecycle management
- **Health Monitoring**: Server status tracking and recovery

### Flexible I/O System
- **Runtime kwargs**: Input system accepts arbitrary keyword arguments
- **Union Output**: Single output type supporting multiple result formats
- **BaseModel Structure**: Consistent data modeling throughout
- **Type Safety**: Pydantic validation for all data structures

## Usage Patterns

### Basic System Startup
```python
system = DSPyReactMCPSystem()
await system.start()  # Creates pure agents by default
```

### Human Management
```python
# Add humans to the system
human_id = await system.add_human(
    name="Alice Johnson",
    skills=["data_analysis", "project_management"],
    expertise_areas=["business_intelligence"]
)

# Create human-agent collaborative pair
agent_id = await system.create_human_agent_pair(
    human_id=human_id,
    role_type=AgentRoleType.ANALYST,
    collaboration_rules={
        "approval_required": ["external_reports"],
        "notification_types": ["analysis_complete"]
    }
)

# Create human proxy agent
proxy_id = await system.create_human_proxy_agent(
    human_id=human_id,
    role_type=AgentRoleType.COORDINATOR,
    proxy_rules={
        "decision_authority": "full",
        "proxy_permissions": ["task_delegation", "resource_allocation"]
    }
)
```

### Task Submission with Human Interaction
```python
# Task that may require human approval
task_id = await system.submit_task(
    "Generate quarterly report for external stakeholders",
    metadata={"priority": "high", "type": "external_reports"}
)

# Check for pending human approvals
approvals = await system.get_human_pending_approvals(human_id)

# Human responds to agent request
await system.respond_to_agent(
    human_id=human_id,
    interaction_id=approval['interaction_id'],
    response={"approved": True, "comments": "Approved with modifications"}
)
```

### Agent Delegation with Relationship Types
```python
# Boss agent delegates based on:
# - Agent capabilities and role types
# - Human-agent relationship requirements
# - Current workload and availability
# - Human approval requirements
```

### MCP Tool Usage
```python
# Tools are automatically discovered and made available
# Agents can use tools through the MCP manager
tools = await mcp_manager.get_available_tools()
```

## Configuration Files

### mcp_config.json
- MCP server definitions
- Command line arguments
- Environment variables
- Enable/disable flags

### requirements.txt
- Core dependencies (dspy-ai, pydantic, etc.)
- Async libraries
- API clients
- Development tools

## Setup and Installation

1. **Extract the zip file**
2. **Run setup**: `python setup.py`
3. **Configure API keys** in `.env`
4. **Test system**: `python test_system.py`
5. **Run system**: `python main.py`

## System Capabilities

- ✅ **Human-Agent Relationship Management**: Three distinct relationship types (pure, paired, proxy)
- ✅ **Hierarchical Multi-Agent System**: Boss-worker delegation with specialized roles
- ✅ **Dynamic Tool Integration**: Runtime MCP server management and tool discovery
- ✅ **Sophisticated Reasoning**: Thought graphs with nested reasoning structures
- ✅ **Flexible I/O Handling**: Runtime kwargs support and union output types
- ✅ **Multi-Layer Memory**: Short-term, long-term, episodic, and semantic memory
- ✅ **Human Approval Workflows**: Configurable approval requirements and notifications
- ✅ **Proxy Decision Making**: Agents acting as human representatives
- ✅ **Async Architecture**: High-performance concurrent processing
- ✅ **Comprehensive Error Handling**: Robust error recovery and reporting
- ✅ **Configuration Management**: JSON-based configuration with environment variables
- ✅ **Logging and Monitoring**: Structured logging with performance metrics
- ✅ **Graceful Shutdown**: Proper cleanup of all resources and relationships

## Relationship Types Explained

### 1. Pure Agents (`PURE_AGENT`)
- **Autonomous Operation**: No human involvement required
- **Full Decision Authority**: Can execute tasks independently
- **Use Cases**: Background processing, automated analysis, routine tasks

### 2. Human-Agent Pairs (`HUMAN_AGENT_PAIR`)
- **Collaborative Partnership**: Human and agent work together
- **Approval Workflows**: Configurable human approval for specific task types
- **Bidirectional Communication**: Agent can request approval, human can provide guidance
- **Use Cases**: Content creation, strategic decisions, external communications

### 3. Human Proxy Agents (`HUMAN_PROXY_AGENT`)
- **Human Representative**: Agent acts with human's authority
- **Full Decision Power**: Can make decisions as if they were the human
- **Contextual Awareness**: Uses human's preferences and expertise
- **Use Cases**: Meeting representation, routine decision making, delegation management

This system provides a comprehensive foundation for building sophisticated AI agent systems with DSPy, combining the power of language models with structured reasoning, dynamic tool access, hierarchical task management, and flexible human-AI collaboration patterns.