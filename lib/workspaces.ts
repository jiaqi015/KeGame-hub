type WorkspacePathMatcher =
  | { type: 'exact'; value: string }
  | { type: 'prefix'; value: string };

export const WORKSPACE_DEFINITIONS = [
  {
    id: 'sabrina',
    label: '模型大乱斗',
    slug: 'pk',
    legacyCode: '1',
    aliases: ['sabrina', 'compare', 'comparison', 'pk'],
    pathMatchers: [
      { type: 'exact', value: '/api/compare' },
      { type: 'exact', value: '/api/compare-stream' },
      { type: 'exact', value: '/compare' },
      { type: 'exact', value: '/compare-stream' },
    ] satisfies WorkspacePathMatcher[],
  },
  {
    id: 'open-day',
    label: '小区开放日选址 skill',
    slug: 'openday',
    legacyCode: '2',
    aliases: ['open-day', 'open_day', 'openday'],
    pathMatchers: [
      { type: 'prefix', value: '/api/open-day-' },
      { type: 'exact', value: '/api/parse-workbook' },
      { type: 'prefix', value: '/open-day-' },
      { type: 'exact', value: '/parse-workbook' },
    ] satisfies WorkspacePathMatcher[],
  },
  {
    id: 'selling-houses',
    label: '我是王牌资产顾问',
    slug: 'seller',
    legacyCode: '3',
    aliases: ['selling-houses', 'selling_houses', 'sellinghouses', 'maintainer'],
    pathMatchers: [
      { type: 'prefix', value: '/api/maintainer-' },
      { type: 'exact', value: '/api/maintainer-runs' },
      { type: 'prefix', value: '/maintainer-' },
      { type: 'exact', value: '/api/selling-houses-scenarios' },
      { type: 'exact', value: '/selling-houses-scenarios' },
    ] satisfies WorkspacePathMatcher[],
  },
  {
    id: 'market-management',
    label: '商圈大赢家',
    slug: 'market',
    legacyCode: '4',
    aliases: ['market-management', 'market_management', 'marketmanagement'],
    pathMatchers: [] satisfies WorkspacePathMatcher[],
  },
  {
    id: 'rational-owner',
    label: '中国好业主',
    slug: 'owner',
    legacyCode: '5',
    aliases: ['rational-owner', 'rational_owner', 'rationalowner'],
    pathMatchers: [] satisfies WorkspacePathMatcher[],
  },
] as const;

export type WorkspaceId = (typeof WORKSPACE_DEFINITIONS)[number]['id'];

export const WORKSPACE_IDS = WORKSPACE_DEFINITIONS.map((workspace) => workspace.id) as WorkspaceId[];
export type ActivationWorkspaceId = WorkspaceId;

const WORKSPACE_ALIAS_MAP = Object.fromEntries(
  WORKSPACE_DEFINITIONS.flatMap((workspace) => {
    const tokens = [
      workspace.id,
      ...workspace.aliases,
      ...('legacyCode' in workspace ? [workspace.legacyCode] : []),
    ];
    return tokens.map((token) => [token.toLowerCase(), workspace.id] as const);
  }),
) as Record<string, WorkspaceId>;

const LEGACY_WORKSPACE_CODE_MAP = Object.fromEntries(
  WORKSPACE_DEFINITIONS
    .filter((workspace): workspace is (typeof WORKSPACE_DEFINITIONS)[number] & { legacyCode: string } => 'legacyCode' in workspace)
    .map((workspace) => [workspace.legacyCode, workspace.id] as const),
) as Record<string, WorkspaceId>;

const LEGACY_WORKSPACE_CODES = Object.keys(LEGACY_WORKSPACE_CODE_MAP);

const WORKSPACE_LABEL_MAP = Object.fromEntries(
  WORKSPACE_DEFINITIONS.map((workspace) => [workspace.id, workspace.label] as const),
) as Record<WorkspaceId, string>;

const WORKSPACE_SLUG_MAP = Object.fromEntries(
  WORKSPACE_DEFINITIONS.map((workspace) => [workspace.id, workspace.slug] as const),
) as Record<WorkspaceId, string>;

const WORKSPACE_BY_SLUG_MAP = Object.fromEntries(
  WORKSPACE_DEFINITIONS.map((workspace) => [workspace.slug, workspace.id] as const),
) as Record<string, WorkspaceId>;

export function normalizeWorkspaceToken(rawToken: string): WorkspaceId | null {
  const token = rawToken.trim().toLowerCase();
  return WORKSPACE_ALIAS_MAP[token] || null;
}

export function decodeLegacyWorkspaceCodes(rawValue: string): WorkspaceId[] {
  const trimmed = rawValue.trim();

  if (!trimmed || LEGACY_WORKSPACE_CODES.length === 0) {
    return [];
  }

  if (!trimmed.split('').every((token) => LEGACY_WORKSPACE_CODES.includes(token))) {
    return [];
  }

  return trimmed
    .split('')
    .map((token) => LEGACY_WORKSPACE_CODE_MAP[token])
    .filter((workspace, index, list): workspace is WorkspaceId => Boolean(workspace) && list.indexOf(workspace) === index);
}

export function getWorkspaceLabel(workspace: WorkspaceId): string {
  return WORKSPACE_LABEL_MAP[workspace];
}

export function getWorkspaceSlug(workspace: WorkspaceId): string {
  return WORKSPACE_SLUG_MAP[workspace];
}

export function resolveWorkspaceBySlug(rawSlug: string): WorkspaceId | null {
  const slug = rawSlug.trim().toLowerCase();
  return WORKSPACE_BY_SLUG_MAP[slug] || null;
}

export function inferWorkspaceFromPath(pathname: string): WorkspaceId | null {
  if (!pathname) {
    return null;
  }

  for (const workspace of WORKSPACE_DEFINITIONS) {
    for (const matcher of workspace.pathMatchers) {
      if (matcher.type === 'exact' && pathname === matcher.value) {
        return workspace.id;
      }

      if (matcher.type === 'prefix' && pathname.startsWith(matcher.value)) {
        return workspace.id;
      }
    }
  }

  return null;
}
