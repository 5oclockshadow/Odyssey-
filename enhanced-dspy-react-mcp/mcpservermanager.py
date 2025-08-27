"""MCP Server Manager for runtime async tool availability and cleanup."""

import asyncio
import json
import logging
import os
import subprocess
import signal
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Callable
from contextlib import asynccontextmanager

from models import MCPServerConfig, MCPServerStatus, MCPTool
from config import config


logger = logging.getLogger(__name__)


class MCPServerManager:
    """Manages MCP servers with runtime async tool availability and cleanup."""
    
    def __init__(self, config_path: Optional[str] = None):
        """Initialize the MCP server manager."""
        self.servers: Dict[str, MCPServerStatus] = {}
        self.processes: Dict[str, subprocess.Popen] = {}
        self.config_path = config_path or "./mcp_config.json"
        self.running = False
        self.cleanup_interval = 30  # seconds
        self.heartbeat_timeout = 60  # seconds
        self._cleanup_task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        self.tool_callbacks: Dict[str, Callable] = {}
        
    async def start(self) -> None:
        """Start the MCP server manager."""
        logger.info("Starting MCP Server Manager")
        self.running = True
        
        # Load server configurations
        await self.load_server_configs()
        
        # Start configured servers
        await self.start_all_servers()
        
        # Start background tasks
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        
        logger.info("MCP Server Manager started successfully")
    
    async def stop(self) -> None:
        """Stop the MCP server manager and cleanup."""
        logger.info("Stopping MCP Server Manager")
        self.running = False
        
        # Cancel background tasks
        if self._cleanup_task:
            self._cleanup_task.cancel()
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
        
        # Stop all servers
        await self.stop_all_servers()
        
        logger.info("MCP Server Manager stopped")
    
    async def load_server_configs(self) -> None:
        """Load server configurations from file or config."""
        try:
            if Path(self.config_path).exists():
                with open(self.config_path, 'r') as f:
                    server_configs = json.load(f)
                
                for name, server_config in server_configs.items():
                    config.mcp_servers[name] = MCPServerConfig(**server_config)
            
            # Initialize server statuses
            for name, server_config in config.mcp_servers.items():
                if server_config.enabled:
                    self.servers[name] = MCPServerStatus(name=name)
                    
        except Exception as e:
            logger.error(f"Failed to load server configs: {e}")
    
    async def start_server(self, name: str) -> bool:
        """Start a specific MCP server."""
        if name not in config.mcp_servers:
            logger.error(f"Server config not found: {name}")
            return False
        
        server_config = config.mcp_servers[name]
        if not server_config.enabled:
            logger.info(f"Server {name} is disabled")
            return False
        
        try:
            # Prepare environment
            env = {**server_config.env}
            
            # Start the process
            process = subprocess.Popen(
                [server_config.command] + server_config.args,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid if hasattr(os, 'setsid') else None
            )
            
            self.processes[name] = process
            
            # Update server status
            if name in self.servers:
                self.servers[name].running = True
                self.servers[name].pid = process.pid
                self.servers[name].last_heartbeat = datetime.utcnow()
                self.servers[name].error = None
            
            # Discover tools
            await self._discover_tools(name)
            
            logger.info(f"Started MCP server: {name} (PID: {process.pid})")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start server {name}: {e}")
            if name in self.servers:
                self.servers[name].running = False
                self.servers[name].error = str(e)
            return False
    
    async def stop_server(self, name: str) -> bool:
        """Stop a specific MCP server."""
        if name not in self.processes:
            return True
        
        try:
            process = self.processes[name]
            
            # Try graceful shutdown first
            if hasattr(os, 'killpg'):
                os.killpg(os.getpgid(process.pid), signal.SIGTERM)
            else:
                process.terminate()
            
            # Wait for graceful shutdown
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                # Force kill if graceful shutdown fails
                if hasattr(os, 'killpg'):
                    os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                else:
                    process.kill()
                process.wait()
            
            del self.processes[name]
            
            # Update server status
            if name in self.servers:
                self.servers[name].running = False
                self.servers[name].pid = None
                self.servers[name].tools = []
            
            logger.info(f"Stopped MCP server: {name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to stop server {name}: {e}")
            return False
    
    async def start_all_servers(self) -> None:
        """Start all enabled servers."""
        tasks = []
        for name in config.mcp_servers:
            if config.mcp_servers[name].enabled:
                tasks.append(self.start_server(name))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def stop_all_servers(self) -> None:
        """Stop all running servers."""
        tasks = []
        for name in list(self.processes.keys()):
            tasks.append(self.stop_server(name))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def restart_server(self, name: str) -> bool:
        """Restart a specific server."""
        await self.stop_server(name)
        await asyncio.sleep(1)  # Brief pause
        return await self.start_server(name)
    
    async def get_available_tools(self) -> List[MCPTool]:
        """Get all available tools from running servers."""
        tools = []
        for server_status in self.servers.values():
            if server_status.running:
                tools.extend(server_status.tools)
        return tools
    
    async def execute_tool(self, tool_name: str, parameters: Dict[str, Any]) -> Any:
        """Execute a tool on the appropriate server."""
        # Find the server that provides this tool
        server_name = None
        for name, server_status in self.servers.items():
            if server_status.running:
                for tool in server_status.tools:
                    if tool.name == tool_name:
                        server_name = name
                        break
                if server_name:
                    break
        
        if not server_name:
            raise ValueError(f"Tool {tool_name} not found or server not running")
        
        # Execute the tool (this would need to be implemented based on MCP protocol)
        # For now, return a placeholder
        return {"result": f"Executed {tool_name} with {parameters}"}
    
    async def register_tool_callback(self, tool_name: str, callback: Callable) -> None:
        """Register a callback for tool execution."""
        self.tool_callbacks[tool_name] = callback
    
    async def _discover_tools(self, server_name: str) -> None:
        """Discover tools available from a server."""
        # This would implement the MCP protocol to discover tools
        # For now, we'll add some mock tools based on server type
        if server_name not in self.servers:
            return
        
        mock_tools = []
        if server_name == "filesystem":
            mock_tools = [
                MCPTool(
                    name="read_file",
                    description="Read contents of a file",
                    input_schema={"type": "object", "properties": {"path": {"type": "string"}}},
                    server_name=server_name
                ),
                MCPTool(
                    name="write_file",
                    description="Write contents to a file",
                    input_schema={
                        "type": "object",
                        "properties": {
                            "path": {"type": "string"},
                            "content": {"type": "string"}
                        }
                    },
                    server_name=server_name
                ),
                MCPTool(
                    name="list_directory",
                    description="List contents of a directory",
                    input_schema={"type": "object", "properties": {"path": {"type": "string"}}},
                    server_name=server_name
                )
            ]
        elif server_name == "brave_search":
            mock_tools = [
                MCPTool(
                    name="web_search",
                    description="Search the web using Brave Search",
                    input_schema={
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "count": {"type": "integer", "default": 10}
                        }
                    },
                    server_name=server_name
                )
            ]
        elif server_name == "sqlite":
            mock_tools = [
                MCPTool(
                    name="execute_query",
                    description="Execute SQL query",
                    input_schema={
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "parameters": {"type": "array"}
                        }
                    },
                    server_name=server_name
                )
            ]
        
        self.servers[server_name].tools = mock_tools
    
    async def _cleanup_loop(self) -> None:
        """Background cleanup loop."""
        while self.running:
            try:
                await self._cleanup_dead_processes()
                await asyncio.sleep(self.cleanup_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")
                await asyncio.sleep(self.cleanup_interval)
    
    async def _heartbeat_loop(self) -> None:
        """Background heartbeat loop."""
        while self.running:
            try:
                await self._check_server_health()
                await asyncio.sleep(self.heartbeat_timeout // 2)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}")
                await asyncio.sleep(self.heartbeat_timeout // 2)
    
    async def _cleanup_dead_processes(self) -> None:
        """Clean up dead processes."""
        dead_servers = []
        
        for name, process in self.processes.items():
            if process.poll() is not None:  # Process has terminated
                dead_servers.append(name)
        
        for name in dead_servers:
            logger.warning(f"Detected dead server process: {name}")
            del self.processes[name]
            if name in self.servers:
                self.servers[name].running = False
                self.servers[name].pid = None
                self.servers[name].error = "Process terminated unexpectedly"
    
    async def _check_server_health(self) -> None:
        """Check health of running servers."""
        current_time = datetime.utcnow()
        
        for name, server_status in self.servers.items():
            if server_status.running and server_status.last_heartbeat:
                time_since_heartbeat = current_time - server_status.last_heartbeat
                if time_since_heartbeat > timedelta(seconds=self.heartbeat_timeout):
                    logger.warning(f"Server {name} heartbeat timeout")
                    # Attempt to restart the server
                    await self.restart_server(name)
    
    @asynccontextmanager
    async def server_context(self, server_names: List[str]):
        """Context manager for temporary server usage."""
        started_servers = []
        
        try:
            # Start requested servers
            for name in server_names:
                if await self.start_server(name):
                    started_servers.append(name)
            
            yield self
            
        finally:
            # Stop started servers
            for name in started_servers:
                await self.stop_server(name)
    
    def get_server_status(self, name: str) -> Optional[MCPServerStatus]:
        """Get status of a specific server."""
        return self.servers.get(name)
    
    def get_all_server_statuses(self) -> Dict[str, MCPServerStatus]:
        """Get status of all servers."""
        return self.servers.copy()
    
    async def reload_config(self) -> None:
        """Reload server configurations."""
        await self.load_server_configs()
        
        # Restart servers with updated configs
        for name in config.mcp_servers:
            if config.mcp_servers[name].enabled and name not in self.processes:
                await self.start_server(name)
            elif not config.mcp_servers[name].enabled and name in self.processes:
                await self.stop_server(name)