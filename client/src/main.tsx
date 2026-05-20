import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl, isOAuthConfigured } from "./const";
import { isAuthRequiredError } from "@/lib/appBlockers";
import { wireOfflineCacheToTrpc } from "./modules/agent-studio/services/offline-cache-app-wireup";
import { bootstrapClientErrorReporter } from "@/lib/error-reporter";
import "./index.css";

const queryClient = new QueryClient();
// Universal error event log — wires mutation + query error subscribers,
// window.onerror, and unhandledrejection into
// `agentStudio.clientObservability.recordClientError` → server-side
// `logs/error-events-YYYY-MM-DD.jsonl` + `ags_workspace_error_events`.
bootstrapClientErrorReporter(queryClient);

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  if (!isAuthRequiredError(error)) return;

  if (!isOAuthConfigured()) {
    console.warn("OAuth not configured, skipping redirect to login");
    return;
  }

  const loginUrl = getLoginUrl();
  if (loginUrl) {
    window.location.href = loginUrl;
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

void wireOfflineCacheToTrpc();

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
