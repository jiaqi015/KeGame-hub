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
    heroTitle: '排行榜',
    heroSummary: '这里只展示正式结算后的历史成绩，不展示局内过程分。',
    tabs: [
      {
        id: 'total-score',
        label: '总分榜',
        summary: '看谁长期稳定打出高质量结果。',
        accent: 'umber',
        entries: mapEntries(totalScore, 'total-score'),
        emptyTitle: '总分榜还没有人上榜',
        emptyDetail: '等有人完成正式结算后，这里会开始累计生涯有效总分。',
      },
      {
        id: 'best-score',
        label: '单局最高榜',
        summary: '看谁打出过最强的一局。',
        accent: 'emerald',
        entries: mapEntries(bestScore, 'best-score'),
        emptyTitle: '单局最高榜还没有记录',
        emptyDetail: '等第一批正式结算跑出来后，这里会出现代表作。',
      },
      {
        id: 'play-count',
        label: '局数榜',
        summary: '看谁持续投入得最久。',
        accent: 'slate',
        entries: mapEntries(playCount, 'play-count'),
        emptyTitle: '局数榜还没有人上榜',
        emptyDetail: '等玩家累计更多正式完局后，这里会体现资历和持续投入。',
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
    if (rankIndex === 0) return `当前生涯有效总分最高，累计 ${value} 分。`;
    return `继续稳定完局，才能往上追。`;
  }
  if (category === 'best-score') {
    if (rankIndex === 0) return `目前最强代表作，单局做到 ${value} 分。`;
    return `差的是上限，不只是场次。`;
  }
  if (rankIndex === 0) return `目前正式完局最多，已经打了 ${value} 局。`;
  return `看的是持续参与和资历。`;
}

function buildHighlights(
  totalScore: MaintainerLeaderboardCategoryEntry[],
  bestScore: MaintainerLeaderboardCategoryEntry[],
  playCount: MaintainerLeaderboardCategoryEntry[],
): LeaderboardHighlightProjection[] {
  return [
    {
      title: '总分榜看长期稳定',
      detail: totalScore[0]
        ? `${totalScore[0].playerName} 目前领跑，总分 ${totalScore[0].value}。`
        : '当前还没有正式完局数据进入总分榜。',
    },
    {
      title: '单局最高榜看代表作',
      detail: bestScore[0]
        ? `${bestScore[0].playerName} 目前单局最高，做到 ${bestScore[0].value} 分。`
        : '当前还没有正式结算结果进入单局最高榜。',
    },
    {
      title: '局数榜看投入强度',
      detail: playCount[0]
        ? `${playCount[0].playerName} 当前完局最多，已经打了 ${playCount[0].value} 局。`
        : '当前还没有玩家形成稳定完局记录。',
    },
  ];
}
