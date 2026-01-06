#!/bin/bash

echo "=== App Status Check ==="
echo ""

# Check MariaDB
if lsof -i :3306 >/dev/null 2>&1; then
    echo "✅ MariaDB: Running on port 3306"
else
    echo "❌ MariaDB: Not running"
fi

# Check App Server
if lsof -i :3000 >/dev/null 2>&1; then
    echo "✅ App Server: Running on port 3000"
else
    echo "❌ App Server: Not running"
fi

# Test connection
echo ""
echo "=== Testing Connection ==="
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200"; then
    echo "✅ Server responds: HTTP 200 OK"
    echo ""
    echo "You can access the app at:"
    echo "  http://localhost:3000/"
    echo "  http://127.0.0.1:3000/"
else
    echo "❌ Server not responding"
fi

echo ""
echo "=== Process Info ==="
ps aux | grep -E "node|maria" | grep -v grep | head -5
