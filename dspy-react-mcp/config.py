"""Configuration management for DSPy React MCP system."""

import os
import json
from pathlib import Path
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class ModelConfig(BaseModel):
    """Configuration for language models."""
    name: str
    provider: str
    api_key: Optional[str] = None
    max_tokens: int = 4000
    temperature: float = 0.7
    timeout: int = 30

class MCPServerConfig(BaseModel):
    """Configuration for MCP servers."""
    name: str
    command: str
    args: list[str] = Field(default_factory=list)
    env: Dict[str, str] = Field(default_factory=dict)
    enabled: bool = True
    timeout: int = 30

class AgentConfig(BaseModel):
    """Configuration for agents."""
    name: str = Field
    
    max_agents: int = 10
    default_model: str = "gpt-4"
    timeout: int = 300
    max_depth: int = 5
    enable_delegation: bool = True

class LoggingConfig(BaseModel):
    """Configuration for logging."""
    level: str = "INFO"
    file: Optional[str] = None
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

class Config(BaseModel):
    """Main configuration class."""
    models: Dict[str, ModelConfig] = Field(default_factory=dict)
    mcp_servers: Dict[str, MCPServerConfig] = Field(default_factory=dict)
    agent: AgentConfig = Field(default_factory=AgentConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    
    @classmethod
    def load_from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        config = cls()
        
        # Model configurations
        if os.getenv("OPENAI_API_KEY"):
            config.models["gpt-4"] = ModelConfig(
                name="gpt-4",
                provider="openai",
                api_key=os.getenv("OPENAI_API_KEY")
            )
            config.models["gpt-3.5-turbo"] = ModelConfig(
                name="gpt-3.5-turbo",
                provider="openai",
                api_key=os.getenv("OPENAI_API_KEY"),
                max_tokens=2000
            )
        
        if os.getenv("ANTHROPIC_API_KEY"):
            config.models["claude-3-sonnet"] = ModelConfig(
                name="claude-3-sonnet-20240229",
                provider="anthropic",
                api_key=os.getenv("ANTHROPIC_API_KEY")
            )
        
        # Agent configuration
        config.agent.max_agents = int(os.getenv("MAX_AGENTS", "10"))
        config.agent.default_model = os.getenv("DEFAULT_MODEL", "gpt-4")
        config.agent.timeout = int(os.getenv("AGENT_TIMEOUT", "300"))
        
        # Logging configuration
        config.logging.level = os.getenv("LOG_LEVEL", "INFO")
        config.logging.file = os.getenv("LOG_FILE")
        
        return config
    
    @classmethod
    def load_from_file(cls, path: str) -> "Config":
        """Load configuration from JSON file."""
        with open(path, 'r') as f:
            data = json.load(f)
        return cls(**data)
    
    def save_to_file(self, path: str) -> None:
        """Save configuration to JSON file."""
        with open(path, 'w') as f:
            json.dump(self.model_dump(), f, indent=2)

# Global configuration instance
config = Config.load_from_env()

# MCP Server configurations
DEFAULT_MCP_SERVERS = {
    "filesystem": MCPServerConfig(
        name="filesystem",
        command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
        enabled=True
    ),
    "brave_search": MCPServerConfig(
        name="brave_search",
        command="npx",
        args=["-y", "@modelcontextprotocol/server-brave-search"],
        env={"BRAVE_API_KEY": os.getenv("BRAVE_API_KEY", "")},
        enabled=bool(os.getenv("BRAVE_API_KEY"))
    ),
    "sqlite": MCPServerConfig(
        name="sqlite",
        command="npx",
        args=["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./data.db"],
        enabled=True
    )
}

# Update config with default MCP servers
config.mcp_servers.update(DEFAULT_MCP_SERVERS)