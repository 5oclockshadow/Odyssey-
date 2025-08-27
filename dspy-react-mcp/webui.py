#!/usr/bin/env python3
"""
Web UI for DSPy React MCP System
Provides a browser-based interface for managing agents and human-agent relationships.
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from main import DSPyReactMCPSystem
from models import AgentRoleType, AgentHumanRelationType, TaskStatus

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global system instance
system: Optional[DSPyReactMCPSystem] = None

# FastAPI app
app = FastAPI(
    title="DSPy React MCP System Web UI",
    description="Web interface for managing human-agent relationships and multi-agent systems",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connections for real-time updates
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except:
                pass

manager = ConnectionManager()

# Pydantic models for API
class HumanCreate(BaseModel):
    name: str
    email: Optional[str] = None
    skills: List[str] = []
    expertise_areas: List[str] = []

class AgentCreate(BaseModel):
    role_type: AgentRoleType
    relationship_type: AgentHumanRelationType
    human_id: Optional[str] = None
    collaboration_rules: Dict[str, Any] = {}
    proxy_rules: Dict[str, Any] = {}

class TaskCreate(BaseModel):
    description: str
    agent_id: Optional[str] = None
    priority: int = 1
    requires_human_approval: bool = False

# API Routes
@app.on_event("startup")
async def startup_event():
    """Initialize the system on startup."""
    global system
    try:
        system = DSPyReactMCPSystem()
        # Start system without the blocking monitoring loop
        await system._initialize_system()
        logger.info("DSPy React MCP System started successfully")
        
        # Broadcast system started
        await manager.broadcast({
            "type": "system_status",
            "status": "started",
            "timestamp": datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.error(f"Failed to start system: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Clean shutdown of the system."""
    global system
    if system:
        try:
            await system.stop()
            logger.info("DSPy React MCP System stopped")
        except Exception as e:
            logger.error(f"Error stopping system: {e}")

@app.get("/", response_class=HTMLResponse)
async def get_dashboard():
    """Serve the main dashboard."""
    html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DSPy React MCP System</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { 
            background: rgba(255,255,255,0.95); 
            padding: 20px; 
            border-radius: 15px; 
            margin-bottom: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            backdrop-filter: blur(10px);
        }
        .header h1 { color: #4a5568; margin-bottom: 10px; }
        .status-badge { 
            display: inline-block; 
            padding: 5px 15px; 
            border-radius: 20px; 
            font-size: 12px; 
            font-weight: bold;
            text-transform: uppercase;
        }
        .status-running { background: #48bb78; color: white; }
        .status-stopped { background: #f56565; color: white; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { 
            background: rgba(255,255,255,0.95); 
            padding: 20px; 
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            backdrop-filter: blur(10px);
        }
        .card h3 { color: #2d3748; margin-bottom: 15px; }
        .btn { 
            background: #4299e1; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            border-radius: 8px; 
            cursor: pointer;
            margin: 5px;
            transition: all 0.3s ease;
        }
        .btn:hover { background: #3182ce; transform: translateY(-2px); }
        .btn-success { background: #48bb78; }
        .btn-success:hover { background: #38a169; }
        .btn-danger { background: #f56565; }
        .btn-danger:hover { background: #e53e3e; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: 600; }
        .form-group input, .form-group select, .form-group textarea { 
            width: 100%; 
            padding: 10px; 
            border: 2px solid #e2e8f0; 
            border-radius: 8px;
            transition: border-color 0.3s ease;
        }
        .form-group input:focus, .form-group select:focus, .form-group textarea:focus { 
            outline: none; 
            border-color: #4299e1; 
        }
        .agent-item, .human-item, .task-item { 
            background: #f7fafc; 
            padding: 15px; 
            margin: 10px 0; 
            border-radius: 10px;
            border-left: 4px solid #4299e1;
        }
        .agent-boss { border-left-color: #9f7aea; }
        .agent-specialist { border-left-color: #4299e1; }
        .agent-worker { border-left-color: #48bb78; }
        .relationship-pure { background: linear-gradient(90deg, #e6fffa, #f0fff4); }
        .relationship-pair { background: linear-gradient(90deg, #fef5e7, #fff5f5); }
        .relationship-proxy { background: linear-gradient(90deg, #edf2f7, #f7fafc); }
        .metrics { display: flex; justify-content: space-around; text-align: center; }
        .metric { padding: 10px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #4299e1; }
        .metric-label { font-size: 12px; color: #718096; text-transform: uppercase; }
        .log-container { 
            background: #1a202c; 
            color: #e2e8f0; 
            padding: 15px; 
            border-radius: 10px; 
            height: 200px; 
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 12px;
        }
        .modal { 
            display: none; 
            position: fixed; 
            z-index: 1000; 
            left: 0; 
            top: 0; 
            width: 100%; 
            height: 100%; 
            background: rgba(0,0,0,0.5);
        }
        .modal-content { 
            background: white; 
            margin: 5% auto; 
            padding: 20px; 
            border-radius: 15px; 
            width: 90%; 
            max-width: 500px;
        }
        .close { 
            color: #aaa; 
            float: right; 
            font-size: 28px; 
            font-weight: bold; 
            cursor: pointer;
        }
        .close:hover { color: #000; }
        .loading { 
            display: inline-block; 
            width: 20px; 
            height: 20px; 
            border: 3px solid #f3f3f3; 
            border-top: 3px solid #4299e1; 
            border-radius: 50%; 
            animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .toast { 
            position: fixed; 
            top: 20px; 
            right: 20px; 
            padding: 15px 20px; 
            border-radius: 10px; 
            color: white; 
            z-index: 1001;
            transform: translateX(400px);
            transition: transform 0.3s ease;
        }
        .toast.show { transform: translateX(0); }
        .toast-success { background: #48bb78; }
        .toast-error { background: #f56565; }
        .toast-info { background: #4299e1; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 DSPy React MCP System</h1>
            <p>Advanced Human-AI Collaboration Platform</p>
            <span id="systemStatus" class="status-badge status-running">System Running</span>
        </div>

        <div class="grid">
            <!-- System Metrics -->
            <div class="card">
                <h3>📊 System Metrics</h3>
                <div class="metrics" id="systemMetrics">
                    <div class="metric">
                        <div class="metric-value" id="totalAgents">0</div>
                        <div class="metric-label">Total Agents</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="totalHumans">0</div>
                        <div class="metric-label">Humans</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="totalTasks">0</div>
                        <div class="metric-label">Tasks</div>
                    </div>
                </div>
                <button class="btn" onclick="refreshMetrics()">🔄 Refresh</button>
            </div>

            <!-- Human Management -->
            <div class="card">
                <h3>👥 Human Management</h3>
                <button class="btn btn-success" onclick="showAddHumanModal()">➕ Add Human</button>
                <div id="humansList"></div>
            </div>

            <!-- Agent Management -->
            <div class="card">
                <h3>🤖 Agent Management</h3>
                <button class="btn btn-success" onclick="showAddAgentModal()">➕ Create Agent</button>
                <div id="agentsList"></div>
            </div>

            <!-- Task Management -->
            <div class="card">
                <h3>📋 Task Management</h3>
                <button class="btn btn-success" onclick="showAddTaskModal()">➕ Submit Task</button>
                <div id="tasksList"></div>
            </div>

            <!-- System Logs -->
            <div class="card">
                <h3>📝 System Logs</h3>
                <div class="log-container" id="systemLogs"></div>
                <button class="btn" onclick="clearLogs()">🗑️ Clear Logs</button>
            </div>

            <!-- MCP Servers -->
            <div class="card">
                <h3>🔧 MCP Servers</h3>
                <div id="mcpServersList"></div>
                <button class="btn" onclick="refreshMCPServers()">🔄 Refresh</button>
            </div>
        </div>
    </div>

    <!-- Add Human Modal -->
    <div id="addHumanModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('addHumanModal')">&times;</span>
            <h3>Add New Human</h3>
            <form id="addHumanForm">
                <div class="form-group">
                    <label>Name:</label>
                    <input type="text" id="humanName" required>
                </div>
                <div class="form-group">
                    <label>Email:</label>
                    <input type="email" id="humanEmail">
                </div>
                <div class="form-group">
                    <label>Skills (comma-separated):</label>
                    <input type="text" id="humanSkills" placeholder="data_analysis, project_management">
                </div>
                <div class="form-group">
                    <label>Expertise Areas (comma-separated):</label>
                    <input type="text" id="humanExpertise" placeholder="business_intelligence, leadership">
                </div>
                <button type="submit" class="btn btn-success">Add Human</button>
            </form>
        </div>
    </div>

    <!-- Add Agent Modal -->
    <div id="addAgentModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('addAgentModal')">&times;</span>
            <h3>Create New Agent</h3>
            <form id="addAgentForm">
                <div class="form-group">
                    <label>Role Type:</label>
                    <select id="agentRole" required>
                        <option value="boss">Boss</option>
                        <option value="worker">Worker</option>
                        <option value="specialist">Specialist</option>
                        <option value="coordinator">Coordinator</option>
                        <option value="analyst">Analyst</option>
                        <option value="executor">Executor</option>
                        <option value="researcher">Researcher</option>
                        <option value="communicator">Communicator</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Relationship Type:</label>
                    <select id="agentRelationship" required onchange="toggleHumanSelection()">
                        <option value="pure_agent">Pure Agent</option>
                        <option value="human_agent_pair">Human-Agent Pair</option>
                        <option value="human_proxy_agent">Human Proxy Agent</option>
                    </select>
                </div>
                <div class="form-group" id="humanSelectionGroup" style="display: none;">
                    <label>Select Human:</label>
                    <select id="selectedHuman"></select>
                </div>
                <button type="submit" class="btn btn-success">Create Agent</button>
            </form>
        </div>
    </div>

    <!-- Add Task Modal -->
    <div id="addTaskModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('addTaskModal')">&times;</span>
            <h3>Submit New Task</h3>
            <form id="addTaskForm">
                <div class="form-group">
                    <label>Task Description:</label>
                    <textarea id="taskDescription" rows="3" required></textarea>
                </div>
                <div class="form-group">
                    <label>Assign to Agent (optional):</label>
                    <select id="taskAgent">
                        <option value="">Auto-assign</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Priority:</label>
                    <select id="taskPriority">
                        <option value="1">Low</option>
                        <option value="2" selected>Normal</option>
                        <option value="3">High</option>
                        <option value="4">Critical</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="requiresApproval"> Requires Human Approval
                    </label>
                </div>
                <button type="submit" class="btn btn-success">Submit Task</button>
            </form>
        </div>
    </div>

    <script>
        // WebSocket connection for real-time updates
        let ws = null;
        let logs = [];

        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
            
            ws.onopen = function() {
                addLog('Connected to system', 'info');
            };
            
            ws.onmessage = function(event) {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            };
            
            ws.onclose = function() {
                addLog('Disconnected from system', 'error');
                setTimeout(connectWebSocket, 5000); // Reconnect after 5 seconds
            };
        }

        function handleWebSocketMessage(data) {
            switch(data.type) {
                case 'system_status':
                    updateSystemStatus(data.status);
                    break;
                case 'agent_created':
                    addLog(`Agent created: ${data.agent_id}`, 'success');
                    refreshAgents();
                    refreshMetrics();
                    break;
                case 'human_added':
                    addLog(`Human added: ${data.human_name}`, 'success');
                    refreshHumans();
                    refreshMetrics();
                    break;
                case 'task_submitted':
                    addLog(`Task submitted: ${data.task_id}`, 'info');
                    refreshTasks();
                    refreshMetrics();
                    break;
                case 'log':
                    addLog(data.message, data.level);
                    break;
            }
        }

        function addLog(message, level = 'info') {
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = `[${timestamp}] ${message}`;
            logs.push(logEntry);
            
            const logsContainer = document.getElementById('systemLogs');
            const logElement = document.createElement('div');
            logElement.textContent = logEntry;
            logElement.style.color = level === 'error' ? '#f56565' : level === 'success' ? '#48bb78' : '#e2e8f0';
            logsContainer.appendChild(logElement);
            logsContainer.scrollTop = logsContainer.scrollHeight;
            
            // Keep only last 100 logs
            if (logs.length > 100) {
                logs.shift();
                logsContainer.removeChild(logsContainer.firstChild);
            }
        }

        function showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            document.body.appendChild(toast);
            
            setTimeout(() => toast.classList.add('show'), 100);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => document.body.removeChild(toast), 300);
            }, 3000);
        }

        async function apiCall(endpoint, method = 'GET', data = null) {
            try {
                const options = {
                    method,
                    headers: { 'Content-Type': 'application/json' }
                };
                if (data) options.body = JSON.stringify(data);
                
                const response = await fetch(endpoint, options);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } catch (error) {
                showToast(`API Error: ${error.message}`, 'error');
                throw error;
            }
        }

        async function refreshMetrics() {
            try {
                const status = await apiCall('/api/system/status');
                document.getElementById('totalAgents').textContent = status.total_agents || 0;
                document.getElementById('totalHumans').textContent = status.total_humans || 0;
                document.getElementById('totalTasks').textContent = status.total_tasks || 0;
            } catch (error) {
                console.error('Failed to refresh metrics:', error);
            }
        }

        async function refreshHumans() {
            try {
                const humans = await apiCall('/api/humans');
                const container = document.getElementById('humansList');
                container.innerHTML = '';
                
                humans.forEach(human => {
                    const div = document.createElement('div');
                    div.className = 'human-item';
                    div.innerHTML = `
                        <strong>${human.name}</strong>
                        <br><small>Skills: ${human.skills.join(', ') || 'None'}</small>
                        <br><small>Expertise: ${human.expertise_areas.join(', ') || 'None'}</small>
                    `;
                    container.appendChild(div);
                });
            } catch (error) {
                console.error('Failed to refresh humans:', error);
            }
        }

        async function refreshAgents() {
            try {
                const agents = await apiCall('/api/agents');
                const container = document.getElementById('agentsList');
                container.innerHTML = '';
                
                agents.forEach(agent => {
                    const div = document.createElement('div');
                    div.className = `agent-item agent-${agent.role_type} relationship-${agent.relationship_type.replace('_', '-')}`;
                    div.innerHTML = `
                        <strong>Agent ${agent.number}</strong> (${agent.role_type})
                        <br><small>Relationship: ${agent.relationship_type}</small>
                        <br><small>Status: ${agent.status}</small>
                        ${agent.human_name ? `<br><small>Paired with: ${agent.human_name}</small>` : ''}
                    `;
                    container.appendChild(div);
                });
            } catch (error) {
                console.error('Failed to refresh agents:', error);
            }
        }

        async function refreshTasks() {
            try {
                const tasks = await apiCall('/api/tasks');
                const container = document.getElementById('tasksList');
                container.innerHTML = '';
                
                tasks.forEach(task => {
                    const div = document.createElement('div');
                    div.className = 'task-item';
                    div.innerHTML = `
                        <strong>${task.description}</strong>
                        <br><small>Status: ${task.status}</small>
                        <br><small>Priority: ${task.priority}</small>
                        ${task.assigned_agent ? `<br><small>Assigned to: Agent ${task.assigned_agent}</small>` : ''}
                    `;
                    container.appendChild(div);
                });
            } catch (error) {
                console.error('Failed to refresh tasks:', error);
            }
        }

        async function refreshMCPServers() {
            try {
                const servers = await apiCall('/api/mcp/servers');
                const container = document.getElementById('mcpServersList');
                container.innerHTML = '';
                
                Object.entries(servers).forEach(([name, server]) => {
                    const div = document.createElement('div');
                    div.className = 'agent-item';
                    div.innerHTML = `
                        <strong>${name}</strong>
                        <br><small>Status: ${server.running ? '✅ Running' : '❌ Stopped'}</small>
                        <br><small>Tools: ${server.tools.length}</small>
                    `;
                    container.appendChild(div);
                });
            } catch (error) {
                console.error('Failed to refresh MCP servers:', error);
            }
        }

        function showAddHumanModal() {
            document.getElementById('addHumanModal').style.display = 'block';
        }

        function showAddAgentModal() {
            refreshHumanOptions();
            document.getElementById('addAgentModal').style.display = 'block';
        }

        function showAddTaskModal() {
            refreshAgentOptions();
            document.getElementById('addTaskModal').style.display = 'block';
        }

        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
        }

        function toggleHumanSelection() {
            const relationship = document.getElementById('agentRelationship').value;
            const humanGroup = document.getElementById('humanSelectionGroup');
            humanGroup.style.display = relationship !== 'pure_agent' ? 'block' : 'none';
        }

        async function refreshHumanOptions() {
            try {
                const humans = await apiCall('/api/humans');
                const select = document.getElementById('selectedHuman');
                select.innerHTML = '<option value="">Select Human</option>';
                humans.forEach(human => {
                    const option = document.createElement('option');
                    option.value = human.id;
                    option.textContent = human.name;
                    select.appendChild(option);
                });
            } catch (error) {
                console.error('Failed to refresh human options:', error);
            }
        }

        async function refreshAgentOptions() {
            try {
                const agents = await apiCall('/api/agents');
                const select = document.getElementById('taskAgent');
                select.innerHTML = '<option value="">Auto-assign</option>';
                agents.forEach(agent => {
                    const option = document.createElement('option');
                    option.value = agent.id;
                    option.textContent = `Agent ${agent.number} (${agent.role_type})`;
                    select.appendChild(option);
                });
            } catch (error) {
                console.error('Failed to refresh agent options:', error);
            }
        }

        function clearLogs() {
            document.getElementById('systemLogs').innerHTML = '';
            logs = [];
        }

        // Form handlers
        document.getElementById('addHumanForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const data = {
                    name: document.getElementById('humanName').value,
                    email: document.getElementById('humanEmail').value || null,
                    skills: document.getElementById('humanSkills').value.split(',').map(s => s.trim()).filter(s => s),
                    expertise_areas: document.getElementById('humanExpertise').value.split(',').map(s => s.trim()).filter(s => s)
                };
                
                await apiCall('/api/humans', 'POST', data);
                showToast('Human added successfully!', 'success');
                closeModal('addHumanModal');
                document.getElementById('addHumanForm').reset();
                refreshHumans();
                refreshMetrics();
            } catch (error) {
                showToast('Failed to add human', 'error');
            }
        });

        document.getElementById('addAgentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const data = {
                    role_type: document.getElementById('agentRole').value,
                    relationship_type: document.getElementById('agentRelationship').value,
                    human_id: document.getElementById('selectedHuman').value || null
                };
                
                await apiCall('/api/agents', 'POST', data);
                showToast('Agent created successfully!', 'success');
                closeModal('addAgentModal');
                document.getElementById('addAgentForm').reset();
                refreshAgents();
                refreshMetrics();
            } catch (error) {
                showToast('Failed to create agent', 'error');
            }
        });

        document.getElementById('addTaskForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const data = {
                    description: document.getElementById('taskDescription').value,
                    agent_id: document.getElementById('taskAgent').value || null,
                    priority: parseInt(document.getElementById('taskPriority').value),
                    requires_human_approval: document.getElementById('requiresApproval').checked
                };
                
                await apiCall('/api/tasks', 'POST', data);
                showToast('Task submitted successfully!', 'success');
                closeModal('addTaskModal');
                document.getElementById('addTaskForm').reset();
                refreshTasks();
                refreshMetrics();
            } catch (error) {
                showToast('Failed to submit task', 'error');
            }
        });

        // Initialize
        window.addEventListener('load', () => {
            connectWebSocket();
            refreshMetrics();
            refreshHumans();
            refreshAgents();
            refreshTasks();
            refreshMCPServers();
            
            // Refresh data every 30 seconds
            setInterval(() => {
                refreshMetrics();
                refreshAgents();
                refreshTasks();
            }, 30000);
        });

        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
    </script>
</body>
</html>
    """
    return HTMLResponse(content=html_content)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/system/status")
async def get_system_status():
    """Get current system status."""
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        status = await system.get_system_status()
        return status
    except Exception as e:
        logger.error(f"Failed to get system status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/humans")
async def get_humans():
    """Get all humans in the system."""
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        humans = []
        for human_id, human in system.human_system.humans.items():
            humans.append({
                "id": human_id,
                "name": human.name,
                "email": human.email,
                "skills": human.skills,
                "expertise_areas": human.expertise_areas,
                "active": human.availability_status == "available"
            })
        return humans
    except Exception as e:
        logger.error(f"Failed to get humans: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/humans")
async def add_human(human_data: HumanCreate):
    """Add a new human to the system."""
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        human_id = await system.add_human(
            name=human_data.name,
            email=human_data.email,
            skills=human_data.skills,
            expertise_areas=human_data.expertise_areas
        )
        
        # Broadcast update
        await manager.broadcast({
            "type": "human_added",
            "human_id": human_id,
            "human_name": human_data.name,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return {"human_id": human_id, "message": "Human added successfully"}
    except Exception as e:
        logger.error(f"Failed to add human: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/agents")
async def get_agents():
    """Get all agents in the system."""
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        agents = []
        for agent in system.agents:
            human_name = None
            if agent.state.relationship and agent.state.relationship.human_id:
                human = system.human_system.humans.get(agent.state.relationship.human_id)
                human_name = human.name if human else None
            
            agents.append({
                "id": agent.id,
                "number": agent.number,
                "role_type": agent.state.role_type.value,
                "relationship_type": agent.state.relationship.relation_type.value,
                "status": "active" if agent.state.active else "inactive",
                "human_name": human_name,
                "created_at": agent.state.last_activity.isoformat()
            })
        return agents
    except Exception as e:
        logger.error(f"Failed to get agents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agents")
async def create_agent(agent_data: AgentCreate):
    """Create a new agent."""
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        if agent_data.relationship_type == AgentHumanRelationType.HUMAN_AGENT_PAIR:
            if not agent_data.human_id:
                raise HTTPException(status_code=400, detail="Human ID required for human-agent pair")
            agent_id = await system.create_human_agent_pair(
                human_id=agent_data.human_id,
                role_type=agent_data.role_type,
                collaboration_rules=agent_data.collaboration_rules
            )
        elif agent_data.relationship_type == AgentHumanRelationType.HUMAN_PROXY_AGENT:
            if not agent_data.human_id:
                raise HTTPException(status_code=400, detail="Human ID required for human proxy agent")
            agent_id = await system.create_human_proxy_agent(
                human_id=agent_data.human_id,
                role_type=agent_data.role_type,
                proxy_rules=agent_data.proxy_rules
            )
        else:
            # Pure agent - hire through boss agent
            boss_agent = system.agents[0] if system.agents else None
            if not boss_agent:
                raise HTTPException(status_code=500, detail="No boss agent available")
            agent_id = await boss_agent.hire_agent(
                role_type=agent_data.role_type,
                relationship_type=agent_data.relationship_type
            )
        
        # Broadcast update
        await manager.broadcast({
            "type": "agent_created",
            "agent_id": agent_id,
            "role_type": agent_data.role_type.value,
            "relationship_type": agent_data.relationship_type.value,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return {"agent_id": agent_id, "message": "Agent created successfully"}
    except Exception as e:
        logger.error(f"Failed to create agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tasks")
async def get_tasks():
    """Get all tasks in the system."""
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        tasks = []
        for agent in system.agents:
            # Get tasks from agent's task queues
            all_agent_tasks = []
            all_agent_tasks.extend(agent.current_tasks)
            all_agent_tasks.extend(agent.completed_tasks)
            all_agent_tasks.extend(agent.task_queue)
            
            for task in all_agent_tasks:
                tasks.append({
                    "id": task.id,
                    "description": task.description,
                    "status": task.status.value,
                    "priority": getattr(task, 'priority', 1),
                    "assigned_agent": agent.number,
                    "created_at": task.created_at.isoformat(),
                    "requires_human_approval": getattr(task, 'requires_human_approval', False)
                })
        return tasks
    except Exception as e:
        logger.error(f"Failed to get tasks: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tasks")
async def submit_task(task_data: TaskCreate):
    """Submit a new task."""
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        # Find target agent
        target_agent = None
        if task_data.agent_id:
            target_agent = next((a for a in system.agents if a.id == task_data.agent_id), None)
        else:
            # Auto-assign to boss agent
            target_agent = system.agents[0] if system.agents else None
        
        if not target_agent:
            raise HTTPException(status_code=404, detail="Target agent not found")
        
        # Submit task
        task_id = await target_agent.receive_task(task_data.description, priority=task_data.priority)
        
        # Broadcast update
        await manager.broadcast({
            "type": "task_submitted",
            "task_id": task_id,
            "description": task_data.description,
            "agent_id": target_agent.id,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return {"task_id": task_id, "message": "Task submitted successfully"}
    except Exception as e:
        logger.error(f"Failed to submit task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/mcp/servers")
async def get_mcp_servers():
    """Get MCP server status."""
    if not system:
        raise HTTPException(status_code=503, detail="System not initialized")
    
    try:
        return await system.mcp_manager.get_server_status()
    except Exception as e:
        logger.error(f"Failed to get MCP servers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="DSPy React MCP System Web UI")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=50391, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    
    args = parser.parse_args()
    
    print(f"🚀 Starting DSPy React MCP System Web UI")
    print(f"📡 Server: http://{args.host}:{args.port}")
    print(f"🌐 Access the dashboard at: http://localhost:{args.port}")
    
    uvicorn.run(
        "webui:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info"
    )