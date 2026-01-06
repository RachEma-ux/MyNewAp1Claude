# Agent Governance Platform - Deployment Guide

## Prerequisites

- Node.js 18+ and npm/pnpm
- MySQL 8.0+ or compatible database
- Docker (optional, for containerized deployment)
- External Orchestrator service (for agent lifecycle management)
- OPA (Open Policy Agent) service (for policy evaluation)

## Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Database
DATABASE_URL=mysql://user:password@localhost:3306/agent_governance

# Authentication
JWT_SECRET=your-secret-key-here
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://oauth.manus.im

# Application
VITE_APP_ID=your-app-id
VITE_APP_TITLE=Agent Governance Platform
VITE_APP_LOGO=/logo.png

# External Services
ORCHESTRATOR_BASE_URL=https://orchestrator.example.com
ORCHESTRATOR_API_KEY=your-orchestrator-key

OPA_BASE_URL=https://opa.example.com
OPA_TIMEOUT=30000

# Optional
LOG_LEVEL=info
LOG_FILE=/var/log/agent-governance.log
BACKUP_RETENTION_DAYS=30
```

## Installation

### 1. Clone and Install Dependencies

```bash
git clone <repository>
cd agent-governance-platform
pnpm install
```

### 2. Database Setup

```bash
# Run migrations
pnpm db:push

# Seed initial data (optional)
pnpm db:seed
```

### 3. Build

```bash
# Development
pnpm dev

# Production
pnpm build
pnpm start
```

## Docker Deployment

### Build Docker Image

```bash
docker build -t agent-governance:latest .
```

### Run Container

```bash
docker run -d \
  --name agent-governance \
  -p 3000:3000 \
  -e DATABASE_URL=mysql://user:password@db:3306/agent_governance \
  -e ORCHESTRATOR_BASE_URL=https://orchestrator.example.com \
  -e OPA_BASE_URL=https://opa.example.com \
  agent-governance:latest
```

### Docker Compose

```yaml
version: '3.8'

services:
  app:
    image: agent-governance:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: mysql://user:password@db:3306/agent_governance
      ORCHESTRATOR_BASE_URL: https://orchestrator.example.com
      OPA_BASE_URL: https://opa.example.com
    depends_on:
      - db

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: agent_governance
    volumes:
      - db_data:/var/lib/mysql

volumes:
  db_data:
```

## Production Deployment

### 1. SSL/TLS Configuration

```bash
# Generate SSL certificates
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365

# Configure in environment
HTTPS_KEY_PATH=/path/to/key.pem
HTTPS_CERT_PATH=/path/to/cert.pem
```

### 2. Reverse Proxy Setup (Nginx)

```nginx
upstream app {
  server localhost:3000;
}

server {
  listen 443 ssl;
  server_name governance.example.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

### 3. Process Management (PM2)

```bash
# Install PM2
npm install -g pm2

# Create ecosystem.config.js
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'agent-governance',
    script: './dist/server/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://user:password@localhost:3306/agent_governance',
    }
  }]
};
EOF

# Start application
pm2 start ecosystem.config.js

# Monitor
pm2 monit
```

### 4. Health Checks

```bash
# Check application health
curl https://governance.example.com/health

# Check orchestrator connectivity
curl https://governance.example.com/api/trpc/orchestrator.healthCheck

# Check OPA connectivity
curl https://governance.example.com/api/trpc/opaPolicy.healthCheck
```

## Backup and Recovery

### Automated Backups

```bash
# Enable automatic backups
pnpm backup:schedule --interval 24 --retention 30

# List backups
pnpm backup:list

# Restore from backup
pnpm backup:restore --backup-id <backup-id>
```

### Manual Backup

```bash
# Create backup
mysqldump -u user -p agent_governance > backup_$(date +%Y%m%d).sql

# Restore backup
mysql -u user -p agent_governance < backup_20240115.sql
```

## Monitoring and Logging

### Application Logs

```bash
# View logs
tail -f /var/log/agent-governance.log

# Filter by level
grep "ERROR" /var/log/agent-governance.log
```

### Metrics Collection

The application exposes metrics at `/metrics`:

```bash
curl https://governance.example.com/metrics
```

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health` | Application health |
| `/api/trpc/orchestrator.healthCheck` | Orchestrator connectivity |
| `/api/trpc/opaPolicy.healthCheck` | OPA connectivity |

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
mysql -h localhost -u user -p -e "SELECT 1"

# Check connection pool
pnpm db:status
```

### Orchestrator Connection Issues

```bash
# Test orchestrator connectivity
curl -H "Authorization: Bearer <token>" \
  https://orchestrator.example.com/health

# Check logs for errors
grep "orchestrator" /var/log/agent-governance.log
```

### OPA Policy Compilation Errors

```bash
# Validate policy syntax
curl -X POST https://opa.example.com/v1/compile \
  -H "Content-Type: application/json" \
  -d '{"query": "data.agent_governance", "modules": [...]}'
```

## Performance Tuning

### Database Optimization

```sql
-- Create indexes
CREATE INDEX idx_agents_workspace ON agents(workspaceId);
CREATE INDEX idx_policies_workspace ON policies(workspaceId);
CREATE INDEX idx_events_workspace ON events(workspaceId);

-- Enable query cache
SET GLOBAL query_cache_type = ON;
SET GLOBAL query_cache_size = 268435456; -- 256MB
```

### Connection Pooling

```bash
# Configure in environment
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
```

### Caching

```bash
# Enable Redis caching
REDIS_URL=redis://localhost:6379
CACHE_TTL=3600
```

## Security Checklist

- [ ] Enable HTTPS/TLS
- [ ] Configure firewall rules
- [ ] Set strong database passwords
- [ ] Enable API authentication
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Set up audit logging
- [ ] Regular security updates
- [ ] Backup encryption
- [ ] Monitor for suspicious activity

## Scaling

### Horizontal Scaling

```bash
# Load balancing with multiple instances
docker run -d --name app1 -p 3001:3000 agent-governance:latest
docker run -d --name app2 -p 3002:3000 agent-governance:latest
docker run -d --name app3 -p 3003:3000 agent-governance:latest

# Configure load balancer to distribute traffic
```

### Vertical Scaling

```bash
# Increase resources
DB_POOL_MAX=50
NODE_OPTIONS="--max-old-space-size=4096"
```

## Rollback Procedure

```bash
# List available versions
docker image ls agent-governance

# Rollback to previous version
docker run -d --name agent-governance-prev \
  agent-governance:previous-tag

# Update load balancer to point to previous version
```

## Support and Monitoring

For production deployments, ensure:

1. **Monitoring**: Set up alerts for errors, performance degradation
2. **Logging**: Centralize logs for analysis
3. **Backups**: Test backup/restore procedures regularly
4. **Updates**: Plan regular security and dependency updates
5. **Documentation**: Keep runbooks updated

---

## Additional Resources

- [API Documentation](./API_DOCUMENTATION.md)
- [OPA Policy Guide](./OPA_POLICY_GUIDE.md)
- [Architecture Guide](./ARCHITECTURE.md)
