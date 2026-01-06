import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // Drop existing table
  await connection.execute('DROP TABLE IF EXISTS trigger_registry');
  console.log('✅ Dropped old trigger_registry table');

  // Create new table with Trigger protocol schema
  await connection.execute(`
CREATE TABLE trigger_registry (
  id INT AUTO_INCREMENT PRIMARY KEY,
  triggerId VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category ENUM('time', 'event', 'data', 'user', 'system', 'integration') NOT NULL,
  semanticVersion VARCHAR(20) NOT NULL,
  owner VARCHAR(255) NOT NULL,
  status ENUM('draft', 'active', 'deprecated', 'disabled') NOT NULL DEFAULT 'draft',
  icon VARCHAR(50),
  purpose TEXT NOT NULL,
  guarantees JSON,
  nonGoals JSON NOT NULL,
  eventInputSchema JSON NOT NULL,
  workflowContextSchema JSON NOT NULL,
  ingestionMode ENUM('event', 'poll', 'schedule') NOT NULL,
  deduplicationEnabled BOOLEAN NOT NULL DEFAULT FALSE,
  deduplicationKey VARCHAR(100),
  ordering ENUM('none', 'fifo') NOT NULL DEFAULT 'none',
  ingestionRetryPolicy JSON,
  pollingInterval INT,
  sideEffects JSON NOT NULL,
  authenticationType ENUM('none', 'hmac', 'jwt', 'mTLS', 'api_key') NOT NULL,
  authorizationScopes JSON,
  sourceVerification BOOLEAN NOT NULL DEFAULT FALSE,
  maxEventsPerMinute INT,
  errorTaxonomy JSON NOT NULL,
  observabilityConfig JSON NOT NULL,
  maxPayloadKb INT NOT NULL,
  maxEventsPerSecond INT NOT NULL,
  supportsDryRun BOOLEAN NOT NULL DEFAULT TRUE,
  eventStub JSON NOT NULL,
  deprecatedAt TIMESTAMP NULL,
  sunsetAt TIMESTAMP NULL,
  replacementTriggerId VARCHAR(100),
  uiIntegrationSpec JSON NOT NULL,
  riskLevel ENUM('low', 'medium', 'high', 'critical') NOT NULL,
  complianceScore INT NOT NULL DEFAULT 0,
  criticalViolations JSON,
  approvalStatus ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  approvedBy VARCHAR(255),
  approvedAt TIMESTAMP NULL,
  rejectionReason TEXT,
  createdBy VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
`);
  console.log('✅ Created new trigger_registry table with Trigger protocol schema');
} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  await connection.end();
}
