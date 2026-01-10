#!/bin/bash

# Setup script for Render MCP Server
# This script helps you configure the Render MCP server for use with Claude Code

set -e

echo "🚀 Render MCP Server Setup"
echo "=========================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ Created .env file"
    echo ""
fi

# Check if RENDER_API_KEY is set
if ! grep -q "RENDER_API_KEY=.*[^_here]" .env 2>/dev/null; then
    echo "⚠️  RENDER_API_KEY not configured in .env"
    echo ""
    echo "To get your Render API key:"
    echo "  1. Go to https://dashboard.render.com/"
    echo "  2. Navigate to Account Settings → API Keys"
    echo "  3. Click 'Create API Key'"
    echo "  4. Copy the key and paste it in .env"
    echo ""
    read -p "Do you want to set your API key now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your Render API key: " api_key
        sed -i "s/RENDER_API_KEY=.*/RENDER_API_KEY=$api_key/" .env
        echo "✅ API key saved to .env"
    else
        echo "⏭️  Skipping API key setup. Remember to update .env manually!"
    fi
    echo ""
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Test connection
echo "🔌 Testing connection to Render MCP server..."
echo ""

if [ -z "$RENDER_API_KEY" ] || [ "$RENDER_API_KEY" = "your_render_api_key_here" ]; then
    echo "❌ RENDER_API_KEY not set. Please configure it in .env"
    exit 1
fi

# Test MCP server connectivity
response=$(curl -s -w "\n%{http_code}" -X POST https://mcp.render.com/mcp \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' || echo "000")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "200" ]; then
    echo "✅ Successfully connected to Render MCP server!"
    echo ""
    echo "Available tools:"
    echo "$body" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | sed 's/^/  - /' || echo "  (Could not parse tools list)"
    echo ""
    echo "✨ Setup complete! You can now use Render MCP in Claude Code"
    echo ""
    echo "Try these example prompts:"
    echo "  - 'List all my Render services'"
    echo "  - 'What's the status of my api service?'"
    echo "  - 'Show me the logs for my web-app'"
elif [ "$http_code" = "401" ]; then
    echo "❌ Authentication failed. Please check your RENDER_API_KEY in .env"
    exit 1
elif [ "$http_code" = "000" ]; then
    echo "❌ Could not connect to Render MCP server. Check your internet connection."
    exit 1
else
    echo "⚠️  Unexpected response (HTTP $http_code)"
    echo "Response: $body"
    exit 1
fi
