import type { Express, Request, Response, NextFunction } from "express";
import { type Server as HttpServer } from "http";
import { randomUUID, createHmac, createHash, timingSafeEqual } from "crypto";
import rateLimit from "express-rate-limit";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile } from "./tools/read_file.js";
import { writeFile } from "./tools/write_file.js";
import { pushMultipleFiles } from "./tools/push_multiple_files.js";
import { listFiles } from "./tools/list_files.js";
import { createIssue } from "./tools/create_issue.js";
import { updateIssue } from "./tools/update_issue.js";
import { listIssues } from "./tools/list_issues.js";
import { addIssueComment } from "./tools/add_issue_comment.js";
import { readIssue } from "./tools/read_issue.js";
import { searchFiles } from "./tools/search_files.js";
import { moveFile } from "./tools/move_file.js";
import { deleteFile } from "./tools/delete_file.js";
import { queueWrite } from "./tools/queue_write.js";
import { flushQueue } from "./tools/flush_queue.js";
import { getRecentCommits } from "./tools/get_recent_commits.js";
import { createRepo } from "./tools/create_repo.js";
import { createBranch } from "./tools/create_branch.js";
import { listBranches } from "./tools/list_branches.js";
import { getFileDiff } from "./tools/get_file_diff.js";
import { getProjectBoard } from "./tools/get_project_board.js";
import { moveIssueToColumn } from "./tools/move_issue_to_column.js";
import { allToolSchemas } from "./tools/registry.js";
import { checkGithubStatus, getLastSuccessfulOperation, getUptimeSeconds } from "./lib/health.js";
import { persistLog, persistLogWithIp } from "./lib/persistent-log.js";

const allTools = allToolSchemas;

const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  read_file: readFile,
  write_file: writeFile,
  push_multiple_files: pushMultipleFiles,
  list_files: listFiles,
  create_issue: createIssue,
  update_issue: updateIssue,
  list_issues: listIssues,
  add_issue_comment: addIssueComment,
  read_issue: readIssue,
  search_files: searchFiles,
  move_file: moveFile,
  delete_file: deleteFile,
  queue_write: queueWrite,
  flush_queue: flushQueue,
  get_recent_commits: getRecentCommits,
  create_repo: createRepo,
  create_branch: createBranch,
  list_branches: listBranches,
  get_file_diff: getFileDiff,
  get_project_board: getProjectBoard,
  move_issue_to_column: moveIssueToColumn,
};

function createMcpServer(): Server {
  const mcpServer = new Server(
    { name: "gitbridge-mcp", version: "2.0.0" },
    { capabilities: { tools: {} } }
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    };
  });

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = toolHandlers[name];
    if (!handler) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    try {
      return await handler(args || {});
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] [MCP] Unhandled error in tool '${name}':`, error);
      return {
        content: [{ type: "text", text: `Internal error in tool '${name}': ${error.message}` }],
        isError: true,
      };
    }
  });

  return mcpServer;
}

const ALLOWED_ORIGINS = [
  "https://claude.ai",
  "https://www.claude.ai",
  "https://claude.com",
  "https://www.claude.com",
];

function setCorsHeaders(res: Response, origin?: string): boolean {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, Mcp-Session-Id");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  }
  res.setHeader("Vary", "Origin");
  return true;
}

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;

if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
  console.error("FATAL: OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET are required.");
  console.error("Both must be set to secure the MCP endpoints with OAuth 2.0 authentication.");
  console.error("Generate them with: openssl rand -hex 16 (for ID) and openssl rand -hex 32 (for secret)");
  process.exit(1);
}

const authCodes: Map<string, {
  clientId: string;
  redirectUri: string;
  expiresAt: number;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}> = new Map();

const refreshTokens: Map<string, {
  clientId: string;
  expiresAt: number;
}> = new Map();

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

console.log(`[${new Date().toISOString()}] [MCP] OAuth 2.0 authentication is ENABLED`);
console.log(`[${new Date().toISOString()}] [MCP] Authorization endpoint: /authorize`);
console.log(`[${new Date().toISOString()}] [MCP] Token endpoint: /oauth/token`);
console.log(`[${new Date().toISOString()}] [MCP] MCP endpoint: /mcp`);

function base64UrlEncode(data: Buffer): string {
  return data.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signJwt(payload: Record<string, any>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  return `${headerB64}.${payloadB64}.${base64UrlEncode(signature)}`;
}

function verifyJwt(token: string, secret: string): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  const expectedSig = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const actualSig = Buffer.from(signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (expectedSig.length !== actualSig.length) return null;
  if (!timingSafeEqual(expectedSig, actualSig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    const dummy = Buffer.alloc(bufA.length);
    timingSafeEqual(bufA, dummy);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

const ALLOWED_REDIRECT_PATTERNS = [
  /^https:\/\/(www\.)?claude\.(ai|com)(\/|$)/,
];

function isAllowedRedirectUri(uri: string): boolean {
  return ALLOWED_REDIRECT_PATTERNS.some((p) => p.test(uri));
}

function getServerOrigin(req: Request): string {
  const proto = (req.get("x-forwarded-proto") || req.protocol).split(",")[0].trim();
  return `${proto}://${req.get("host")}`;
}

function requireAuth(req: Request, res: Response): boolean {
  const origin = getServerOrigin(req);
  const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource`;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log(`[${new Date().toISOString()}] [Auth] REJECTED ${req.method} ${req.path} — missing or malformed Authorization header (IP: ${req.ip})`);
    persistLogWithIp({ event: "AUTH_REJECTED", method: req.method, path: req.path, reason: "missing_header" }, req.ip || "");
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}"`);
    res.status(401).json({ error: "unauthorized", error_description: "Missing or invalid Authorization header" });
    return false;
  }
  const token = authHeader.slice(7);
  const payload = verifyJwt(token, OAUTH_CLIENT_SECRET!);
  if (!payload) {
    console.log(`[${new Date().toISOString()}] [Auth] REJECTED ${req.method} ${req.path} — token invalid or expired (IP: ${req.ip})`);
    persistLogWithIp({ event: "AUTH_REJECTED", method: req.method, path: req.path, reason: "invalid_or_expired_token" }, req.ip || "");
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token"`);
    res.status(401).json({ error: "invalid_token", error_description: "Token is invalid or expired" });
    return false;
  }
  return true;
}

const sseTransports: Record<string, SSEServerTransport> = {};
const streamableTransports: Record<string, StreamableHTTPServerTransport> = {};

const MAX_SESSIONS = Math.max(1, parseInt(process.env.MAX_SESSIONS || "50", 10) || 50);

const tokenRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", error_description: "Rate limit exceeded. Try again later." },
});

setInterval(() => {
  const now = Date.now();
  let sweptCodes = 0;
  for (const [code, data] of authCodes) {
    if (data.expiresAt < now) {
      authCodes.delete(code);
      sweptCodes++;
    }
  }
  let sweptRefresh = 0;
  for (const [token, data] of refreshTokens) {
    if (data.expiresAt < now) {
      refreshTokens.delete(token);
      sweptRefresh++;
    }
  }
  if (sweptCodes > 0 || sweptRefresh > 0) {
    console.log(`[${new Date().toISOString()}] [OAuth] Swept ${sweptCodes} expired auth code(s), ${sweptRefresh} expired refresh token(s)`);
  }
}, 60 * 1000);

function totalSessions(): number {
  return Object.keys(sseTransports).length + Object.keys(streamableTransports).length;
}

export async function registerRoutes(
  httpServer: HttpServer,
  app: Express
): Promise<HttpServer> {

  const protectedResourceHandler = (req: Request, res: Response) => {
    setCorsHeaders(res, req.headers.origin);
    const origin = getServerOrigin(req);
    res.json({
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      resource_name: "gitbridge-mcp",
      bearer_methods_supported: ["header"],
    });
  };
  app.get("/.well-known/oauth-protected-resource/mcp", protectedResourceHandler);
  app.get("/.well-known/oauth-protected-resource", protectedResourceHandler);

  app.get("/.well-known/oauth-authorization-server", (req: Request, res: Response) => {
    setCorsHeaders(res, req.headers.origin);
    const origin = getServerOrigin(req);
    res.json({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "client_credentials", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
    });
  });

  app.get("/authorize", (req: Request, res: Response) => {
    const responseType = req.query.response_type as string;
    const clientId = req.query.client_id as string;
    const redirectUri = req.query.redirect_uri as string;
    const state = req.query.state as string | undefined;
    const codeChallenge = req.query.code_challenge as string | undefined;
    const codeChallengeMethod = req.query.code_challenge_method as string | undefined;

    if (responseType !== "code") {
      res.status(400).json({ error: "unsupported_response_type", error_description: "Only response_type=code is supported" });
      return;
    }

    if (!clientId || clientId !== OAUTH_CLIENT_ID) {
      res.status(400).json({ error: "invalid_client", error_description: "Unknown client_id" });
      return;
    }

    if (!redirectUri) {
      res.status(400).json({ error: "invalid_request", error_description: "redirect_uri is required" });
      return;
    }

    if (!isAllowedRedirectUri(redirectUri)) {
      console.log(`[${new Date().toISOString()}] [OAuth] Rejected redirect_uri: ${redirectUri}`);
      res.status(400).json({ error: "invalid_request", error_description: "redirect_uri is not in the allowed list" });
      return;
    }

    if (codeChallenge && codeChallengeMethod && codeChallengeMethod !== "S256") {
      res.status(400).json({ error: "invalid_request", error_description: "Only code_challenge_method=S256 is supported" });
      return;
    }

    const code = randomUUID();
    authCodes.set(code, {
      clientId,
      redirectUri,
      expiresAt: Date.now() + 10 * 60 * 1000,
      codeChallenge,
      codeChallengeMethod,
    });

    console.log(`[${new Date().toISOString()}] [OAuth] Authorization code issued for client: ${clientId}${codeChallenge ? " (PKCE)" : ""}`);

    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);

    res.redirect(302, redirectUrl.toString());
  });

  app.options("/oauth/token", (req: Request, res: Response) => {
    setCorsHeaders(res, req.headers.origin);
    res.status(204).end();
  });

  app.post("/oauth/token", (req: Request, res: Response, next: NextFunction) => {
    setCorsHeaders(res, req.headers.origin);
    next();
  }, tokenRateLimiter, (req: Request, res: Response) => {
    let grantType: string | undefined;
    let clientId: string | undefined;
    let clientSecret: string | undefined;
    let code: string | undefined;
    let redirectUri: string | undefined;

    let incomingRefreshToken: string | undefined;

    if (req.is("application/x-www-form-urlencoded")) {
      grantType = req.body.grant_type;
      clientId = req.body.client_id;
      clientSecret = req.body.client_secret;
      code = req.body.code;
      redirectUri = req.body.redirect_uri;
      incomingRefreshToken = req.body.refresh_token;
    } else {
      grantType = req.body?.grant_type;
      clientId = req.body?.client_id;
      clientSecret = req.body?.client_secret;
      code = req.body?.code;
      redirectUri = req.body?.redirect_uri;
      incomingRefreshToken = req.body?.refresh_token;
    }

    if (grantType !== "client_credentials" && grantType !== "authorization_code" && grantType !== "refresh_token") {
      res.status(400).json({ error: "unsupported_grant_type", error_description: "Supported grant types: client_credentials, authorization_code, refresh_token" });
      return;
    }

    if (!clientId) {
      res.status(400).json({ error: "invalid_request", error_description: "client_id is required" });
      return;
    }

    if (!safeCompare(clientId, OAUTH_CLIENT_ID!)) {
      res.status(401).json({ error: "invalid_client", error_description: "Invalid client_id" });
      return;
    }

    if (!clientSecret) {
      res.status(400).json({ error: "invalid_request", error_description: "client_secret is required" });
      return;
    }

    if (!safeCompare(clientSecret, OAUTH_CLIENT_SECRET!)) {
      res.status(401).json({ error: "invalid_client", error_description: "Invalid client_secret" });
      return;
    }

    if (grantType === "authorization_code") {
      if (!code) {
        res.status(400).json({ error: "invalid_request", error_description: "code is required for authorization_code grant" });
        return;
      }

      const stored = authCodes.get(code);
      if (!stored) {
        res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired authorization code" });
        return;
      }

      authCodes.delete(code);

      if (stored.expiresAt < Date.now()) {
        res.status(400).json({ error: "invalid_grant", error_description: "Authorization code has expired" });
        return;
      }

      if (stored.clientId !== clientId) {
        res.status(400).json({ error: "invalid_grant", error_description: "Authorization code was issued to a different client" });
        return;
      }

      if (redirectUri && stored.redirectUri !== redirectUri) {
        res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri does not match" });
        return;
      }

      if (stored.codeChallenge) {
        const codeVerifier = req.body?.code_verifier;
        if (!codeVerifier) {
          res.status(400).json({ error: "invalid_request", error_description: "code_verifier is required" });
          return;
        }
        const computedChallenge = createHash("sha256")
          .update(codeVerifier)
          .digest("base64url");
        if (computedChallenge !== stored.codeChallenge) {
          res.status(400).json({ error: "invalid_grant", error_description: "PKCE code_verifier does not match code_challenge" });
          return;
        }
      }
    }

    if (grantType === "refresh_token") {
      if (!incomingRefreshToken) {
        res.status(400).json({ error: "invalid_request", error_description: "refresh_token is required for refresh_token grant" });
        return;
      }

      const storedRefresh = refreshTokens.get(incomingRefreshToken);
      if (!storedRefresh) {
        console.log(`[${new Date().toISOString()}] [OAuth] Refresh token not found (client: ${clientId})`);
        persistLogWithIp({ event: "REFRESH_REJECTED", reason: "not_found", client: clientId }, req.ip || "");
        res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired refresh token" });
        return;
      }

      if (storedRefresh.expiresAt < Date.now()) {
        refreshTokens.delete(incomingRefreshToken);
        console.log(`[${new Date().toISOString()}] [OAuth] Refresh token expired (client: ${clientId})`);
        persistLogWithIp({ event: "REFRESH_REJECTED", reason: "expired", client: clientId }, req.ip || "");
        res.status(400).json({ error: "invalid_grant", error_description: "Refresh token has expired" });
        return;
      }

      if (storedRefresh.clientId !== clientId) {
        refreshTokens.delete(incomingRefreshToken);
        console.log(`[${new Date().toISOString()}] [OAuth] Refresh token client mismatch (expected: ${storedRefresh.clientId}, got: ${clientId})`);
        persistLogWithIp({ event: "REFRESH_REJECTED", reason: "client_mismatch", client: clientId }, req.ip || "");
        res.status(400).json({ error: "invalid_grant", error_description: "Refresh token was issued to a different client" });
        return;
      }

      refreshTokens.delete(incomingRefreshToken);
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 86400;
    const payload = { sub: clientId, iat: now, exp: now + expiresIn };
    const accessToken = signJwt(payload, OAUTH_CLIENT_SECRET!);

    const newRefreshToken = randomUUID();
    refreshTokens.set(newRefreshToken, {
      clientId: clientId!,
      expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
    });

    console.log(`[${new Date().toISOString()}] [OAuth] Access token issued for client: ${clientId} (grant: ${grantType})`);
    if (grantType === "refresh_token") {
      persistLogWithIp({ event: "REFRESH_ISSUED", grant: grantType, client: clientId }, req.ip || "");
    } else {
      persistLogWithIp({ event: "TOKEN_ISSUED", grant: grantType, client: clientId }, req.ip || "");
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
    });
  });

  if (process.env.NODE_ENV === "development") {
    app.get("/api/dev-credentials", (req: Request, res: Response) => {
      const remoteIp = req.ip || req.socket.remoteAddress || "";
      const isLocal = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"].includes(remoteIp);
      const isPrivate = /^(::ffff:)?(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(remoteIp);
      if (!isLocal && !isPrivate) {
        res.status(403).json({ error: "dev-credentials is only available from local/private networks" });
        return;
      }
      res.json({
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
      });
    });
  }

  app.get("/api/status", (req: Request, res: Response) => {
    const publicResponse = {
      status: "running",
      server: "gitbridge-mcp",
      version: "2.0.0",
    };

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.json(publicResponse);
      return;
    }
    const token = authHeader.slice(7);
    const payload = verifyJwt(token, OAUTH_CLIENT_SECRET!);
    if (!payload) {
      res.json(publicResponse);
      return;
    }

    res.json({
      ...publicResponse,
      authenticated: true,
      mode: "multi-repo",
      mcpPath: "/mcp",
      ssePath: "/sse",
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/oauth/token",
      tools: allTools.map((t) => ({
        name: t.name,
        category: t.category,
        description: t.description,
        phase: "live",
      })),
      activeSessions: totalSessions(),
      maxSessions: MAX_SESSIONS,
    });
  });

  app.get("/health", async (_req: Request, res: Response) => {
    try {
      const githubStatus = await checkGithubStatus();
      res.json({
        server: "up",
        github_api: githubStatus.github_api,
        pat_valid: githubStatus.pat_valid,
        pat_expires: githubStatus.pat_expires,
        last_successful_operation: getLastSuccessfulOperation(),
        uptime_seconds: getUptimeSeconds(),
      });
    } catch {
      res.json({
        server: "up",
        github_api: "unknown",
        pat_valid: false,
        pat_expires: "unknown",
        last_successful_operation: getLastSuccessfulOperation(),
        uptime_seconds: getUptimeSeconds(),
      });
    }
  });

  app.options("/mcp", (req: Request, res: Response) => {
    setCorsHeaders(res, req.headers.origin);
    res.status(204).end();
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    setCorsHeaders(res, req.headers.origin);
    if (!requireAuth(req, res)) return;

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && streamableTransports[sessionId]) {
      console.log(`[${new Date().toISOString()}] [MCP] Streamable HTTP POST (existing session: ${sessionId})`);
      const transport = streamableTransports[sessionId];
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (sessionId && !streamableTransports[sessionId]) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session not found. Send an initialize request first." },
        id: null,
      });
      return;
    }

    if (totalSessions() >= MAX_SESSIONS) {
      console.log(`[${new Date().toISOString()}] [MCP] Session cap reached (${MAX_SESSIONS}), rejecting new Streamable HTTP session`);
      res.status(503).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: `Server session limit reached (${MAX_SESSIONS}). Try again later.` },
        id: null,
      });
      return;
    }

    console.log(`[${new Date().toISOString()}] [MCP] Streamable HTTP POST (new session)`);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const mcpServer = createMcpServer();

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        console.log(`[${new Date().toISOString()}] [MCP] Streamable session closed: ${sid}`);
        persistLog({ event: "SESSION_CLOSE", session: sid });
        delete streamableTransports[sid];
      }
    };

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);

    if (transport.sessionId) {
      streamableTransports[transport.sessionId] = transport;
      console.log(`[${new Date().toISOString()}] [MCP] Streamable session started: ${transport.sessionId}`);
      persistLog({ event: "SESSION_START", session: transport.sessionId });
    }
  });

  app.get("/mcp", async (req: Request, res: Response) => {
    setCorsHeaders(res, req.headers.origin);
    if (!requireAuth(req, res)) return;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !streamableTransports[sessionId]) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or missing session ID. Send an initialize request via POST first." },
        id: null,
      });
      return;
    }

    console.log(`[${new Date().toISOString()}] [MCP] Streamable HTTP GET (SSE stream) for session: ${sessionId}`);
    const transport = streamableTransports[sessionId];
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
    setCorsHeaders(res, req.headers.origin);
    if (!requireAuth(req, res)) return;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !streamableTransports[sessionId]) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or missing session ID" },
        id: null,
      });
      return;
    }

    console.log(`[${new Date().toISOString()}] [MCP] Streamable HTTP DELETE for session: ${sessionId}`);
    const transport = streamableTransports[sessionId];
    await transport.handleRequest(req, res);
    delete streamableTransports[sessionId];
  });

  app.options("/sse", (req: Request, res: Response) => {
    setCorsHeaders(res, req.headers.origin);
    res.status(204).end();
  });

  app.options("/messages", (req: Request, res: Response) => {
    setCorsHeaders(res, req.headers.origin);
    res.status(204).end();
  });

  app.get("/sse", async (req: Request, res: Response) => {
    setCorsHeaders(res, req.headers.origin);
    if (!requireAuth(req, res)) return;

    if (totalSessions() >= MAX_SESSIONS) {
      console.log(`[${new Date().toISOString()}] [MCP] Session cap reached (${MAX_SESSIONS}), rejecting new SSE session`);
      res.status(503).json({ error: "service_unavailable", error_description: `Server session limit reached (${MAX_SESSIONS}). Try again later.` });
      return;
    }

    console.log(`[${new Date().toISOString()}] [MCP] New SSE connection request`);

    const mcpServer = createMcpServer();
    const transport = new SSEServerTransport("/messages", res);
    sseTransports[transport.sessionId] = transport;

    transport.onclose = () => {
      console.log(`[${new Date().toISOString()}] [MCP] SSE session closed: ${transport.sessionId}`);
      persistLog({ event: "SESSION_CLOSE", session: transport.sessionId });
      delete sseTransports[transport.sessionId];
    };

    await mcpServer.connect(transport);
    console.log(`[${new Date().toISOString()}] [MCP] SSE session started: ${transport.sessionId}`);
    persistLog({ event: "SESSION_START", session: transport.sessionId });
  });

  app.post("/messages", async (req: Request, res: Response) => {
    setCorsHeaders(res, req.headers.origin);
    if (!requireAuth(req, res)) return;
    const sessionId = req.query.sessionId as string;
    const transport = sseTransports[sessionId];

    if (!transport) {
      res.status(400).json({ error: "Invalid or expired session ID" });
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  return httpServer;
}
