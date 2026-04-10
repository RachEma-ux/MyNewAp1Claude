"""
KGRA MCP Integration Tools (Section 3.3).
Client-side tools for discovering and invoking MCP servers/tools.
"""

from __future__ import annotations
import logging
from typing import Any, Optional

from ..config import get_config

logger = logging.getLogger(__name__)


async def discover_mcp_tools(capability_filter: Optional[str] = None) -> dict:
    """Query MCP registry for available servers and tools.
    Returns: list of {server, tools, capabilities}
    """
    cfg = get_config()
    servers = []

    for entry in cfg.mcp.registry:
        if capability_filter:
            if not any(capability_filter.lower() in c.lower() for c in entry.capabilities):
                continue
        servers.append({
            "name": entry.name,
            "url": entry.url,
            "capabilities": entry.capabilities,
        })

    return {
        "servers": servers,
        "total": len(servers),
        "filter": capability_filter,
        "_cost": {"mcp_calls": 1},
    }


async def invoke_mcp_tool(
    server_name: str,
    tool_name: str,
    arguments: dict,
    expected_schema: Optional[dict] = None,
) -> dict:
    """Call any MCP-exposed tool with validation.
    Returns: {result, validated, server, tool}
    """
    cfg = get_config()

    # Find server in registry
    server = None
    for entry in cfg.mcp.registry:
        if entry.name == server_name:
            server = entry
            break

    if not server:
        return {"error": f"MCP server '{server_name}' not found in registry", "result": None}

    # In production: use MCP Python SDK to call tools/call
    # For now: return placeholder
    logger.info(f"MCP tool call: {server_name}/{tool_name} with {list(arguments.keys())}")

    return {
        "result": None,
        "validated": False,
        "server": server_name,
        "tool": tool_name,
        "_cost": {"mcp_calls": 1},
    }


async def register_mcp_server(
    name: str,
    url: str,
    capabilities: list[str],
    requires_approval: bool = True,
) -> dict:
    """Dynamically register a new MCP server (requires governance approval).
    Returns: {registered, server_id}
    """
    if requires_approval:
        return {
            "registered": False,
            "pending_approval": True,
            "server": name,
            "url": url,
        }

    # In production: add to registry and test connection
    return {
        "registered": True,
        "server": name,
        "url": url,
        "capabilities": capabilities,
    }


async def query_mcp_resource(
    server_name: str,
    resource_uri: str,
) -> dict:
    """Read a resource from an MCP server.
    Returns: {content, mime_type, server}
    """
    logger.info(f"MCP resource read: {server_name}/{resource_uri}")
    return {
        "content": None,
        "mime_type": "application/json",
        "server": server_name,
        "resource": resource_uri,
        "_cost": {"mcp_calls": 1},
    }
