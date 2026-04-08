#!/usr/bin/env python3
"""
DSPy React MCP System - Full API Implementation
Complete REST API with working endpoints for all functionality
"""

import os
import sys
import asyncio
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import DSPyReactMCPSystem
from models import HumanCreate, AgentCreate, TaskCreate, SystemStatusResponse
from agent import Agent

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="DSPy React MCP System",
    description="Advanced Human-AI Collaboration Platform",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global system instance
system = None
connected_websockets = []

# Response models
class APIResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

class HumanResponse(BaseModel):
    id: str
    name: str
    email: str
    skills: List[str]
    expertise_areas: List[str]
    created_at: datetime

class AgentResponse(BaseModel):
    id: str
    name: str
    role: str
    capabilities: List[str]
    active: bool
    created_at: datetime

class TaskResponse(BaseModel):
    id: str
    description: str
    priority: str
    assigned_to: Optional[str]
    status: str
    requires_human_approval: bool
    created_at: datetime

# Initialize system
@app.on_event("startup")
async def startup_event():
    global system
    try:
        system = DSPyReactMCPSystem()
        logger.info("DSPy React MCP System initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize system: {e}")
        system = None

# WebSocket manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                self.disconnect(connection)

manager = ConnectionManager()

# Enhanced HTML Dashboard
DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DSPy React MCP System - Live Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            min-height: 100vh; 
            color: #333;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { 
            text-align: center; 
            color: white; 
            margin-bottom: 30px; 
            background: rgba(255,255,255,0.1);
            padding: 20px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .status-indicator { 
            display: inline-block; 
            width: 12px; 
            height: 12px; 
            background: #27ae60; 
            border-radius: 50%; 
            margin-right: 10px; 
            animation: pulse 2s infinite; 
        }
        @keyframes pulse { 
            0% { opacity: 1; transform: scale(1); } 
            50% { opacity: 0.7; transform: scale(1.1); } 
            100% { opacity: 1; transform: scale(1); } 
        }
        .grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px; 
        }
        .card { 
            background: rgba(255,255,255,0.95); 
            padding: 25px; 
            border-radius: 15px; 
            box-shadow: 0 8px 25px rgba(0,0,0,0.1); 
            transition: transform 0.3s ease; 
        }
        .card:hover { transform: translateY(-5px); }
        .card h3 { color: #2c3e50; margin-bottom: 15px; font-size: 1.4em; }
        .metrics { display: flex; justify-content: space-around; margin: 15px 0; }
        .metric { text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #3498db; }
        .metric-label { font-size: 0.9em; color: #7f8c8d; }
        .btn { 
            background: linear-gradient(45deg, #3498db, #2980b9); 
            color: white; 
            padding: 12px 24px; 
            border: none; 
            border-radius: 25px; 
            cursor: pointer; 
            font-weight: bold; 
            transition: all 0.3s ease; 
            margin: 5px;
            width: 100%;
        }
        .btn:hover { 
            transform: translateY(-2px); 
            box-shadow: 0 5px 15px rgba(52, 152, 219, 0.4); 
        }
        .btn.success { background: linear-gradient(45deg, #27ae60, #229954); }
        .btn.warning { background: linear-gradient(45deg, #f39c12, #e67e22); }
        .btn.danger { background: linear-gradient(45deg, #e74c3c, #c0392b); }
        .logs { 
            background: #2c3e50; 
            color: #ecf0f1; 
            padding: 15px; 
            border-radius: 10px; 
            font-family: 'Courier New', monospace; 
            max-height: 200px; 
            overflow-y: auto; 
            margin: 15px 0;
        }
        .modal { 
            display: none; 
            position: fixed; 
            z-index: 1000; 
            left: 0; 
            top: 0; 
            width: 100%; 
            height: 100%; 
            background-color: rgba(0,0,0,0.5); 
        }
        .modal-content { 
            background-color: white; 
            margin: 5% auto; 
            padding: 30px; 
            border-radius: 15px; 
            width: 90%; 
            max-width: 500px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .close { 
            color: #aaa; 
            float: right; 
            font-size: 28px; 
            font-weight: bold; 
            cursor: pointer; 
        }
        .close:hover { color: #000; }
        .form-group { margin-bottom: 20px; }
        .form-group label { 
            display: block; 
            margin-bottom: 5px; 
            font-weight: bold; 
            color: #2c3e50; 
        }
        .form-group input, .form-group select, .form-group textarea { 
            width: 100%; 
            padding: 12px; 
            border: 2px solid #ecf0f1; 
            border-radius: 8px; 
            font-size: 14px; 
            transition: border-color 0.3s ease;
        }
        .form-group input:focus, .form-group select:focus, .form-group textarea:focus { 
            outline: none; 
            border-color: #3498db; 
        }
        .notification { 
            position: fixed; 
            top: 20px; 
            right: 20px; 
            padding: 15px 25px; 
            border-radius: 8px; 
            color: white; 
            font-weight: bold; 
            z-index: 1001; 
            opacity: 0; 
            transform: translateX(100%); 
            transition: all 0.3s ease; 
        }
        .notification.show { opacity: 1; transform: translateX(0); }
        .notification.success { background: #27ae60; }
        .notification.error { background: #e74c3c; }
        .notification.info { background: #3498db; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><span class="status-indicator"></span>DSPy React MCP System</h1>
            <p>Advanced Human-AI Collaboration Platform - Live Dashboard</p>
        </div>

        <div class="grid">
            <!-- System Metrics -->
            <div class="card">
                <h3>📊 System Metrics</h3>
                <div class="metrics">
                    <div class="metric">
                        <div class="metric-value" id="agent-count">0</div>
                        <div class="metric-label">Agents</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="human-count">0</div>
                        <div class="metric-label">Humans</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="task-count">0</div>
                        <div class="metric-label">Tasks</div>
                    </div>
                </div>
                <button class="btn" onclick="refreshMetrics()">🔄 Refresh</button>
            </div>

            <!-- Human Management -->
            <div class="card">
                <h3>👥 Human Management</h3>
                <p>Manage human team members and their capabilities</p>
                <div id="human-list"></div>
                <button class="btn success" onclick="openModal('humanModal')">➕ Add Human</button>
            </div>

            <!-- Agent Management -->
            <div class="card">
                <h3>🤖 Agent Management</h3>
                <p>Create and manage AI agents with DSPy capabilities</p>
                <div id="agent-list"></div>
                <button class="btn success" onclick="openModal('agentModal')">➕ Create Agent</button>
            </div>

            <!-- Task Management -->
            <div class="card">
                <h3>📋 Task Management</h3>
                <p>Create, assign, and track tasks across the system</p>
                <div id="task-list"></div>
                <button class="btn success" onclick="openModal('taskModal')">➕ Submit Task</button>
            </div>

            <!-- System Logs -->
            <div class="card">
                <h3>📝 System Logs</h3>
                <div class="logs" id="system-logs">
                    [System initialized] Waiting for activity...
                </div>
                <button class="btn warning" onclick="clearLogs()">🗑️ Clear Logs</button>
            </div>

            <!-- MCP Servers -->
            <div class="card">
                <h3>🔧 MCP Servers</h3>
                <p>Monitor Model Context Protocol server status</p>
                <div id="mcp-status">No servers configured</div>
                <button class="btn" onclick="refreshMCPStatus()">🔄 Refresh</button>
            </div>
        </div>
    </div>

    <!-- Modals -->
    <!-- Human Modal -->
    <div id="humanModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('humanModal')">&times;</span>
            <h2>Add New Human</h2>
            <form id="humanForm">
                <div class="form-group">
                    <label for="humanName">Name:</label>
                    <input type="text" id="humanName" required>
                </div>
                <div class="form-group">
                    <label for="humanEmail">Email:</label>
                    <input type="email" id="humanEmail" required>
                </div>
                <div class="form-group">
                    <label for="humanSkills">Skills (comma-separated):</label>
                    <input type="text" id="humanSkills" placeholder="Python, AI, Project Management">
                </div>
                <div class="form-group">
                    <label for="humanExpertise">Expertise Areas (comma-separated):</label>
                    <input type="text" id="humanExpertise" placeholder="Machine Learning, Software Development">
                </div>
                <button type="submit" class="btn success">Add Human</button>
            </form>
        </div>
    </div>

    <!-- Agent Modal -->
    <div id="agentModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('agentModal')">&times;</span>
            <h2>Create New Agent</h2>
            <form id="agentForm">
                <div class="form-group">
                    <label for="agentName">Agent Name:</label>
                    <input type="text" id="agentName" required>
                </div>
                <div class="form-group">
                    <label for="agentRole">Role:</label>
                    <select id="agentRole" required>
                        <option value="">Select Role</option>
                        <option value="analyst">Data Analyst</option>
                        <option value="researcher">Researcher</option>
                        <option value="coordinator">Task Coordinator</option>
                        <option value="specialist">Domain Specialist</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="agentCapabilities">Capabilities (comma-separated):</label>
                    <input type="text" id="agentCapabilities" placeholder="data_analysis, web_search, code_generation">
                </div>
                <button type="submit" class="btn success">Create Agent</button>
            </form>
        </div>
    </div>

    <!-- Task Modal -->
    <div id="taskModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('taskModal')">&times;</span>
            <h2>Submit New Task</h2>
            <form id="taskForm">
                <div class="form-group">
                    <label for="taskDescription">Task Description:</label>
                    <textarea id="taskDescription" rows="4" required placeholder="Describe the task to be completed..."></textarea>
                </div>
                <div class="form-group">
                    <label for="taskPriority">Priority:</label>
                    <select id="taskPriority" required>
                        <option value="low">Low</option>
                        <option value="normal" selected>Normal</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="taskAssignee">Assign to:</label>
                    <select id="taskAssignee">
                        <option value="">Auto-assign</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="taskApproval"> Requires Human Approval
                    </label>
                </div>
                <button type="submit" class="btn success">Submit Task</button>
            </form>
        </div>
    </div>

    <!-- Notification -->
    <div id="notification" class="notification"></div>

    <script>
        // WebSocket connection
        let ws = null;
        
        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
            
            ws.onopen = function(event) {
                console.log('WebSocket connected');
                addLog('WebSocket connected to system');
            };
            
            ws.onmessage = function(event) {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            };
            
            ws.onclose = function(event) {
                console.log('WebSocket disconnected');
                addLog('WebSocket disconnected');
                // Reconnect after 3 seconds
                setTimeout(connectWebSocket, 3000);
            };
        }
        
        function handleWebSocketMessage(data) {
            if (data.type === 'metrics_update') {
                updateMetrics(data.data);
            } else if (data.type === 'log') {
                addLog(data.message);
            } else if (data.type === 'notification') {
                showNotification(data.message, data.level || 'info');
            }
        }
        
        // API functions
        async function apiCall(endpoint, method = 'GET', data = null) {
            try {
                const options = {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                    }
                };
                
                if (data) {
                    options.body = JSON.stringify(data);
                }
                
                const response = await fetch(endpoint, options);
                const result = await response.json();
                
                if (!response.ok) {
                    throw new Error(result.message || 'API call failed');
                }
                
                return result;
            } catch (error) {
                console.error('API call failed:', error);
                showNotification(`API Error: ${error.message}`, 'error');
                throw error;
            }
        }
        
        // Modal functions
        function openModal(modalId) {
            document.getElementById(modalId).style.display = 'block';
            if (modalId === 'taskModal') {
                loadAssigneeOptions();
            }
        }
        
        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
        }
        
        // Form handlers
        document.getElementById('humanForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = {
                name: document.getElementById('humanName').value,
                email: document.getElementById('humanEmail').value,
                skills: document.getElementById('humanSkills').value.split(',').map(s => s.trim()).filter(s => s),
                expertise_areas: document.getElementById('humanExpertise').value.split(',').map(s => s.trim()).filter(s => s)
            };
            
            try {
                const result = await apiCall('/api/humans', 'POST', formData);
                showNotification('Human added successfully!', 'success');
                closeModal('humanModal');
                document.getElementById('humanForm').reset();
                refreshMetrics();
                loadHumans();
            } catch (error) {
                // Error already handled in apiCall
            }
        });
        
        document.getElementById('agentForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = {
                name: document.getElementById('agentName').value,
                role: document.getElementById('agentRole').value,
                capabilities: document.getElementById('agentCapabilities').value.split(',').map(s => s.trim()).filter(s => s)
            };
            
            try {
                const result = await apiCall('/api/agents', 'POST', formData);
                showNotification('Agent created successfully!', 'success');
                closeModal('agentModal');
                document.getElementById('agentForm').reset();
                refreshMetrics();
                loadAgents();
            } catch (error) {
                // Error already handled in apiCall
            }
        });
        
        document.getElementById('taskForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = {
                description: document.getElementById('taskDescription').value,
                priority: document.getElementById('taskPriority').value,
                assigned_to: document.getElementById('taskAssignee').value || null,
                requires_human_approval: document.getElementById('taskApproval').checked
            };
            
            try {
                const result = await apiCall('/api/tasks', 'POST', formData);
                showNotification('Task submitted successfully!', 'success');
                closeModal('taskModal');
                document.getElementById('taskForm').reset();
                refreshMetrics();
                loadTasks();
            } catch (error) {
                // Error already handled in apiCall
            }
        });
        
        // Data loading functions
        async function refreshMetrics() {
            try {
                const result = await apiCall('/api/system/status');
                updateMetrics(result);
            } catch (error) {
                // Error already handled in apiCall
            }
        }
        
        function updateMetrics(data) {
            document.getElementById('agent-count').textContent = data.total_agents || 0;
            document.getElementById('human-count').textContent = data.total_humans || 0;
            document.getElementById('task-count').textContent = data.total_tasks || 0;
        }
        
        async function loadHumans() {
            try {
                const result = await apiCall('/api/humans');
                const humanList = document.getElementById('human-list');
                if (result.data && result.data.length > 0) {
                    humanList.innerHTML = result.data.map(human => 
                        `<div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                            <strong>${human.name}</strong> (${human.email})<br>
                            <small>Skills: ${human.skills.join(', ')}</small>
                        </div>`
                    ).join('');
                } else {
                    humanList.innerHTML = '<p>No humans added yet</p>';
                }
            } catch (error) {
                // Error already handled in apiCall
            }
        }
        
        async function loadAgents() {
            try {
                const result = await apiCall('/api/agents');
                const agentList = document.getElementById('agent-list');
                if (result.data && result.data.length > 0) {
                    agentList.innerHTML = result.data.map(agent => 
                        `<div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                            <strong>${agent.name}</strong> (${agent.role})<br>
                            <small>Status: ${agent.active ? 'Active' : 'Inactive'}</small>
                        </div>`
                    ).join('');
                } else {
                    agentList.innerHTML = '<p>No agents created yet</p>';
                }
            } catch (error) {
                // Error already handled in apiCall
            }
        }
        
        async function loadTasks() {
            try {
                const result = await apiCall('/api/tasks');
                const taskList = document.getElementById('task-list');
                if (result.data && result.data.length > 0) {
                    taskList.innerHTML = result.data.map(task => 
                        `<div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                            <strong>${task.description.substring(0, 50)}...</strong><br>
                            <small>Priority: ${task.priority} | Status: ${task.status}</small>
                        </div>`
                    ).join('');
                } else {
                    taskList.innerHTML = '<p>No tasks submitted yet</p>';
                }
            } catch (error) {
                // Error already handled in apiCall
            }
        }
        
        async function loadAssigneeOptions() {
            try {
                const [agentsResult, humansResult] = await Promise.all([
                    apiCall('/api/agents'),
                    apiCall('/api/humans')
                ]);
                
                const select = document.getElementById('taskAssignee');
                select.innerHTML = '<option value="">Auto-assign</option>';
                
                if (agentsResult.data) {
                    agentsResult.data.forEach(agent => {
                        select.innerHTML += `<option value="agent:${agent.id}">Agent: ${agent.name}</option>`;
                    });
                }
                
                if (humansResult.data) {
                    humansResult.data.forEach(human => {
                        select.innerHTML += `<option value="human:${human.id}">Human: ${human.name}</option>`;
                    });
                }
            } catch (error) {
                // Error already handled in apiCall
            }
        }
        
        // Utility functions
        function addLog(message) {
            const logs = document.getElementById('system-logs');
            const timestamp = new Date().toLocaleTimeString();
            logs.innerHTML += `<div>[${timestamp}] ${message}</div>`;
            logs.scrollTop = logs.scrollHeight;
        }
        
        function clearLogs() {
            document.getElementById('system-logs').innerHTML = '[System logs cleared]';
        }
        
        function showNotification(message, type = 'info') {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.className = `notification ${type} show`;
            
            setTimeout(() => {
                notification.classList.remove('show');
            }, 3000);
        }
        
        function refreshMCPStatus() {
            document.getElementById('mcp-status').innerHTML = 'Checking MCP servers...';
            // This would be implemented with actual MCP server status
            setTimeout(() => {
                document.getElementById('mcp-status').innerHTML = 'No active MCP servers';
            }, 1000);
        }
        
        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            connectWebSocket();
            refreshMetrics();
            loadHumans();
            loadAgents();
            loadTasks();
            
            // Auto-refresh every 30 seconds
            setInterval(refreshMetrics, 30000);
        });
        
        // Close modals when clicking outside
        window.onclick = function(event) {
            if (event.target.classList.contains('modal')) {
                event.target.style.display = 'none';
            }
        }
    </script>
</body>
</html>
"""

# Routes
@app.get("/", response_class=HTMLResponse)
async def dashboard():
    return DASHBOARD_HTML

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming WebSocket messages if needed
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/system/status", response_model=SystemStatusResponse)
async def get_system_status():
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    return SystemStatusResponse(
        status="running",
        uptime=0.0,
        total_agents=len(system.agents),
        total_humans=len(system.human_agent_system.humans),
        total_tasks=len(getattr(system, 'tasks', [])),
        active_agents=len([a for a in system.agents if a.state.active]),
        pending_tasks=0,
        completed_tasks=0,
        failed_tasks=0,
        mcp_servers_running=0,
        last_updated=datetime.utcnow()
    )

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow(),
        "system_initialized": system is not None
    }

# Human Management
@app.post("/api/humans", response_model=APIResponse)
async def create_human(human_data: HumanCreate):
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        # Create human record
        human_id = str(uuid4())
        human_record = {
            "id": human_id,
            "name": human_data.name,
            "email": human_data.email,
            "skills": human_data.skills,
            "expertise_areas": human_data.expertise_areas,
            "created_at": datetime.utcnow()
        }
        
        # Add to system
        system.human_agent_system.humans.append(human_record)
        
        # Broadcast update
        await manager.broadcast({
            "type": "log",
            "message": f"Human added: {human_data.name}"
        })
        
        return APIResponse(
            success=True,
            message="Human added successfully",
            data=human_record
        )
    except Exception as e:
        logger.error(f"Error creating human: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/humans", response_model=APIResponse)
async def get_humans():
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    return APIResponse(
        success=True,
        message="Humans retrieved successfully",
        data=system.human_agent_system.humans
    )

# Agent Management
@app.post("/api/agents", response_model=APIResponse)
async def create_agent(agent_data: AgentCreate):
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        # Create new agent
        agent = Agent(
            name=agent_data.name,
            role=agent_data.role,
            capabilities=agent_data.capabilities
        )
        
        # Add to system
        system.agents.append(agent)
        
        # Broadcast update
        await manager.broadcast({
            "type": "log",
            "message": f"Agent created: {agent_data.name}"
        })
        
        agent_record = {
            "id": agent.id,
            "name": agent.name,
            "role": agent_data.role,
            "capabilities": agent_data.capabilities,
            "active": agent.state.active,
            "created_at": datetime.utcnow()
        }
        
        return APIResponse(
            success=True,
            message="Agent created successfully",
            data=agent_record
        )
    except Exception as e:
        logger.error(f"Error creating agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/agents", response_model=APIResponse)
async def get_agents():
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    agents_data = []
    for agent in system.agents:
        agents_data.append({
            "id": agent.id,
            "name": agent.name,
            "role": getattr(agent, 'role', 'Unknown'),
            "capabilities": getattr(agent, 'capabilities', []),
            "active": agent.state.active,
            "created_at": datetime.utcnow()
        })
    
    return APIResponse(
        success=True,
        message="Agents retrieved successfully",
        data=agents_data
    )

# Task Management
@app.post("/api/tasks", response_model=APIResponse)
async def create_task(task_data: TaskCreate):
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        # Create task record
        task_id = str(uuid4())
        task_record = {
            "id": task_id,
            "description": task_data.description,
            "priority": task_data.priority,
            "assigned_to": task_data.assigned_to,
            "status": "pending",
            "requires_human_approval": task_data.requires_human_approval,
            "created_at": datetime.utcnow()
        }
        
        # Add to system tasks (create if doesn't exist)
        if not hasattr(system, 'tasks'):
            system.tasks = []
        system.tasks.append(task_record)
        
        # Try to assign task to an agent
        if system.agents:
            agent = system.agents[0]  # Simple assignment to first agent
            try:
                await agent.receive_task(task_data.description, task_data.priority)
                task_record["status"] = "assigned"
                task_record["assigned_to"] = agent.id
            except Exception as e:
                logger.warning(f"Could not assign task to agent: {e}")
        
        # Broadcast update
        await manager.broadcast({
            "type": "log",
            "message": f"Task created: {task_data.description[:50]}..."
        })
        
        return APIResponse(
            success=True,
            message="Task created successfully",
            data=task_record
        )
    except Exception as e:
        logger.error(f"Error creating task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tasks", response_model=APIResponse)
async def get_tasks():
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    tasks = getattr(system, 'tasks', [])
    return APIResponse(
        success=True,
        message="Tasks retrieved successfully",
        data=tasks
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=59381, log_level="info")