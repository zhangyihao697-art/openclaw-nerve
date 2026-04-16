/**
 * GET /api/configured-agents — List agents configured in ~/.openclaw/openclaw.json
 *
 * Used by the AGENTS sidebar so configured agents remain visible even before
 * they have an active top-level root session.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import { config } from '../lib/config.js';
import { normalizeAgentId } from '../lib/agent-workspace.js';

const app = new Hono();

interface RawConfiguredAgent {
  id?: unknown;
  name?: unknown;
}

app.get('/api/configured-agents', rateLimitGeneral, async (c) => {
  try {
    const configPath = path.join(config.home, '.openclaw', 'openclaw.json');
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      agents?: {
        agents?: RawConfiguredAgent[];
        list?: RawConfiguredAgent[];
      };
    };

    const candidates = parsed.agents?.agents ?? parsed.agents?.list ?? [];
    const seen = new Set<string>();
    const agents = candidates
      .map((entry) => {
        const configuredId = typeof entry?.id === 'string' ? entry.id.trim() : '';
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
        return { configuredId, name };
      })
      .filter((entry) => entry.configuredId)
      .map((entry) => {
        const agentId = normalizeAgentId(entry.configuredId);
        return {
          configuredId: entry.configuredId,
          agentId,
          sessionKey: `agent:${agentId}:main`,
          label: entry.name || entry.configuredId,
          configuredName: entry.name || entry.configuredId,
        };
      })
      .filter((entry) => {
        if (seen.has(entry.sessionKey)) return false;
        seen.add(entry.sessionKey);
        return true;
      });

    return c.json({ ok: true, agents });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read configured agents';
    return c.json({ ok: false, error: message, agents: [] }, 500);
  }
});

export default app;
