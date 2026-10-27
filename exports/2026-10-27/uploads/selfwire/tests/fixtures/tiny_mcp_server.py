"""
A tiny, real, standalone MCP server used to exercise mcp_hub.py against an
actual subprocess over stdio — not a mock. Run as: `python tiny_mcp_server.py`.
"""

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("tiny-test-server")


@mcp.tool()
def multiply(a: int, b: int) -> int:
    """Multiply two integers."""
    return a * b


@mcp.tool()
def shout(text: str) -> str:
    """Uppercase some text and add an exclamation mark."""
    return f"{text.upper()}!"


if __name__ == "__main__":
    mcp.run(transport="stdio")
