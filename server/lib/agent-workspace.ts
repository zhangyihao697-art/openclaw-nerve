import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export interface AgentWorkspace {
  agentId: string;
  workspaceRoot: string;
  memoryPath: string;
  memoryDir: string;
}

interface ConfiguredAgentEntry {
  id: string;
  workspace?: string;
}

const AGENT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const OPENCLAW_VALID_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const INVALID_CHARS_RE = /[^a-z0-9-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;

let cachedConfigPath = '';
let cachedConfigMtimeMs = -1;
let cachedConfiguredAgents: ConfiguredAgentEntry[] = [];

export class InvalidAgentIdError extends Error {
  constructor(agentId: string) {
    super(`Invalid agent id: ${agentId}`);
    this.name = 'InvalidAgentIdError';
  }
}

function normalizeOpenClawAgentId(value?: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return 'main';
  const normalized = trimmed.toLowerCase();
  if (AGENT_ID_PATTERN.test(normalized)) return normalized;
  return normalized
    .replace(INVALID_CHARS_RE, '-')
    .replace(LEADING_DASH_RE, '')
    .replace(TRAILING_DASH_RE, '')
    .slice(0, 64) || 'main';
}

function getOpenClawConfigPath(): string {
  return path.join(config.home, '.openclaw', 'openclaw.json');
}

function loadConfiguredAgents(): ConfiguredAgentEntry[] {
  const configPath = getOpenClawConfigPath();

  try {
    const stat = fs.statSync(configPath);
    if (configPath === cachedConfigPath && stat.mtimeMs === cachedConfigMtimeMs) {
      return cachedConfiguredAgents;
    }

    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      agents?: { agents?: Array<{ id?: unknown; workspace?: unknown }>; list?: Array<{ id?: unknown; workspace?: unknown }> };
    };
    const candidates = parsed.agents?.agents ?? parsed.agents?.list ?? [];

    cachedConfiguredAgents = candidates
      .map((entry) => ({
        id: typeof entry?.id === 'string' ? entry.id.trim() : '',
        workspace: typeof entry?.workspace === 'string' ? entry.workspace.trim() : undefined,
      }))
      .filter((entry) => entry.id);
    cachedConfigPath = configPath;
    cachedConfigMtimeMs = stat.mtimeMs;
    return cachedConfiguredAgents;
  } catch {
    cachedConfiguredAgents = [];
    cachedConfigPath = configPath;
    cachedConfigMtimeMs = -1;
    return cachedConfiguredAgents;
  }
}

function findConfiguredAgent(agentId?: string): { configuredId: string; normalizedId: string; workspace?: string } | null {
  const trimmed = (agentId || '').trim();
  if (!trimmed || normalizeOpenClawAgentId(trimmed) === 'main') return null;

  const normalizedRequestedId = normalizeOpenClawAgentId(trimmed);
  for (const entry of loadConfiguredAgents()) {
    if (entry.id === trimmed || normalizeOpenClawAgentId(entry.id) === normalizedRequestedId) {
      return {
        configuredId: entry.id,
        normalizedId: normalizeOpenClawAgentId(entry.id),
        workspace: entry.workspace,
      };
    }
  }

  return null;
}

export function normalizeAgentId(agentId?: string): string {
  const trimmed = (agentId || '').trim();
  if (!trimmed) return 'main';

  const configured = findConfiguredAgent(trimmed);
  if (configured) return configured.normalizedId;

  if (normalizeOpenClawAgentId(trimmed) === 'main') return 'main';
  if (!AGENT_ID_PATTERN.test(trimmed)) {
    if (!OPENCLAW_VALID_ID_RE.test(trimmed)) {
      throw new InvalidAgentIdError(trimmed);
    }
    throw new InvalidAgentIdError(trimmed);
  }
  return trimmed;
}

export function resolveAgentWorkspace(agentId?: string): AgentWorkspace {
  const configured = findConfiguredAgent(agentId);
  const normalizedAgentId = configured?.normalizedId ?? normalizeAgentId(agentId);

  if (normalizedAgentId === 'main') {
    const workspaceRoot = path.dirname(config.memoryPath);
    return {
      agentId: 'main',
      workspaceRoot,
      memoryPath: config.memoryPath,
      memoryDir: config.memoryDir || path.join(workspaceRoot, 'memory'),
    };
  }

  const workspaceRoot = configured?.workspace
    ? path.resolve(configured.workspace)
    : path.join(config.home, '.openclaw', `workspace-${normalizedAgentId}`);
  return {
    agentId: normalizedAgentId,
    workspaceRoot,
    memoryPath: path.join(workspaceRoot, 'MEMORY.md'),
    memoryDir: path.join(workspaceRoot, 'memory'),
  };
}
