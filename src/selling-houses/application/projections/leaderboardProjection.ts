import type {
  MaintainerLeaderboardCategoryEntry,
  MaintainerLeaderboardDetail,
} from '../cloudSync.js';

export type LeaderboardProjectionTabId = 'total-score' | 'best-score' | 'play-count';

export interface LeaderboardProjectionEntry {
  rank: number;
  ownerKey: string;
  playerName: string;
  value: number;
  valueLabel: string;
  note: string;
  badge?: string;
}

export interface LeaderboardProjectionTab {
  id: LeaderboardProjectionTabId;
  label: string;
  summary: string;
  accent: 'umber' | 'emerald' | 'slate';
  entries: LeaderboardProjectionEntry[];
  emptyTitle: string;
  emptyDetail: string;
}

export interface LeaderboardHighlightProjection {
  title: string;
  detail: string;
}

export interface LeaderboardProjection {
  seasonId: string;
  heroTitle: string;
  heroSummary: string;
  tabs: LeaderboardProjectionTab[];
  highlights: LeaderboardHighlightProjection[];
}

export function buildLeaderboardProjection(detail: MaintainerLeaderboardDetail | null): LeaderboardProjection {
  const seasonId = detail?.seasonId || 'season-1';
  const totalScore = detail?.totalScore || [];
  const bestScore = detail?.bestScore || [];
  const playCount = detail?.playCount || [];

  return {
    seasonId,
    heroTitle: '游戏排行榜',
    heroSummary: '只看正式结算后的历史成绩。',
    tabs: [
      {
        id: 'total-score',
        label: '总分榜',
        summary: '看谁长期更稳。',
        accent: 'umber',
        entries: mapEntries(totalScore, 'total-score'),
        emptyTitle: '总分榜还没有人上榜',
        emptyDetail: '有人正式结算后，榜单会开始累计总分。',
      },
      {
        id: 'best-score',
        label: '单局最高榜',
        summary: '看谁单局最高。',
        accent: 'emerald',
        entries: mapEntries(bestScore, 'best-score'),
        emptyTitle: '单局最高榜还没有记录',
        emptyDetail: '有正式结算后，榜单会出现最高分。',
      },
      {
        id: 'play-count',
        label: '局数榜',
        summary: '看谁完局更多。',
        accent: 'slate',
        entries: mapEntries(playCount, 'play-count'),
        emptyTitle: '局数榜还没有人上榜',
        emptyDetail: '有人多次完局后，榜单会出现记录。',
      },
    ],
    highlights: buildHighlights(totalScore, bestScore, playCount),
  };
}

function mapEntries(
  entries: MaintainerLeaderboardCategoryEntry[],
  category: LeaderboardProjectionTabId,
): LeaderboardProjectionEntry[] {
  return entries.map((entry, index) => ({
    rank: index + 1,
    ownerKey: entry.accountId || entry.playerProfileId || entry.userId,
    playerName: entry.playerName,
    value: entry.value,
    valueLabel: formatValue(entry.value, category),
    note: buildEntryNote(index, entry.value, category),
    badge: index === 0 ? '当前第一' : index === 1 ? '紧追第一' : index === 2 ? '前三' : undefined,
  }));
}

function formatValue(value: number, category: LeaderboardProjectionTabId) {
  if (category === 'play-count') return `${value} 局`;
  return `${value} 分`;
}

function buildEntryNote(rankIndex: number, value: number, category: LeaderboardProjectionTabId) {
  if (category === 'total-score') {
    if (rankIndex === 0) return `当前总分 ${value} 分。`;
    return `当前总分 ${value} 分。`;
  }
  if (category === 'best-score') {
    if (rankIndex === 0) return `单局最高 ${value} 分。`;
    return `单局最高 ${value} 分。`;
  }
  if (rankIndex === 0) return `已完局 ${value} 局。`;
  return `已完局 ${value} 局。`;
}

function buildHighlights(
  totalScore: MaintainerLeaderboardCategoryEntry[],
  bestScore: MaintainerLeaderboardCategoryEntry[],
  playCount: MaintainerLeaderboardCategoryEntry[],
): LeaderboardHighlightProjection[] {
  return [
    {
      title: '总分榜',
      detail: totalScore[0]
        ? `${totalScore[0].playerName} 目前领跑，总分 ${totalScore[0].value}。`
        : '还没有总分记录。',
    },
    {
      title: '单局最高榜',
      detail: bestScore[0]
        ? `${bestScore[0].playerName} 目前单局最高，做到 ${bestScore[0].value} 分。`
        : '还没有单局最高记录。',
    },
    {
      title: '局数榜',
      detail: playCount[0]
        ? `${playCount[0].playerName} 当前完局最多，已经打了 ${playCount[0].value} 局。`
        : '还没有完局记录。',
    },
  ];
}
