import pg from 'pg';

const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

try {
  // Drop existing table
  await client.query('DROP TABLE IF EXISTS trigger_registry');
  console.log('Dropped old trigger_registry table');

  // Create new table with Trigger protocol schema (PostgreSQL)
  await client.query(`
CREATE TABLE trigger_registry (
  id SERIAL PRIMARY KEY,
  "triggerId" VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('time', 'event', 'data', 'user', 'system', 'integration')),
  "semanticVersion" VARCHAR(20) NOT NULL,
  owner VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated', 'disabled')),
  icon VARCHAR(50),
  purpose TEXT NOT NULL,
  guarantees JSONB,
  "nonGoals" JSONB NOT NULL,
  "eventInputSchema" JSONB NOT NULL,
  "workflowContextSchema" JSONB NOT NULL,
  "ingestionMode" VARCHAR(20) NOT NULL CHECK ("ingestionMode" IN ('event', 'poll', 'schedule')),
  "deduplicationEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "deduplicationKey" VARCHAR(100),
  ordering VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (ordering IN ('none', 'fifo')),
  "ingestionRetryPolicy" JSONB,
  "pollingInterval" INT,
  "sideEffects" JSONB NOT NULL,
  "authenticationType" VARCHAR(20) NOT NULL CHECK ("authenticationType" IN ('none', 'hmac', 'jwt', 'mTLS', 'api_key')),
  "authorizationScopes" JSONB,
  "sourceVerification" BOOLEAN NOT NULL DEFAULT FALSE,
  "maxEventsPerMinute" INT,
  "errorTaxonomy" JSONB NOT NULL,
  "observabilityConfig" JSONB NOT NULL,
  "maxPayloadKb" INT NOT NULL,
  "maxEventsPerSecond" INT NOT NULL,
  "supportsDryRun" BOOLEAN NOT NULL DEFAULT TRUE,
  "eventStub" JSONB NOT NULL,
  "deprecatedAt" TIMESTAMP,
  "sunsetAt" TIMESTAMP,
  "replacementTriggerId" VARCHAR(100),
  "uiIntegrationSpec" JSONB NOT NULL,
  "riskLevel" VARCHAR(10) NOT NULL CHECK ("riskLevel" IN ('low', 'medium', 'high', 'critical')),
  "complianceScore" INT NOT NULL DEFAULT 0,
  "criticalViolations" JSONB,
  "approvalStatus" VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK ("approvalStatus" IN ('pending', 'approved', 'rejected')),
  "approvedBy" VARCHAR(255),
  "approvedAt" TIMESTAMP,
  "rejectionReason" TEXT,
  "createdBy" VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
)
`);
  console.log('Created new trigger_registry table with Trigger protocol schema');
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await client.end();
}
