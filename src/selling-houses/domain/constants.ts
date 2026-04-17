export { ACTIONS, ACTION_CATEGORIES } from './actions/definitions';

export const STORAGE_KEY = "selling-world-save-v3";
export const CLOUD_USER_STORAGE_KEY = "selling-world-user-v1";
export const CLOUD_META_STORAGE_KEY = "selling-world-cloud-meta-v1";

export const CASE_STAGES = ["获客启动", "经营加热", "带看推进", "意向报价", "议价中", "成交冲刺", "成交"];
export const OPPORTUNITY_STAGES = ["了解", "咨询", "看房", "再看", "出价", "谈判", "成交"];

export const COMPETITIVENESS_WEIGHTS = { d1: 0.5, d2: 0.25, d3: 0.25 };

export const D1_SIGNAL_WEIGHTS = {
  poolSize: 0.15,
  activeContacts: 0.20,
  lateStageThickness: 0.30,
  advanceSpeed: 0.20,
  stagnationRisk: 0.15
};

export const D2_AXIS_WEIGHTS = {
  layout: 0.20,
  light: 0.10,
  floor: 0.10,
  decor: 0.15,
  amenity: 0.15,
  neighborhood: 0.20,
  structure: 0.10
};

export const D3_SIGNAL_WEIGHTS = {
  priceFlex: 0.25,
  patience: 0.25,
  urgency: 0.20,
  recentCooperation: 0.20,
  consistency: 0.10
};

export const PORTAL_URGENCY_WEIGHTS = {
  deltaWeight: 0.40,
  levelWeight: 0.20,
  criticalEventWeight: 0.25,
  timeWindowWeight: 0.15
};

export const CHANNELS = [
  { id: "xiaohongshu", name: "小红书推广", quality: 0.56, controllability: 0.48, leadSource: "direct" },
  { id: "broker-network", name: "经纪人投放", quality: 0.67, controllability: 0.36, leadSource: "broker" },
  { id: "open-day", name: "开放日", quality: 0.74, controllability: 0.76, leadSource: "direct" },
  { id: "private-referral", name: "私域转介绍", quality: 0.72, controllability: 0.72, leadSource: "direct" },
];

export const MARKET_CELLS = [
  { id: "mc-qiantan", name: "浦东前滩 | 80-90㎡ 刚改", demandHeat: 76, supplyPressure: 62, competitivePressure: 58, sentiment: 68 },
  { id: "mc-jingan", name: "静安寺北 | 60-75㎡ 资产型", demandHeat: 81, supplyPressure: 54, competitivePressure: 51, sentiment: 71 },
];

export const INITIAL_CASES = [
  {
    id: "case-101",
    title: "瑞和里 89㎡ 两房",
    community: "瑞和里",
    district: "浦东前滩",
    layout: "2室2厅1卫",
    area: 89,
    askPrice: 828,
    marketPrice: 802,
    bottomPrice: 785,
    patience: 65,
    trust: 61,
    heat: 58,
    competitiveness: 64,
    urgency: 72,
    windowDays: 11,
    ownerName: "周女士",
    ownerMood: "担心拖久错过换房窗口",
    maintainerName: "林序",
    marketCellId: "mc-qiantan",
    story: "高确定性学区刚改叙事",
    tags: ["学区", "地铁近", "采光好"],
    defects: ["报价偏硬", "次卧偏小"],
    axisScores: { layout: 70, light: 85, floor: 60, decor: 50, amenity: 65, neighborhood: 80, structure: 75 }
  },
  {
    id: "case-103",
    title: "嘉樾公馆 71㎡ 一房",
    community: "嘉樾公馆",
    district: "静安寺北",
    layout: "1室1厅1卫",
    area: 71,
    askPrice: 628,
    marketPrice: 645,
    bottomPrice: 590,
    patience: 40,
    trust: 54,
    heat: 67,
    competitiveness: 73,
    urgency: 85,
    windowDays: 7,
    ownerName: "梁先生",
    ownerMood: "希望尽快变现，耐心正在下降",
    maintainerName: "沈岚",
    marketCellId: "mc-jingan",
    story: "青年资产保值叙事",
    tags: ["总价友好", "地段强", "出租回报"],
    defects: ["朝向一般"],
    axisScores: { layout: 65, light: 50, floor: 90, decor: 85, amenity: 75, neighborhood: 95, structure: 60 }
  },
];

export const CUSTOMER_POOL = [
  { id: "cus-01", name: "林家改善客", profile: "孩子今年入学，决策速度快", budgetMin: 780, budgetMax: 860, targetDistrict: "浦东前滩", layouts: ["2室2厅1卫", "3室2厅2卫"], activity: 82, urgency: 78, priceSensitivity: 68, preferences: ["地铁近", "学区", "采光好"] },
  { id: "cus-02", name: "陈先生新婚客", profile: "两个月内想落定婚房", budgetMin: 590, budgetMax: 660, targetDistrict: "静安寺北", layouts: ["1室1厅1卫", "2室2厅1卫"], activity: 79, urgency: 86, priceSensitivity: 72, preferences: ["地段强", "出租回报"] },
  { id: "cus-04", name: "孙先生学区客", profile: "对学区敏感，愿意多看几套", budgetMin: 760, budgetMax: 820, targetDistrict: "浦东前滩", layouts: ["2室2厅1卫"], activity: 56, urgency: 69, priceSensitivity: 74, preferences: ["学区", "采光好"] },
  { id: "cus-05", name: "方女士投资客", profile: "追求出租回报和总价控制", budgetMin: 610, budgetMax: 690, targetDistrict: "静安寺北", layouts: ["1室1厅1卫"], activity: 61, urgency: 52, priceSensitivity: 65, preferences: ["出租回报", "地段强"] },
  { id: "cus-09", name: "高女士首置客", profile: "需要更容易成交的两房盘", budgetMin: 780, budgetMax: 835, targetDistrict: "浦东前滩", layouts: ["2室2厅1卫"], activity: 76, urgency: 67, priceSensitivity: 78, preferences: ["地铁近", "采光好"] },
  { id: "cus-10", name: "许先生资产客", profile: "重视地段和转手效率", budgetMin: 600, budgetMax: 650, targetDistrict: "静安寺北", layouts: ["1室1厅1卫"], activity: 66, urgency: 73, priceSensitivity: 55, preferences: ["地段强", "总价友好"] },
];

// --- Randomization Templates ---

export const COMMUNITY_TEMPLATES: Record<string, string[]> = {
  "mc-qiantan": ["瑞和里", "前滩华府", "星湖苑", "江悦府", "森兰名邸"],
  "mc-jingan": ["嘉樾公馆", "和源小区", "静安名门", "嘉里东院", "万航小区"],
};

export const BROKER_NAMES = ["链家小张", "中原老王", "太平洋阿力", "我爱我家中介", "德佑李工", "独立经纪人阿强"];
export const OWNER_NAMES = ["周女士", "梁先生", "秦先生", "邵女士", "林老伯", "张阿姨", "王经理", "陈小姐"];
export const MAINTAINER_NAMES = ["林序", "沈岚", "韩起", "苏景", "高翔", "陆遥", "何薇", "许靖"];

export const LAYOUT_TEMPLATES = [
  { layout: "1室1厅1卫", areaRange: [45, 75], pricePerSqm: 8.5 },
  { layout: "2室2厅1卫", areaRange: [85, 95], pricePerSqm: 9.2 },
  { layout: "3室2厅2卫", areaRange: [115, 135], pricePerSqm: 10.5 },
  { layout: "4室2厅2卫", areaRange: [145, 175], pricePerSqm: 11.2 },
];

export const STORY_TEMPLATES = [
  "高确定性学区刚改叙事",
  "青年资产保值叙事",
  "改善家庭稳定交付感",
  "稀缺景观资产溢价叙事",
  "置换链条快速去化说辞",
];

export const DEFECT_POOL = ["报价偏硬", "次卧偏小", "竞品新", "总价高", "朝向一般", "邻近马路", "得房率低"];
export const TAG_POOL = ["学区", "地铁近", "采光好", "总价友好", "地段强", "出租回报", "江景", "改善", "车位"];

export const WEEKLY_ROUTINE = [
  { day: 1, label: "周一", theme: "业主反馈日", energy: 8 },
  { day: 2, label: "周二", theme: "公休放假", energy: 1 },
  { day: 3, label: "周三", theme: "获客攻坚", energy: 4 },
  { day: 4, label: "周四", theme: "房源聚焦", energy: 3 },
  { day: 5, label: "周五", theme: "获客攻坚", energy: 5 },
  { day: 6, label: "周六", theme: "看房高峰", energy: 6 },
  { day: 0, label: "周日", theme: "看房高峰", energy: 6 },
];

export const PERSONALITIES = {
  pragmatic: { label: "务实型", desc: "非常在乎价格反馈。如果报价超过市场价，信任度极难维持。成交心态稳健。" },
  emotional: { label: "情绪型", desc: "非常看重热度和面子。带看多他就高兴，如果没带看，信任度会崩盘式下跌。" },
  urgent: { label: "迫切型", desc: "由于急于换房或变现，他的紧迫感提升极快，对大幅降价的忍受度较高。" },
};

export const MARKET_EVENT_PROBABILITY = 0.15;

export const MARKET_EVENT_LABELS = {
  policyShift: "政策利空",
  schoolDistrictBoom: "学区利好",
  competitorActivity: "竞对博弈",
} as const;
