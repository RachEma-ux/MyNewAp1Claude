# Testing Guide

## Overview

The Agent Governance Platform includes comprehensive testing across unit, integration, and end-to-end levels. This guide explains how to write, run, and maintain tests.

## Testing Stack

- **Framework**: Vitest
- **HTTP Mocking**: MSW (Mock Service Worker)
- **Assertion Library**: Chai/Assert
- **Coverage**: c8

## Running Tests

### Run All Tests

```bash
pnpm test
```

### Run Tests in Watch Mode

```bash
pnpm test:watch
```

### Run Tests with Coverage

```bash
pnpm test:coverage
```

### Run Specific Test File

```bash
pnpm test server/services/externalOrchestrator.test.ts
```

## Unit Tests

### ExternalOrchestratorClient Tests

**File**: `server/services/externalOrchestrator.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ExternalOrchestratorClient } from '../externalOrchestrator';

describe('ExternalOrchestratorClient', () => {
  let client: ExternalOrchestratorClient;

  beforeEach(() => {
    client = new ExternalOrchestratorClient({
      baseUrl: 'https://orchestrator.example.com',
      apiKey: 'test-key',
    });
  });

  describe('startAgent', () => {
    it('should start an agent', async () => {
      const result = await client.startAgent({
        workspaceId: 1,
        agentId: 1,
        spec: {
          name: 'Test Agent',
          roleClass: 'assistant',
          systemPrompt: 'Test prompt',
          modelId: 'gpt-4',
        },
      });

      expect(result.success).toBe(true);
      expect(result.agentId).toBe(1);
    });

    it('should retry on failure', async () => {
      // Test retry logic
    });
  });

  describe('getAgentStatus', () => {
    it('should get agent status', async () => {
      const status = await client.getAgentStatus(1, 1);

      expect(status.agentId).toBe(1);
      expect(['running', 'stopped', 'error']).toContain(status.status);
    });
  });
});
```

### OPAPolicyEngine Tests

**File**: `server/services/opaPolicyEngine.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { OPAPolicyEngine } from '../opaPolicyEngine';

describe('OPAPolicyEngine', () => {
  const engine = new OPAPolicyEngine({
    baseUrl: 'https://opa.example.com',
  });

  describe('evaluatePolicy', () => {
    it('should evaluate agent compliance', async () => {
      const result = await engine.evaluatePolicy({
        agent: {
          id: 1,
          name: 'Test Agent',
          roleClass: 'analyst',
          temperature: 0.7,
          hasDocumentAccess: true,
          hasToolAccess: true,
          allowedTools: ['web_search'],
        },
        workspace: {
          id: 1,
          policies: [],
        },
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect violations', async () => {
      const result = await engine.evaluatePolicy({
        agent: {
          id: 1,
          name: 'Invalid Agent',
          roleClass: 'invalid',
          temperature: 3.0, // Out of range
          hasDocumentAccess: false,
          hasToolAccess: false,
          allowedTools: [],
        },
        workspace: {
          id: 1,
          policies: [],
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('compilePolicy', () => {
    it('should compile valid policy', async () => {
      const result = await engine.compilePolicy(`
        package agent_governance
        evaluate { true }
      `);

      expect(result.success).toBe(true);
    });

    it('should reject invalid policy', async () => {
      const result = await engine.compilePolicy(`
        package agent_governance
        invalid syntax here
      `);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });
});
```

### EventStreamManager Tests

**File**: `server/services/eventStreaming.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { EventStreamManager } from '../eventStreaming';

describe('EventStreamManager', () => {
  let manager: EventStreamManager;

  beforeEach(() => {
    manager = new EventStreamManager(100);
  });

  describe('subscribe', () => {
    it('should subscribe to events', () => {
      const callback = () => {};
      const id = manager.subscribe(1, ['agent.started'], callback);

      expect(id).toBeDefined();
      expect(manager.getSubscriberCount(1)).toBe(1);
    });
  });

  describe('emitEvent', () => {
    it('should emit events to subscribers', (done) => {
      manager.subscribe(1, ['agent.started'], (event) => {
        expect(event.type).toBe('agent.started');
        expect(event.workspaceId).toBe(1);
        done();
      });

      manager.emitEvent({
        type: 'agent.started',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: {},
      });
    });

    it('should filter events by type', (done) => {
      let eventCount = 0;

      manager.subscribe(1, ['agent.started'], () => {
        eventCount++;
      });

      manager.emitEvent({
        type: 'agent.started',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: {},
      });

      manager.emitEvent({
        type: 'agent.stopped',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: {},
      });

      setTimeout(() => {
        expect(eventCount).toBe(1);
        done();
      }, 100);
    });
  });

  describe('getEventHistory', () => {
    it('should retrieve event history', () => {
      manager.emitEvent({
        type: 'agent.started',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: {},
      });

      const history = manager.getEventHistory(1);
      expect(history).toHaveLength(1);
    });
  });
});
```

## Integration Tests

### Agent Lifecycle Integration Test

**File**: `server/routers/agents.integration.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../db';
import { agents } from '../../drizzle/schema';

describe('Agent Lifecycle Integration', () => {
  let db: any;

  beforeEach(async () => {
    db = getDb();
    // Clear test data
  });

  it('should create, promote, and start an agent', async () => {
    // 1. Create agent
    const createResult = await db.insert(agents).values({
      workspaceId: 1,
      name: 'Test Agent',
      roleClass: 'analyst',
      systemPrompt: 'Test',
      modelId: 'gpt-4',
      status: 'draft',
      createdBy: 1,
    });

    // 2. Verify agent created
    const agent = await db.select().from(agents).where(eq(agents.id, createResult[0].insertId)).limit(1);
    expect(agent).toHaveLength(1);

    // 3. Promote agent
    // (test promotion logic)

    // 4. Start agent
    // (test orchestrator integration)
  });
});
```

## End-to-End Tests

### Agent Management E2E Test

**File**: `e2e/agent-management.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { browser } from '@playwright/test';

describe('Agent Management E2E', () => {
  it('should create and manage an agent', async () => {
    // 1. Navigate to agents page
    await page.goto('/governance/agents');

    // 2. Click create button
    await page.click('button:has-text("Create Agent")');

    // 3. Fill form
    await page.fill('input[name="name"]', 'E2E Test Agent');
    await page.fill('textarea[name="description"]', 'Test description');
    await page.selectOption('select[name="roleClass"]', 'analyst');
    await page.fill('textarea[name="systemPrompt"]', 'Test prompt');

    // 4. Submit
    await page.click('button:has-text("Create Agent")');

    // 5. Verify agent created
    await expect(page).toHaveURL('/governance/agents');
    await expect(page.locator('text=E2E Test Agent')).toBeVisible();
  });
});
```

## Test Coverage

### Coverage Targets

| Component | Target |
|-----------|--------|
| Services | 80%+ |
| Routers | 70%+ |
| Utils | 90%+ |
| Overall | 75%+ |

### Generate Coverage Report

```bash
pnpm test:coverage
```

Coverage report will be generated in `coverage/` directory.

## Mocking

### Mock External Services

```typescript
import { server } from './mocks/server';
import { rest } from 'msw';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('should handle API errors', async () => {
  server.use(
    rest.post('https://orchestrator.example.com/v1/agents/start', (req, res, ctx) => {
      return res(ctx.status(500), ctx.json({ error: 'Server error' }));
    })
  );

  // Test error handling
});
```

## Best Practices

1. **Test Naming**: Use descriptive names that explain what is being tested
2. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and verification
3. **Isolation**: Each test should be independent and not rely on others
4. **Mocking**: Mock external dependencies to ensure tests are fast and reliable
5. **Coverage**: Aim for high coverage but focus on critical paths
6. **Performance**: Keep tests fast - aim for < 100ms per test
7. **Documentation**: Add comments explaining complex test logic

## Continuous Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Manual trigger via GitHub Actions

### GitHub Actions Workflow

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: pnpm install
      - run: pnpm test
      - run: pnpm test:coverage
```

## Troubleshooting

### Tests Timing Out

Increase timeout:
```typescript
it('should complete operation', async () => {
  // test code
}, { timeout: 10000 }); // 10 seconds
```

### Mock Not Working

Ensure MSW server is started before tests:
```typescript
beforeAll(() => server.listen());
```

### Database Tests Failing

Ensure test database is set up:
```bash
pnpm test:db:setup
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [MSW Documentation](https://mswjs.io/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
