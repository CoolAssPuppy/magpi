// POST /connections-scopes. Lists what the provider offers, and saves `routes` when it is sent.

import { ApiError, jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { connectionsScopesSchema, parseBody } from '../_shared/validate.ts';
import { serviceClient } from '../_shared/db.ts';
import { enforceRateLimits } from '../_shared/rate_limit.ts';
import { requireUser } from '../_shared/auth.ts';
import {
  loadConnection,
  requireConnectionAccess,
  requireRoutableSpaces,
} from '../_shared/connections.ts';
import { liveHttp } from '../_shared/deps.ts';
import { buildScopeSelection, storedSelectionOf } from '../_shared/scope_selection.ts';
import { SourceError } from '../_shared/sources/contract.ts';
import { driverFor } from '../_shared/sources/index.ts';
import { resolveCredentials } from '../_shared/token_refresh.ts';

serveFunction('connections-scopes', async (core) => {
  const input = parseBody(connectionsScopesSchema, core.body);
  const user = await requireUser(core.headers);
  const db = serviceClient();

  await enforceRateLimits(db, [
    { bucket: `connections-scopes:user:${user.id}`, limit: 60, windowSeconds: 600 },
  ]);

  const connection = await loadConnection(db, input.connection_id);
  if (!connection) throw new ApiError(404, 'unknown_connection', 'no such connection');
  // Membership rather than ownership, since a team space's connections belong to the space.
  await requireConnectionAccess(db, user.id, connection);

  const driver = driverFor(connection.provider);
  if (driver.scopeSelectionKind === null) {
    throw new ApiError(400, 'no_scope_selection', `${connection.provider} reads the whole account`);
  }

  const stored = storedSelectionOf(connection.scope_selection);
  const routes = input.routes ?? stored?.routes ?? {};

  // Only the routes the caller sent are checked. A stored route was checked when it was stored.
  if (input.routes) await requireRoutableSpaces(db, user.id, connection, input.routes);

  const http = { fetch: liveHttp.fetch, now: () => new Date() };
  const credentials = await resolveCredentials(connection, { db, http });
  if (credentials.kind === 'expired') {
    throw new ApiError(409, 'connection_expired', credentials.detail);
  }

  let available = stored?.available ?? [];
  try {
    available = await driver.listScopeOptions(credentials.credentials, http);
  } catch (err) {
    // A failed listing keeps the stored list and still saves the selection.
    if (!(err instanceof SourceError)) throw err;
    console.error('scope listing failed', connection.provider, err.message);
    if (stored === null) throw new ApiError(502, 'provider_error', err.message);
  }

  const scopeSelection = buildScopeSelection(
    driver.scopeSelectionKind,
    available.map((option) => ({ ...option, kind: driver.scopeSelectionKind ?? 'workspace' })),
    routes,
  );

  const { error } = await db
    .from('connections')
    .update({ scope_selection: scopeSelection })
    .eq('id', connection.id);
  if (error) throw new ApiError(500, 'internal', 'the selection could not be saved');

  return jsonResponse({ connection_id: connection.id, scope_selection: scopeSelection });
});
