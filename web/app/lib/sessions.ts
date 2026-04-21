import { AuthProvider, LoginSessionRecord } from "@santra/shared";

/**
 * server-side singleton for login sessions.
 * In production, this should be replaced with Redis or a database.
 * We use a global variable to persist between hot-reloads in development.
 */
const globalForSessions = global as unknown as {
  santraSessions?: Map<string, LoginSessionRecord>;
};

const sessions = globalForSessions.santraSessions ?? new Map<string, LoginSessionRecord>();

if (process.env.NODE_ENV !== "production") {
  globalForSessions.santraSessions = sessions;
}

export function createSession(token: string): LoginSessionRecord {
  const session: LoginSessionRecord = {
    token,
    createdAt: Date.now(),
    status: "pending",
  };
  sessions.set(token, session);
  return session;
}

export function getSession(token: string): LoginSessionRecord | undefined {
  return sessions.get(token);
}

export function updateSession(
  token: string,
  provider: AuthProvider
): LoginSessionRecord | undefined {
  const session = sessions.get(token);
  if (!session) return undefined;

  const updated: LoginSessionRecord = {
    ...session,
    status: "completed",
    provider,
  };
  sessions.set(token, updated);
  return updated;
}

export function deleteSession(token: string): boolean {
  return sessions.delete(token);
}
