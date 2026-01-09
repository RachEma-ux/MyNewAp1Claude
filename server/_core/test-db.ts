/**
 * Database Test Endpoint
 * Comprehensive testing of PostgreSQL connection and LLM creation
 */

import { Router } from "express";
import { Pool } from "pg";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

interface TestResult {
  step: string;
  status: "success" | "error" | "info";
  message: string;
  data?: any;
  error?: string;
}

async function runDatabaseTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Step 1: Check DATABASE_URL
  results.push({
    step: "1. Check DATABASE_URL",
    status: process.env.DATABASE_URL ? "success" : "error",
    message: process.env.DATABASE_URL
      ? "DATABASE_URL is set"
      : "DATABASE_URL is not set",
    data: process.env.DATABASE_URL
      ? {
          format: process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@'),
          protocol: process.env.DATABASE_URL.split('://')[0]
        }
      : undefined
  });

  if (!process.env.DATABASE_URL) {
    return results;
  }

  // Step 2: Test raw PostgreSQL connection
  let pool: Pool | null = null;
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 10000,
    });

    const client = await pool.connect();
    results.push({
      step: "2. PostgreSQL Connection",
      status: "success",
      message: "Successfully connected to PostgreSQL",
    });

    // Step 3: Check PostgreSQL version
    try {
      const versionResult = await client.query('SELECT version()');
      results.push({
        step: "3. PostgreSQL Version",
        status: "info",
        message: "PostgreSQL version retrieved",
        data: { version: versionResult.rows[0].version.split('\n')[0] }
      });
    } catch (error: any) {
      results.push({
        step: "3. PostgreSQL Version",
        status: "error",
        message: "Failed to get version",
        error: error.message
      });
    }

    // Step 4: List all tables
    try {
      const tablesResult = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      results.push({
        step: "4. List Tables",
        status: "success",
        message: `Found ${tablesResult.rows.length} tables`,
        data: {
          count: tablesResult.rows.length,
          tables: tablesResult.rows.map(r => r.table_name).slice(0, 10),
          hasLlmsTable: tablesResult.rows.some(r => r.table_name === 'llms')
        }
      });
    } catch (error: any) {
      results.push({
        step: "4. List Tables",
        status: "error",
        message: "Failed to list tables",
        error: error.message
      });
    }

    // Step 5: Check if llms table exists and describe it
    try {
      const columnsResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'llms'
        ORDER BY ordinal_position
      `);

      if (columnsResult.rows.length > 0) {
        results.push({
          step: "5. LLMs Table Structure",
          status: "success",
          message: "llms table exists",
          data: { columns: columnsResult.rows }
        });
      } else {
        results.push({
          step: "5. LLMs Table Structure",
          status: "error",
          message: "llms table does not exist",
        });
      }
    } catch (error: any) {
      results.push({
        step: "5. LLMs Table Structure",
        status: "error",
        message: "Failed to describe llms table",
        error: error.message
      });
    }

    // Step 6: Check migrations table
    try {
      const migrationsResult = await client.query(`
        SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5
      `);
      results.push({
        step: "6. Migrations Status",
        status: "success",
        message: `Found ${migrationsResult.rows.length} migrations`,
        data: { migrations: migrationsResult.rows }
      });
    } catch (error: any) {
      results.push({
        step: "6. Migrations Status",
        status: "error",
        message: "Failed to check migrations",
        error: error.message
      });
    }

    // Step 7: Try to insert a test LLM
    try {
      const insertResult = await client.query(`
        INSERT INTO llms (name, description, role, "ownerTeam", archived, "createdBy", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id
      `, ['test-llm-diagnostic', 'Automated test LLM', 'executor', 'TestTeam', false, 1]);

      const insertedId = insertResult.rows[0].id;

      results.push({
        step: "7. Test LLM Insert",
        status: "success",
        message: "Successfully inserted test LLM",
        data: { insertedId }
      });

      // Clean up - delete test LLM
      await client.query('DELETE FROM llms WHERE id = $1', [insertedId]);
      results.push({
        step: "8. Cleanup",
        status: "success",
        message: "Test LLM deleted successfully",
      });
    } catch (error: any) {
      results.push({
        step: "7. Test LLM Insert",
        status: "error",
        message: "Failed to insert test LLM",
        error: error.message,
        data: {
          code: error.code,
          detail: error.detail,
          hint: error.hint,
        }
      });
    }

    client.release();
  } catch (error: any) {
    results.push({
      step: "2. PostgreSQL Connection",
      status: "error",
      message: "Failed to connect to PostgreSQL",
      error: error.message,
      data: {
        code: error.code,
        errno: error.errno,
      }
    });
  } finally {
    if (pool) {
      await pool.end();
    }
  }

  // Step 9: Test Drizzle ORM
  try {
    const db = getDb();
    if (db) {
      const testQuery = await db.execute(sql`SELECT 1 as test`);
      results.push({
        step: "9. Drizzle ORM Test",
        status: "success",
        message: "Drizzle ORM working",
        data: { result: testQuery }
      });
    } else {
      results.push({
        step: "9. Drizzle ORM Test",
        status: "error",
        message: "Drizzle instance not available",
      });
    }
  } catch (error: any) {
    results.push({
      step: "9. Drizzle ORM Test",
      status: "error",
      message: "Drizzle ORM test failed",
      error: error.message
    });
  }

  return results;
}

// Test endpoint
router.get("/test-database", async (req, res) => {
  try {
    const results = await runDatabaseTests();

    const hasErrors = results.some(r => r.status === "error");
    const summary = {
      total: results.length,
      success: results.filter(r => r.status === "success").length,
      errors: results.filter(r => r.status === "error").length,
      info: results.filter(r => r.status === "info").length,
    };

    res.json({
      success: !hasErrors,
      summary,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

export default router;
