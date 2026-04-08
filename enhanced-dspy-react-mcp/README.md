# DSPy React MCP System

A sophisticated multi-agent system built with DSPy that implements React (Reasoning and Acting) patterns with Model Context Protocol (MCP) server integration for dynamic tool availability.

## Features

- **Hierarchical Agent System**: Boss agent (agent 0) can hire and manage sub-agents
- **Dynamic Tool Integration**: MCP server manager provides runtime tool availability
- **Thought Graph Reasoning**: Agents maintain detailed reasoning graphs with nested thoughts
- **Flexible Task Delegation**: Agents can delegate tasks based on capabilities and workload
- **Memory Management**: Short-term, long-term, episodic, and semantic memory systems
- **Async Architecture**: Fully asynchronous for high performance
- **Configuration Management**: JSON-based configuration with environment variable support

## Architecture

### Core Components

1. **Agent (`agent.py`)**: Intelligent agents with hierarchical delegation
2. **MCP Server Manager (`mcpservermanager.py`)**: Runtime async tool management
3. **Models (`models.py`)**: Pydantic data models with nested BaseModel structures
4. **Signatures (`signature.py`)**: DSPy signatures with flexible input/output handling
5. **Configuration (`config.py`)**: Centralized configuration management
6. **Main System (`main.py`)**: System orchestrator and entry point

### Agent Hierarchy

- **Agent 0 (Boss)**: Management, delegation, coordination, planning
- **Sub-agents**: Workers and specialists with specific capabilities
- **Dynamic Hiring**: Agents can hire sub-agents up to configured limits
- **Task Delegation**: Intelligent task routing based on capabilities and workload

### Thought Graph

Each agent maintains a thought graph with:
- **Observations**: Environmental inputs and data
- **Reasoning**: Logical processing and analysis
- **Planning**: Goal-oriented action planning
- **Actions**: Executed operations
- **Reflections**: Post-action analysis and learning

## Installation

1. Clone or extract the system files
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Configure environment variables in `.env`
4. Update MCP server configurations in `mcp_config.json`

## Configuration

### Environment Variables (.env)

```env
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
MAX_AGENTS=10
DEFAULT_MODEL=gpt-4
AGENT_TIMEOUT=300
LOG_LEVEL=INFO
```

### MCP Servers (mcp_config.json)

Configure available MCP servers for tool integration:
- Filesystem operations
- Web search (Brave Search)
- SQLite database operations
- Memory management

## Usage

### Basic Usage

```python
from main import DSPyReactMCPSystem

async def main():
    system = DSPyReactMCPSystem()
    await system.start()
    
    # Submit tasks
    task_id = await system.submit_task(
        "Analyze the current directory structure",
        metadata={"priority": "high"}
    )
    
    # Check status
    status = await system.get_task_status(task_id)
    print(status)
    
    await system.stop()
```

### Running the Demo

```bash
python main.py demo
```

### Command Line Interface

```bash
# Start the system
python main.py

# The system will:
# 1. Start MCP servers
# 2. Create boss agent
# 3. Hire initial specialist agents
# 4. Begin processing tasks
```

## Agent Capabilities

### Boss Agent (Agent 0)
- Task coordination and delegation
- Sub-agent management (hiring/firing)
- System-wide planning and oversight
- Resource allocation

### Worker Agents
- Task execution using available tools
- Reasoning and problem-solving
- Communication with other agents
- Memory management and learning

### Specialist Agents
- Domain-specific capabilities
- Optimized for particular task types
- Enhanced tool integration
- Specialized reasoning patterns

## MCP Integration

The system integrates with MCP servers to provide:

- **Dynamic Tool Discovery**: Runtime detection of available tools
- **Async Tool Execution**: Non-blocking tool operations
- **Server Health Monitoring**: Automatic restart and cleanup
- **Tool Capability Matching**: Intelligent tool selection for tasks

## Memory System

Each agent maintains multiple memory types:

- **Short-term**: Recent interactions and observations (limited size)
- **Long-term**: Persistent knowledge and learned patterns
- **Episodic**: Specific experiences and events
- **Semantic**: Factual knowledge and relationships

## Task Management

- **Flexible Input**: Tasks accept various data types with runtime kwargs
- **Unified Output**: Standardized output format for different result types
- **Status Tracking**: Complete task lifecycle monitoring
- **Error Handling**: Robust error recovery and reporting

## Monitoring and Logging

- Structured logging with configurable levels
- Agent performance metrics
- System health monitoring
- Task execution tracking

## Extension Points

The system is designed for extensibility:

- **Custom Agents**: Inherit from base Agent class
- **New MCP Servers**: Add server configurations
- **Custom Signatures**: Define new DSPy signatures
- **Tool Integration**: Register custom tool callbacks
- **Memory Backends**: Implement custom memory storage

## Development

### Running Tests

```bash
pytest tests/
```

### Code Formatting

```bash
black .
isort .
```

### Type Checking

```bash
mypy .
```

## License

This project is provided as-is for educational and development purposes.