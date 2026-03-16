import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileText,
  CircleDot,
  CheckCircle2,
  Clock,
  Server,
  Link2,
  Copy,
  ShieldCheck,
  KeyRound,
  Search,
  Layers,
  Lock,
  LogOut,
  GitFork,
  FolderGit,
  LayoutDashboard,
  Wrench,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { SiGithub } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ToolInfo {
  name: string;
  category: string;
  description: string;
  phase: number;
}

interface PublicStatusData {
  status: string;
  server: string;
  version: string;
}

interface AuthenticatedStatusData extends PublicStatusData {
  authenticated: true;
  mode: string;
  mcpPath: string;
  ssePath: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  tools: ToolInfo[];
  activeSessions: number;
}

type StatusData = PublicStatusData | AuthenticatedStatusData;

function getStoredToken(): string | null {
  try {
    const stored = sessionStorage.getItem("mcp_admin_token");
    if (!stored) return null;
    const { token, exp } = JSON.parse(stored);
    if (exp && exp < Math.floor(Date.now() / 1000)) {
      sessionStorage.removeItem("mcp_admin_token");
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

function storeToken(token: string, expiresIn: number) {
  sessionStorage.setItem("mcp_admin_token", JSON.stringify({
    token,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  }));
}

function clearToken() {
  sessionStorage.removeItem("mcp_admin_token");
}

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [loginClientId, setLoginClientId] = useState("");
  const [loginClientSecret, setLoginClientSecret] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const isEmbedded = typeof window !== "undefined" && window.self !== window.top;
  const [devAutoLoginAttempted, setDevAutoLoginAttempted] = useState(false);

  const { data, isLoading, error } = useQuery<StatusData>({
    queryKey: ["/api/status"],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      const currentToken = getStoredToken();
      if (currentToken) {
        headers["Authorization"] = `Bearer ${currentToken}`;
      }
      const res = await fetch("/api/status", { headers });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  const isAuthenticated = data?.authenticated === true;

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      const res = await fetch("/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: loginClientId,
          client_secret: loginClientSecret,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoginError(body.error_description || "Invalid credentials");
        setLoginLoading(false);
        return;
      }

      const body = await res.json();
      storeToken(body.access_token, body.expires_in || 3600);
      setToken(body.access_token);
      await queryClient.refetchQueries({ queryKey: ["/api/status"] });
      setLoginLoading(false);
    } catch {
      setLoginError("Failed to connect to the server");
      setLoginLoading(false);
    }
  }, [loginClientId, loginClientSecret, queryClient]);

  const handleLogout = useCallback(async () => {
    setLogoutLoading(true);
    setLoginLoading(false);
    clearToken();
    setToken(null);
    await queryClient.refetchQueries({ queryKey: ["/api/status"] });
    setLogoutLoading(false);
  }, [queryClient]);

  useEffect(() => {
    if (devAutoLoginAttempted || isAuthenticated || token) return;
    if (import.meta.env.MODE !== "development") return;

    setDevAutoLoginAttempted(true);
    fetch("/api/dev-credentials")
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((creds) => {
        if (!creds?.client_id || !creds?.client_secret) return;
        setLoginClientId(creds.client_id);
        setLoginClientSecret(creds.client_secret);
        return fetch("/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: creds.client_id,
            client_secret: creds.client_secret,
          }),
        });
      })
      .then((res) => res?.json())
      .then((body) => {
        if (!body?.access_token) return;
        storeToken(body.access_token, body.expires_in || 3600);
        setToken(body.access_token);
        queryClient.refetchQueries({ queryKey: ["/api/status"] });
      })
      .catch(() => {});
  }, [devAutoLoginAttempted, isAuthenticated, token, queryClient]);

  const mcpUrl = typeof window !== "undefined" && isAuthenticated
    ? `${window.location.origin}${(data as AuthenticatedStatusData).mcpPath}`
    : "";

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard", description: text });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="loading-state">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Connecting to server...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="error-state">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive font-medium">Failed to connect to server</p>
            <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated && loginLoading && token) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="signing-in-state">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Signing in...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="public-landing">
        <div className="max-w-md w-full p-6 space-y-6">
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight" data-testid="text-server-name">
                gitbridge-mcp
              </h1>
              <div className="flex items-center justify-center gap-2 mt-1">
                <Badge variant="secondary" data-testid="badge-version">v{data?.version}</Badge>
                <Badge variant={data?.status === "running" ? "default" : "destructive"} data-testid="badge-status">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {data?.status}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              This is a private MCP bridge server. Sign in with your OAuth credentials to view server details.
            </p>
          </div>

          {isEmbedded && (
            <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 p-3" data-testid="banner-iframe-warning">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Password manager autofill is disabled in embedded previews.{" "}
                  <strong>Open in new tab</strong> for full autofill support, or enter credentials manually below.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(window.location.href, "_blank")}
                  data-testid="button-open-new-tab"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Open in new tab
                </Button>
              </div>
            </div>
          )}

          <Card data-testid="card-login">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                Sign In
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4" autoComplete={isEmbedded ? "off" : "on"}>
                <div className="space-y-2">
                  <Label htmlFor="client-id">Client ID</Label>
                  <Input
                    id="client-id"
                    type={isEmbedded ? "text" : "text"}
                    autoComplete={isEmbedded ? "off" : "username"}
                    {...(isEmbedded && { "data-1p-ignore": true, "data-lpignore": "true" })}
                    placeholder="Enter OAuth Client ID"
                    value={loginClientId}
                    onChange={(e) => setLoginClientId(e.target.value)}
                    required
                    data-testid="input-client-id"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-secret">Client Secret</Label>
                  <Input
                    id="client-secret"
                    type="password"
                    autoComplete={isEmbedded ? "off" : "current-password"}
                    {...(isEmbedded && { "data-1p-ignore": true, "data-lpignore": "true" })}
                    placeholder="Enter OAuth Client Secret"
                    value={loginClientSecret}
                    onChange={(e) => setLoginClientSecret(e.target.value)}
                    required
                    data-testid="input-client-secret"
                  />
                </div>
                {loginError && (
                  <p className="text-sm text-destructive" data-testid="text-login-error">{loginError}</p>
                )}
                <Button type="submit" className="w-full" disabled={loginLoading} data-testid="button-login">
                  {loginLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            MCP bridge server &middot; OAuth 2.0 protected
          </p>
        </div>
      </div>
    );
  }

  const authData = data as AuthenticatedStatusData;
  const phase1Tools = authData.tools.filter((t) => t.phase !== 2);
  const phase2Tools = authData.tools.filter((t) => t.phase === 2);

  const categoryMeta: Record<string, { label: string; icon: typeof FileText }> = {
    file: { label: "File Tools", icon: FileText },
    issue: { label: "Issue Tools", icon: CircleDot },
    search: { label: "Search & History", icon: Search },
    advanced: { label: "Advanced (Move, Delete, Batch)", icon: Layers },
    repo: { label: "Repo Management", icon: GitFork },
    branch: { label: "Branch Management", icon: FolderGit },
    project: { label: "Project Boards", icon: LayoutDashboard },
  };
  const defaultCategoryMeta = { label: "Other Tools", icon: Wrench };

  const phase1ByCategory = phase1Tools.reduce<Record<string, ToolInfo[]>>((acc, tool) => {
    const cat = tool.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tool);
    return acc;
  }, {});

  const categoryOrder = ["file", "issue", "search", "advanced", "repo", "branch", "project"];
  const sortedCategories = Object.keys(phase1ByCategory).sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-server-name">
              gitbridge-mcp
            </h1>
            <Badge variant="secondary" data-testid="badge-version">v{authData.version}</Badge>
            <Badge
              variant={authData.status === "running" ? "default" : "destructive"}
              data-testid="badge-status"
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {authData.status}
            </Badge>
            <Badge variant="outline" data-testid="badge-mode">
              <SiGithub className="w-3 h-3 mr-1" />
              {authData.mode}
            </Badge>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={handleLogout} disabled={logoutLoading} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-1" />
              {logoutLoading ? "Signing out..." : "Sign Out"}
            </Button>
          </div>
          <p className="text-muted-foreground">
            MCP bridge server connecting Claude Chat to any GitHub repository via the Model Context Protocol.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card data-testid="card-mode">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <SiGithub className="w-4 h-4" />
                <span>Mode</span>
              </div>
              <span className="font-medium text-foreground" data-testid="text-mode">
                Multi-repo (owner/repo per tool call)
              </span>
            </CardContent>
          </Card>

          <Card data-testid="card-tools-count">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Server className="w-4 h-4" />
                <span>Tools Registered</span>
              </div>
              <span className="font-medium text-foreground">{authData.tools.length} available</span>
            </CardContent>
          </Card>

          <Card data-testid="card-sessions">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Link2 className="w-4 h-4" />
                  <span>Active Sessions</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => queryClient.refetchQueries({ queryKey: ["/api/status"] })}
                  data-testid="button-refresh-sessions"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Refresh
                </Button>
              </div>
              <span className="font-medium text-foreground" data-testid="text-sessions">
                {authData.activeSessions}
              </span>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-auth">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm" data-testid="text-auth-status">OAuth 2.0 authenticated</p>
                <p className="text-xs text-muted-foreground">
                  All MCP endpoints are protected with OAuth 2.0. See the connection details below to set up Claude.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-connect" className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Connect to Claude
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Go to <strong>claude.ai &rarr; Settings &rarr; Connectors &rarr; Add custom connector</strong>, then fill in the fields below.
            </p>
          </CardHeader>
          <CardContent className="space-y-4" data-testid="text-setup-steps">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono" data-testid="text-connector-name">GitHub MCP</code>
                <Button size="icon" variant="outline" onClick={() => copyToClipboard("GitHub MCP")} data-testid="button-copy-name">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Remote MCP server URL</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono break-all" data-testid="text-mcp-url">{mcpUrl}</code>
                <Button size="icon" variant="outline" onClick={() => copyToClipboard(mcpUrl)} data-testid="button-copy-mcp-url">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Separator />
            <p className="text-xs text-muted-foreground">Expand <strong>Advanced settings</strong> in the Claude connector form to see these fields.</p>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">OAuth Credentials</label>
              <div className="bg-muted/60 border border-border rounded-md px-3 py-2.5 text-xs text-muted-foreground space-y-1" data-testid="text-oauth-credentials-hint">
                <p>Open the <strong>Secrets</strong> panel in Replit (lock icon) and copy the values of <code className="bg-background px-1 rounded font-mono">OAUTH_CLIENT_ID</code> and <code className="bg-background px-1 rounded font-mono">OAUTH_CLIENT_SECRET</code> into the Claude connector form.</p>
              </div>
            </div>

            <Separator />
            <p className="text-xs text-muted-foreground">
              Click <strong>Add</strong> — Claude will automatically discover all OAuth endpoints and tools via the server's metadata.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Active Tools</h2>

          {sortedCategories.map((cat) => {
            const meta = categoryMeta[cat] || defaultCategoryMeta;
            const Icon = meta.icon;
            const tools = phase1ByCategory[cat];
            return (
              <div key={cat} className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {meta.label}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tools.map((tool) => (
                    <Card key={tool.name} data-testid={`card-tool-${tool.name}`}>
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-mono font-medium">{tool.name}</code>
                          <Badge variant="outline" className="text-xs no-default-active-elevate">
                            <CheckCircle2 className="w-3 h-3 mr-1 text-green-600 dark:text-green-400" />
                            active
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{tool.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {phase2Tools.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Roadmap
                <Badge variant="secondary" className="no-default-active-elevate">
                  <Clock className="w-3 h-3 mr-1" />
                  coming soon
                </Badge>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {phase2Tools.map((tool) => (
                  <Card key={tool.name} className="opacity-60" data-testid={`card-tool-${tool.name}`}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-sm font-mono font-medium">{tool.name}</code>
                        <Badge variant="secondary" className="text-xs no-default-active-elevate">
                          <Clock className="w-3 h-3 mr-1" />
                          stub
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tool.description.replace("[Phase 2] ", "")}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Initial Setup</h2>
          <p className="text-sm text-muted-foreground">
            Prerequisites before connecting Claude (one-time setup):
          </p>
          <div className="space-y-3">
            {[
              "Create a GitHub Personal Access Token with 'repo' scope",
              "Set GITHUB_PERSONAL_ACCESS_TOKEN in the Secrets tab",
              "Set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET in the Secrets tab for authentication",
              "Deploy this server (click Run in Replit)",
              "Create a Claude Project with a system prompt that locks Claude to your owner/repo",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center">
                  {i + 1}
                </span>
                <p className="text-sm pt-0.5" data-testid={`text-step-${i + 1}`}>{step}</p>
              </div>
            ))}
          </div>

          <Card className="bg-muted/50 mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Example Claude Project System Prompt</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed overflow-x-auto" data-testid="text-system-prompt-template">
{`You are working exclusively in the GitHub repository:
owner=YOUR_USERNAME repo=YOUR_REPO

Pass these values on every tool call to the GitHub MCP bridge.
Never write to any other repository regardless of what the user asks.
If asked to work in a different repo, tell the user to switch to
the appropriate Claude Project for that repository.

## Session Startup (do this every conversation)

1. Read \`CLAUDE.md\` at the repo root — this is your full operating
   manual with permissions, write discipline, and conventions.
2. Read \`AGENTS.md\` and \`AGENTS-replit.md\` — these define the
   multi-agent collaboration workflow.
3. Call \`list_files\` to confirm connectivity.
4. Check \`docs/plans/\` for active plans (status: executing).
5. Check open Issues with \`list_issues\`.
6. Ask the user what they want to work on.

## Critical Rules (always active, even before reading CLAUDE.md)

- NEVER commit a file without showing the user the content first
  and getting explicit approval.
- NEVER overwrite an existing file without reading the current
  version first.
- NEVER delete a file without the user confirming the specific
  file path.
- For all other rules, defer to CLAUDE.md and AGENTS.md in the repo.

## Your Role

You are the PM and strategist for this project. You write plans,
specs, documentation, and issues. You do not own implementation
code — that belongs to Replit Agent. Propose technical ideas inside
plan docs and issue bodies, not as committed code files in Replit
Agent's protected directories (server/, client/, script/).

See CLAUDE.md for the full permissions model and AGENTS-replit.md
for workspace boundaries.`}
              </pre>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-muted/50">
          <CardContent className="pt-5 pb-4">
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre leading-relaxed" data-testid="text-architecture">
{`  Claude Chat (claude.ai)
    ↕ custom MCP connector (OAuth 2.0)
  MCP Bridge Server (Replit) — multi-repo mode
    ↕ GitHub API (Octokit)
  Any GitHub Repo (files + Issues)`}
            </pre>
          </CardContent>
        </Card>

        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            MIT License &middot; gitbridge-mcp v{authData.version}
          </p>
        </div>
      </div>
    </div>
  );
}
