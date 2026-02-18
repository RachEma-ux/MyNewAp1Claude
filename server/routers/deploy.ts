import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

// GitHub API configuration
const GITHUB_API_BASE = "https://api.github.com";
const WORKFLOW_FILE = "builder-deploy.yml";

// Get GitHub configuration from environment or git remote
function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  let repo = process.env.GITHUB_REPO;

  // Try to detect repo from git remote if not set
  if (!repo) {
    try {
      const { execSync } = require("child_process");
      const remoteUrl = execSync("git config --get remote.origin.url", { encoding: "utf8", timeout: 5000 }).trim();
      // Parse repo from URL formats like:
      // https://github.com/owner/repo.git
      // git@github.com:owner/repo.git
      const match = remoteUrl.match(/github\.com[/:]([\w-]+)\/([\w-]+?)(?:\.git)?$/);
      if (match) {
        repo = `${match[1]}/${match[2]}`;
      }
    } catch {
      // Ignore errors - repo detection failed
    }
  }

  return { token, repo };
}

// Helper to make GitHub API requests
async function githubApi(endpoint: string, options: RequestInit = {}) {
  const { token, repo } = getGitHubConfig();

  if (!token) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "GITHUB_TOKEN environment variable is not set"
    });
  }

  const url = endpoint.startsWith("http") ? endpoint : `${GITHUB_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `GitHub API error: ${response.status} - ${error}`
    });
  }

  // Handle empty responses
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Deployment input schema
const triggerDeploySchema = z.object({
  version: z.string().min(1).default("2.0.0"),
  runApp: z.enum(["yes", "no"]).default("yes"),
  duration: z.enum(["5", "10", "15", "30"]).default("15"),
  oauthPortalUrl: z.string().optional(),
  appId: z.string().optional(),
  databaseUrl: z.string().optional(),
});

// Deployment status types
type WorkflowStatus = "queued" | "in_progress" | "completed" | "waiting" | "requested" | "pending";
type WorkflowConclusion = "success" | "failure" | "cancelled" | "skipped" | "timed_out" | "action_required" | null;

interface WorkflowRun {
  id: number;
  name: string;
  status: WorkflowStatus;
  conclusion: WorkflowConclusion;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at: string | null;
  head_sha: string;
  workflow_id: number;
  run_number: number;
  jobs_url: string;
  logs_url: string;
  artifacts_url: string;
}

interface WorkflowJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    number: number;
    started_at: string | null;
    completed_at: string | null;
  }>;
}

export const deployRouter = router({
  // Get configuration status
  getConfig: publicProcedure.query(async () => {
    const { token, repo } = getGitHubConfig();
    return {
      hasToken: !!token,
      repo: repo || null,
      workflowFile: WORKFLOW_FILE,
      configured: !!(token && repo),
    };
  }),

  // Trigger a new deployment
  trigger: protectedProcedure
    .input(triggerDeploySchema)
    .mutation(async ({ input }) => {
      const { repo } = getGitHubConfig();

      if (!repo) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "GITHUB_REPO is not configured and could not be detected"
        });
      }

      // Trigger workflow dispatch
      await githubApi(`/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
        method: "POST",
        body: JSON.stringify({
          ref: "main", // or current branch
          inputs: {
            version: input.version,
            run_app: input.runApp,
            duration: input.duration,
            oauth_portal_url: input.oauthPortalUrl || "",
            app_id: input.appId || "",
            database_url: input.databaseUrl || "",
          },
        }),
      });

      // Wait a moment for the workflow to be created
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get the most recent run to return its ID
      const runsResponse = await githubApi(`/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`);
      const latestRun = runsResponse.workflow_runs?.[0];

      return {
        success: true,
        message: "Deployment triggered successfully",
        runId: latestRun?.id || null,
        runUrl: latestRun?.html_url || null,
      };
    }),

  // Get status of a specific deployment run
  getStatus: publicProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const { repo } = getGitHubConfig();

      if (!repo) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "GITHUB_REPO is not configured"
        });
      }

      const run: WorkflowRun = await githubApi(`/repos/${repo}/actions/runs/${input.runId}`);

      // Get jobs for detailed step information
      const jobsResponse = await githubApi(run.jobs_url);
      const jobs: WorkflowJob[] = jobsResponse.jobs || [];

      return {
        id: run.id,
        status: run.status,
        conclusion: run.conclusion,
        htmlUrl: run.html_url,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        startedAt: run.run_started_at,
        runNumber: run.run_number,
        jobs: jobs.map(job => ({
          id: job.id,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          startedAt: job.started_at,
          completedAt: job.completed_at,
          steps: job.steps.map(step => ({
            name: step.name,
            status: step.status,
            conclusion: step.conclusion,
            number: step.number,
          })),
        })),
      };
    }),

  // Get tunnel URL from running/completed deployment
  getTunnelUrl: publicProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const { token, repo } = getGitHubConfig();

      if (!repo || !token) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "GitHub configuration incomplete"
        });
      }

      try {
        const run: WorkflowRun = await githubApi(`/repos/${repo}/actions/runs/${input.runId}`);

        // Method 1: Try to get URL from artifacts (available after upload step)
        const artifactsResponse = await githubApi(run.artifacts_url);
        const artifacts = artifactsResponse.artifacts || [];

        const deployArtifact = artifacts.find((a: any) =>
          a.name.includes("deployment")
        );

        if (deployArtifact) {
          try {
            // Download artifact zip
            const artifactResponse = await fetch(
              `${GITHUB_API_BASE}/repos/${repo}/actions/artifacts/${deployArtifact.id}/zip`,
              {
                headers: {
                  "Authorization": `Bearer ${token}`,
                  "Accept": "application/vnd.github.v3+json",
                },
              }
            );

            if (artifactResponse.ok) {
              // The artifact is a zip, but for app_url.txt it's small
              // We'll extract using a simple approach
              const buffer = await artifactResponse.arrayBuffer();
              const content = new TextDecoder().decode(buffer);

              // Look for trycloudflare URL in the content
              const urlMatch = content.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
              if (urlMatch) {
                return {
                  tunnelUrl: urlMatch[0],
                  source: "artifact",
                  status: run.status,
                  htmlUrl: run.html_url,
                };
              }
            }
          } catch (e) {
            // Artifact download failed, continue to other methods
          }
        }

        // Method 2: Try to get URL from logs (works during/after run)
        try {
          const logsResponse = await fetch(
            `${GITHUB_API_BASE}/repos/${repo}/actions/runs/${input.runId}/logs`,
            {
              headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/vnd.github.v3+json",
              },
            }
          );

          if (logsResponse.ok) {
            const buffer = await logsResponse.arrayBuffer();
            const content = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

            // Look for trycloudflare URL in logs
            const urlMatch = content.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (urlMatch) {
              return {
                tunnelUrl: urlMatch[0],
                source: "logs",
                status: run.status,
                htmlUrl: run.html_url,
              };
            }
          }
        } catch (e) {
          // Logs not available yet
        }

        // Method 3: Check job annotations
        try {
          const jobsResponse = await githubApi(run.jobs_url);
          const jobs: WorkflowJob[] = jobsResponse.jobs || [];

          for (const job of jobs) {
            const annotationsResponse = await fetch(
              `${GITHUB_API_BASE}/repos/${repo}/check-runs/${job.id}/annotations`,
              {
                headers: {
                  "Authorization": `Bearer ${token}`,
                  "Accept": "application/vnd.github.v3+json",
                },
              }
            );

            if (annotationsResponse.ok) {
              const annotations = await annotationsResponse.json();
              for (const ann of annotations) {
                const urlMatch = ann.message?.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                if (urlMatch) {
                  return {
                    tunnelUrl: urlMatch[0],
                    source: "annotation",
                    status: run.status,
                    htmlUrl: run.html_url,
                  };
                }
              }
            }
          }
        } catch (e) {
          // Annotations not available
        }

        return {
          tunnelUrl: null,
          source: null,
          status: run.status,
          message: run.status === "in_progress"
            ? "Tunnel URL will appear once the tunnel starts (check GitHub Actions for live logs)"
            : "No tunnel URL found",
          htmlUrl: run.html_url,
        };
      } catch (error) {
        return {
          tunnelUrl: null,
          source: null,
          message: "Failed to fetch tunnel URL",
        };
      }
    }),

  // Get logs and extract tunnel URL (legacy endpoint)
  getLogs: publicProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const { token, repo } = getGitHubConfig();

      if (!repo || !token) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "GitHub configuration incomplete"
        });
      }

      try {
        const run: WorkflowRun = await githubApi(`/repos/${repo}/actions/runs/${input.runId}`);
        const artifactsResponse = await githubApi(run.artifacts_url);
        const artifacts = artifactsResponse.artifacts || [];

        const deployArtifact = artifacts.find((a: any) =>
          a.name.includes("deployment") || a.name.includes("url")
        );

        return {
          tunnelUrl: null,
          logsAvailable: true,
          artifactsCount: artifacts.length,
          hasDeployArtifact: !!deployArtifact,
          htmlUrl: run.html_url,
        };
      } catch (error) {
        return {
          tunnelUrl: null,
          logsAvailable: false,
          message: "Failed to fetch logs",
        };
      }
    }),

  // List recent deployment runs
  listHistory: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10),
    }).optional())
    .query(async ({ input }) => {
      const { repo } = getGitHubConfig();

      if (!repo) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "GITHUB_REPO is not configured"
        });
      }

      const limit = input?.limit || 10;

      const response = await githubApi(
        `/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=${limit}`
      );

      const runs: WorkflowRun[] = response.workflow_runs || [];

      return runs.map(run => ({
        id: run.id,
        runNumber: run.run_number,
        status: run.status,
        conclusion: run.conclusion,
        htmlUrl: run.html_url,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        headSha: run.head_sha.slice(0, 7),
      }));
    }),

  // Cancel a running deployment
  cancel: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input }) => {
      const { repo } = getGitHubConfig();

      if (!repo) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "GITHUB_REPO is not configured"
        });
      }

      await githubApi(`/repos/${repo}/actions/runs/${input.runId}/cancel`, {
        method: "POST",
      });

      return { success: true, message: "Deployment cancelled" };
    }),

  // Re-run a failed deployment
  rerun: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input }) => {
      const { repo } = getGitHubConfig();

      if (!repo) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "GITHUB_REPO is not configured"
        });
      }

      await githubApi(`/repos/${repo}/actions/runs/${input.runId}/rerun`, {
        method: "POST",
      });

      return { success: true, message: "Deployment restarted" };
    }),
});
