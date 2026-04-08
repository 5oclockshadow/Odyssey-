"""Setup script for DSPy React MCP system."""

import os
import subprocess
import sys
from pathlib import Path


def install_requirements():
    """Install required packages."""
    print("Installing requirements...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✅ Requirements installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install requirements: {e}")
        return False


def setup_environment():
    """Setup environment file if it doesn't exist."""
    env_file = Path(".env")
    if not env_file.exists():
        print("Creating .env file...")
        with open(env_file, "w") as f:
            f.write("""# DSPy React MCP Environment Configuration
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_API_KEY=your_google_api_key_here

# MCP Server Configuration
MCP_SERVER_HOST=localhost
MCP_SERVER_PORT=3000
MCP_CONFIG_PATH=./mcp_config.json

# Agent Configuration
MAX_AGENTS=10
DEFAULT_MODEL=gpt-4
AGENT_TIMEOUT=300

# Logging
LOG_LEVEL=INFO
LOG_FILE=./logs/dspy_react.log

# Database (if needed)
DATABASE_URL=sqlite:///./dspy_react.db
""")
        print("✅ Created .env file")
    else:
        print("✅ .env file already exists")


def create_directories():
    """Create necessary directories."""
    dirs = ["logs", "data"]
    for dir_name in dirs:
        Path(dir_name).mkdir(exist_ok=True)
        print(f"✅ Created directory: {dir_name}")


def check_node():
    """Check if Node.js is available for MCP servers."""
    try:
        result = subprocess.run(["node", "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ Node.js found: {result.stdout.strip()}")
            return True
        else:
            print("❌ Node.js not found")
            return False
    except FileNotFoundError:
        print("❌ Node.js not found")
        return False


def main():
    """Main setup function."""
    print("DSPy React MCP System Setup")
    print("=" * 40)
    
    # Check Node.js
    if not check_node():
        print("\n⚠️  Warning: Node.js not found. MCP servers may not work properly.")
        print("Please install Node.js from https://nodejs.org/")
    
    # Create directories
    print("\nCreating directories...")
    create_directories()
    
    # Setup environment
    print("\nSetting up environment...")
    setup_environment()
    
    # Install requirements
    print("\nInstalling Python requirements...")
    if not install_requirements():
        print("❌ Setup failed due to requirements installation error")
        return False
    
    print("\n" + "=" * 40)
    print("✅ Setup completed successfully!")
    print("\nNext steps:")
    print("1. Edit .env file with your API keys")
    print("2. Run: python test_system.py (to test the system)")
    print("3. Run: python main.py (to start the system)")
    print("4. Run: python main.py demo (to run the demo)")
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)