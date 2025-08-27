# DSPy React MCP System

🚀 **Advanced Human-AI Collaboration Platform with Web UI**

A comprehensive DSPy-based reactive system with MCP (Model Context Protocol) server management, hierarchical agent architecture, and a modern web interface for browser-based interaction.

## 🌟 Features

### Core System
- **Hierarchical Agent Architecture**: Boss agent (0) manages specialist and worker sub-agents
- **Human-Agent Collaboration**: Three relationship types (Pure Agent, Human-Paired, Human-Proxy)
- **MCP Server Management**: Runtime async tool availability with automatic cleanup
- **Reactive Architecture**: DSPy signatures with flexible input/output handling
- **Thought Graph System**: Nested BaseModel structures for granular reasoning
- **UUID-based Agent Identification**: Unique IDs for each agent instance

### Web Interface
- **Modern Dashboard**: Beautiful gradient UI with real-time metrics
- **WebSocket Integration**: Live system updates and logging
- **Human Management**: Add/manage humans with skills and expertise
- **Agent Management**: Create and monitor agent hierarchies
- **Task Management**: Submit and track tasks across the system
- **MCP Server Monitoring**: Real-time server status and tool availability
- **REST API**: Comprehensive endpoints for all system functions

## 📁 Project Structure

```
dspy-react-mcp/
├── main.py              # Main system orchestrator
├── agent.py             # Hierarchical agent implementation
├── models.py            # Pydantic models and data structures
├── signature.py         # DSPy signatures with flexible I/O
├── mcpservermanager.py  # MCP server lifecycle management
├── config.py            # Configuration management
├── webui.py             # FastAPI web interface
├── requirements.txt     # Python dependencies
├── mcp_servers.json     # MCP server configurations
└── .env                 # Environment variables
```

## 🚀 Quick Start

### 1. Installation

```bash
# Extract the system
tar -xzf dspy-react-mcp-system.tar.gz
cd dspy-react-mcp

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your API keys
```

### 2. Configuration

Edit `config.py` to customize:
- DSPy model settings
- Agent capabilities
- MCP server configurations
- System parameters

### 3. Run the System

#### Command Line Mode
```bash
python main.py
```

#### Web UI Mode
```bash
python webui.py --host 0.0.0.0 --port 9000
```

Then open: http://localhost:9000

## 🏗️ Architecture

### Agent Hierarchy
- **Boss Agent (0)**: Manages delegation and coordination
- **Specialist Agents**: Domain-specific capabilities
- **Worker Agents**: General task execution
- **Sub-agents**: Can hire their own sub-agents

### Human-Agent Relationships
1. **Pure Agent**: Autonomous operation
2. **Human-Paired**: Direct human collaboration
3. **Human-Proxy**: Human oversight and approval

### MCP Integration
- **Runtime Tool Discovery**: Dynamic tool availability
- **Server Lifecycle Management**: Automatic start/stop/cleanup
- **Error Handling**: Graceful degradation on server failures

## 🌐 Web Interface

### Dashboard Features
- **System Metrics**: Real-time agent, human, and task counts
- **Live Logs**: WebSocket-powered system activity feed
- **Interactive Management**: Add humans, create agents, submit tasks
- **Server Monitoring**: MCP server status and tool availability

### API Endpoints
- `GET /api/system/status` - System overview
- `GET /api/agents` - Agent hierarchy
- `GET /api/humans` - Human management
- `GET /api/tasks` - Task tracking
- `POST /api/humans` - Add new human
- `POST /api/tasks` - Submit new task
- `WebSocket /ws` - Real-time updates

## 🔧 Configuration

### Environment Variables (.env)
```bash
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
DSPY_MODEL=gpt-4
LOG_LEVEL=INFO
```

### MCP Servers (mcp_servers.json)
```json
{
  "filesystem": {
    "command": "npx",
    "args": ["@modelcontextprotocol/server-filesystem", "/tmp"],
    "env": {}
  },
  "sqlite": {
    "command": "npx", 
    "args": ["@modelcontextprotocol/server-sqlite", "--db-path", "/tmp/test.db"],
    "env": {}
  }
}
```

## 🧠 Key Components

### DSPy Signatures
```python
class FlexibleSignature(dspy.Signature):
    """Flexible input/output with runtime kwargs support"""
    input_data: str = dspy.InputField()
    output: Union[str, Dict, List] = dspy.OutputField()
```

### Agent System
```python
class Agent:
    def __init__(self, number: int, role_type: AgentRoleType):
        self.id = str(uuid.uuid4())
        self.number = number
        self.agents = []  # Sub-agents
        self.thought_graph = ThoughtGraph()
```

### MCP Manager
```python
class MCPServerManager:
    async def start(self):
        """Start all configured MCP servers"""
    
    async def get_available_tools(self):
        """Get all available tools from running servers"""
```

## 📊 Monitoring

### System Health
- Agent status and activity
- Human relationship tracking
- Task completion metrics
- MCP server availability

### Logging
- Structured logging with timestamps
- WebSocket real-time log streaming
- Error tracking and reporting
- Performance metrics

## 🔒 Security

- Environment variable protection
- Input validation on all endpoints
- CORS configuration for web access
- Graceful error handling

## 🚀 Deployment

### Development
```bash
python webui.py --host 127.0.0.1 --port 8000
```

### Production
```bash
python webui.py --host 0.0.0.0 --port 80
```

### Docker (Optional)
```dockerfile
FROM python:3.11
COPY . /app
WORKDIR /app
RUN pip install -r requirements.txt
EXPOSE 8000
CMD ["python", "webui.py", "--host", "0.0.0.0", "--port", "8000"]
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Submit pull request

## 📝 License

MIT License - see LICENSE file for details

## 🆘 Support

- Check logs in the web interface
- Review MCP server status
- Verify environment variables
- Test API endpoints directly

---

**Built with ❤️ using DSPy, FastAPI, and Modern Web Technologies**