const sampleCsv = `大区,小区名称,在售套数,带看量,成交量,好房数
学院大区,今典花园,45,655,11,8
团结湖大区,慈云寺,66,422,7,12
五道口大区,展春园,22,185,4,6
望京北大区,首开金茂·望京樾,10,199,4,3
学院大区,北太平庄路2号院,21,22,1,1
望京北大区,东洲家园,71,436,10,7
五道口大区,八家嘉园,36,588,8,5
朝阳公园大区,阳光上东,72,294,6,3
朝阳公园大区,阳光上东滨河花园,6,33,1,0
朝阳公园大区,京达国际公寓,3,2,0,0
朝阳公园大区,南十里居10号院,3,4,1,0
学院大区,二里庄小区,18,126,1,2
团结湖大区,棕榈泉国际公寓,28,240,2,4
望京北大区,澳洲康都,70,1120,8,4
朝阳公园大区,燕东大厦,0,0,0,0`;

let defaultConfig = {
  alpha: 0.8,
  waterlineMode: "percentile",
  weights: {
    product: 0.65,
    interaction: 0.35,
  },
  percentiles: {
    I_cap: 95,
    V_cap: 95,
    H_cap: 95,
    R_cap: 75,
  },
  absolutes: {
    I_cap: 50,
    V_cap: 400,
    H_cap: 5,
    R_cap: 0.02,
  },
  hardFilters: {
    min_inventory: 20,
    min_hq_rooms: 2,
    min_transaction: 1,
  },
};

let strategyPresets = [
  {
    id: "auto",
    label: "自动巡航",
    description: "按动态分位适配当月大盘。",
    overrides: {},
    resolvedConfig: deepClone(defaultConfig),
  },
  {
    id: "sprint",
    label: "逼单冲刺",
    description: "互动权重拉高，强调转化效率。",
    overrides: {
      weights: {
        product: 0.3,
        interaction: 0.7,
      },
    },
    resolvedConfig: mergeConfig(defaultConfig, {
      weights: {
        product: 0.3,
        interaction: 0.7,
      },
    }),
  },
  {
    id: "kpi",
    label: "强压 KPI",
    description: "改用固定数值，强控规模与流量门槛。",
    overrides: {
      waterlineMode: "absolute",
      alpha: 0.6,
      absolutes: {
        I_cap: 60,
        V_cap: 600,
        H_cap: 8,
        R_cap: 0.03,
      },
    },
    resolvedConfig: mergeConfig(defaultConfig, {
      waterlineMode: "absolute",
      alpha: 0.6,
      absolutes: {
        I_cap: 60,
        V_cap: 600,
        H_cap: 8,
        R_cap: 0.03,
      },
    }),
  },
  {
    id: "all-market",
    label: "全域深潜",
    description: "红线归零，拉出全城所有盘做观察。",
    overrides: {
      hardFilters: {
        min_inventory: 0,
        min_hq_rooms: 0,
        min_transaction: 0,
      },
    },
    resolvedConfig: mergeConfig(defaultConfig, {
      hardFilters: {
        min_inventory: 0,
        min_hq_rooms: 0,
        min_transaction: 0,
      },
    }),
  },
];

const waterlineDefinitions = [
  {
    key: "I_cap",
    title: "规模水位线",
    description: "在售规模达到这个刻度后，视为开放日场域动员饱和。",
    percentileLabel: "规模分位",
    absoluteLabel: "满分套数",
    absoluteStep: "1",
    unit: "套",
  },
  {
    key: "V_cap",
    title: "流量水位线",
    description: "带看达到标杆后视为人气饱和，再高主要靠 Alpha 做平滑。",
    percentileLabel: "流量分位",
    absoluteLabel: "标杆带看",
    absoluteStep: "1",
    unit: "次",
  },
  {
    key: "H_cap",
    title: "商品水位线",
    description: "好房达到这个刻度后，单场活动已具备横向对比的货品密度。",
    percentileLabel: "商品分位",
    absoluteLabel: "好房套数",
    absoluteStep: "1",
    unit: "套",
  },
  {
    key: "R_cap",
    title: "互动水位线",
    description: "按成交量 / 带看量计算的互动质量健康线，用来衡量逼定氛围。",
    percentileLabel: "互动分位",
    absoluteLabel: "健康转化率",
    absoluteStep: "0.001",
    unit: "%",
  },
];

const fieldAliases = {
  area: ["大区", "区域", "商圈", "片区", "area"],
  name: ["小区名称", "楼盘名", "楼盘名称", "小区", "名称", "community", "name"],
  inventory: ["库存在售房源量", "在售套数", "在售", "inventory", "挂牌", "sale"],
  traffic: ["带看量（房源ID+带看ID）", "带看量", "流量", "traffic", "view"],
  transactions: ["成交量", "交易量", "签约量", "transaction", "deal"],
  premium: ["库存好房量", "好房数", "精品房源量", "好房", "premium"],
};

const state = {
  rows: [],
  headers: [],
  workbookSheets: [],
  sourceName: "",
  activePresetId: "auto",
  analysisMeta: null,
  analysisRequestVersion: 0,
  recomputeTimer: 0,
  mappings: {
    area: "",
    name: "",
    inventory: "",
    traffic: "",
    transactions: "",
    premium: "",
  },
  config: deepClone(defaultConfig),
  results: [],
};

const serverEnabled = window.location.protocol.startsWith("http");

const fileInput = document.querySelector("#file-input");
const loadSampleBtn = document.querySelector("#load-sample");
const resetDefaultsBtn = document.querySelector("#reset-defaults");
const recalcBtn = document.querySelector("#recalculate");
const dataSummary = document.querySelector("#data-summary");
const sheetPickerWrap = document.querySelector("#sheet-picker-wrap");
const sheetPicker = document.querySelector("#sheet-picker");
const presetStrip = document.querySelector("#preset-strip");
const paramGrid = document.querySelector("#param-grid");
const headlineMetrics = document.querySelector("#headline-metrics");
const analysisCards = document.querySelector("#analysis-cards");
const chart = document.querySelector("#chart");
const resultBody = document.querySelector("#result-body");

const mappingSelectors = {
  area: document.querySelector("#area-column"),
  name: document.querySelector("#name-column"),
  inventory: document.querySelector("#inventory-column"),
  traffic: document.querySelector("#traffic-column"),
  transactions: document.querySelector("#transactions-column"),
  premium: document.querySelector("#premium-column"),
};

const staticControls = {
  waterlineMode: document.querySelector("#waterline-mode"),
  alpha: document.querySelector("#traffic-exponent"),
  productWeight: document.querySelector("#goods-weight"),
  interactionWeight: document.querySelector("#interaction-weight"),
  minInventory: document.querySelector("#hard-filter-inventory"),
  minPremium: document.querySelector("#hard-filter-premium"),
  minTransactions: document.querySelector("#hard-filter-transactions"),
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(base, overrides) {
  const result = deepClone(base);

  Object.entries(overrides || {}).forEach(([key, value]) => {
    if (isObject(value) && isObject(result[key])) {
      result[key] = mergeConfig(result[key], value);
      return;
    }

    result[key] = value;
  });

  return result;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) {
    return { headers: [], rows: [] };
  }

  const rows = lines.map(splitCsvLine);
  const headers = rows[0].map((item) => item.trim());

  return {
    headers,
    rows: rows.slice(1).map((values) => {
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = (values[index] ?? "").trim();
      });
      return entry;
    }),
  };
}

function splitCsvLine(line) {
  const items = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      items.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  items.push(current);
  return items;
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return Number(value).toFixed(digits);
}

function formatPercent(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${(value * 100).toFixed(digits)}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function guessMapping(type, headers, optional = false) {
  const aliases = fieldAliases[type] || [];
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    lowered: header.toLowerCase(),
  }));

  for (const alias of aliases) {
    const exact = normalizedHeaders.find((header) => header.lowered === alias.toLowerCase());
    if (exact) {
      return exact.original;
    }
  }

  for (const alias of aliases) {
    const partial = normalizedHeaders.find((header) => header.lowered.includes(alias.toLowerCase()));
    if (partial) {
      return partial.original;
    }
  }

  return optional ? "" : "";
}

function populateMappingSelectors() {
  Object.entries(mappingSelectors).forEach(([key, element]) => {
    const placeholder = key === "area" ? "不使用大区列" : "请选择字段";
    const options = [`<option value="">${placeholder}</option>`]
      .concat(
        state.headers.map((header) => {
          const selected = state.mappings[key] === header ? "selected" : "";
          return `<option value="${escapeHtml(header)}" ${selected}>${escapeHtml(header)}</option>`;
        }),
      )
      .join("");

    element.innerHTML = options;
  });
}

function syncStaticControls() {
  staticControls.waterlineMode.value = state.config.waterlineMode;
  staticControls.alpha.value = String(state.config.alpha);
  staticControls.productWeight.value = String(state.config.weights.product);
  staticControls.interactionWeight.value = String(state.config.weights.interaction);
  staticControls.minInventory.value = String(state.config.hardFilters.min_inventory);
  staticControls.minPremium.value = String(state.config.hardFilters.min_hq_rooms);
  staticControls.minTransactions.value = String(state.config.hardFilters.min_transaction);
}

function renderPresetButtons() {
  presetStrip.innerHTML = strategyPresets
    .map((preset) => {
      const activeClass = preset.id === state.activePresetId ? " is-active" : "";
      return `
        <button type="button" class="preset-btn${activeClass}" data-preset-id="${preset.id}">
          <strong>${escapeHtml(preset.label)}</strong>
          <span>${escapeHtml(preset.description)}</span>
        </button>
      `;
    })
    .join("");

  presetStrip.querySelectorAll("[data-preset-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const presetId = button.getAttribute("data-preset-id") || "auto";
      applyPreset(presetId);
    });
  });
}

function renderParamCards() {
  const modeLabel = state.config.waterlineMode === "percentile" ? "当前按分位生效" : "当前按固定值生效";

  paramGrid.innerHTML = waterlineDefinitions
    .map((definition) => {
      const absoluteValue = state.config.absolutes[definition.key];
      const percentileValue = state.config.percentiles[definition.key];
      const absoluteDisplay = definition.key === "R_cap"
        ? formatPercent(absoluteValue, 2)
        : `${formatNumber(absoluteValue, 1)}${definition.unit}`;

      return `
        <article class="param-card">
          <div class="param-topline">
            <div>
              <h3>${escapeHtml(definition.title)}</h3>
              <p>${escapeHtml(definition.description)}</p>
            </div>
            <span class="mode-pill">${escapeHtml(modeLabel)}</span>
          </div>
          <div class="inline-pair">
            <label>
              <span>${escapeHtml(definition.percentileLabel)} (%)</span>
              <input
                type="number"
                min="1"
                max="99"
                step="1"
                value="${percentileValue}"
                data-config-section="percentiles"
                data-config-key="${definition.key}"
              />
            </label>
            <label>
              <span>${escapeHtml(definition.absoluteLabel)}</span>
              <input
                type="number"
                min="0"
                step="${definition.absoluteStep}"
                value="${absoluteValue}"
                data-config-section="absolutes"
                data-config-key="${definition.key}"
              />
            </label>
          </div>
          <div class="param-meta">默认固定值：${escapeHtml(absoluteDisplay)}</div>
        </article>
      `;
    })
    .join("");

  paramGrid.querySelectorAll("[data-config-section]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const target = event.target;
      const section = target.getAttribute("data-config-section");
      const key = target.getAttribute("data-config-key");

      if (!section || !key) {
        return;
      }

      const nextValue = Number(target.value);
      if (!Number.isFinite(nextValue)) {
        return;
      }

      if (section === "percentiles") {
        state.config.percentiles[key] = Math.min(99, Math.max(1, nextValue));
      } else {
        state.config.absolutes[key] = Math.max(0, nextValue);
      }

      markCustomPreset();
      scheduleComputeAndRender();
    });
  });
}

function renderSheetPicker(sheets, activeSheet) {
  state.workbookSheets = sheets;

  if (!sheets.length) {
    sheetPickerWrap.classList.add("hidden");
    sheetPicker.innerHTML = "";
    return;
  }

  sheetPickerWrap.classList.remove("hidden");
  sheetPicker.innerHTML = sheets
    .map((sheet) => {
      const selected = sheet === activeSheet ? "selected" : "";
      return `<option value="${escapeHtml(sheet)}" ${selected}>${escapeHtml(sheet)}</option>`;
    })
    .join("");
}

function updateSummary(sourceName) {
  dataSummary.classList.remove("empty");
  dataSummary.innerHTML = `
    已加载 <strong>${escapeHtml(sourceName)}</strong>，共 <strong>${state.rows.length}</strong> 行。
    当前测算由后端领域服务执行，前端只负责上传、映射、参数仪表盘与结果展示。互动质量按 <strong>成交量 / 带看量</strong> 自动计算，默认参数和策略包同样从后端目录服务下发，结果会走服务端缓存加速重复计算。
    <span class="metric-footnote">${state.headers.map(escapeHtml).join(" / ")}</span>
  `;
}

function applyParsedData(parsed, sourceName) {
  state.headers = parsed.headers || [];
  state.rows = parsed.rows || [];
  state.sourceName = sourceName;
  state.mappings = {
    area: guessMapping("area", state.headers, true),
    name: guessMapping("name", state.headers),
    inventory: guessMapping("inventory", state.headers),
    traffic: guessMapping("traffic", state.headers),
    transactions: guessMapping("transactions", state.headers),
    premium: guessMapping("premium", state.headers),
  };

  populateMappingSelectors();
  updateSummary(sourceName);
  scheduleComputeAndRender(0);
}

async function uploadWorkbook(file, sheetName = "") {
  const formData = new FormData();
  formData.append("file", file);
  if (sheetName) {
    formData.append("sheet", sheetName);
  }

  const response = await fetch("/api/parse-workbook", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Excel 解析失败");
  }

  const payload = await response.json();
  renderSheetPicker(payload.sheets || [], payload.activeSheet || "");
  applyParsedData(
    {
      headers: payload.headers || [],
      rows: payload.rows || [],
    },
    `${file.name}${payload.activeSheet ? ` / ${payload.activeSheet}` : ""}`,
  );
}

function validateMappings() {
  const requiredMappings = ["name", "inventory", "traffic", "transactions", "premium"];
  const missing = requiredMappings.filter((key) => !state.mappings[key]);

  if (missing.length > 0) {
    throw new Error(`请先完成字段映射：${missing.join("、")}`);
  }
}

function getScorePayload() {
  validateMappings();

  return {
    rows: state.rows,
    mappings: state.mappings,
    config: state.config,
  };
}

async function fetchOpenDayAnalysis() {
  const response = await fetch("/api/open-day-score", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(getScorePayload()),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "开放日测算失败");
  }

  return payload;
}

async function fetchOpenDayCatalog() {
  const response = await fetch("/api/open-day-catalog", {
    method: "GET",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "开放日配置目录加载失败");
  }

  return payload;
}

function applyCatalog(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  if (payload.defaultConfig && typeof payload.defaultConfig === "object") {
    defaultConfig = deepClone(payload.defaultConfig);
  }

  if (Array.isArray(payload.presets) && payload.presets.length) {
    strategyPresets = payload.presets.map((preset) => {
      const overrides = preset && typeof preset.overrides === "object" ? preset.overrides : {};
      const resolvedConfig = preset && typeof preset.resolvedConfig === "object"
        ? preset.resolvedConfig
        : mergeConfig(defaultConfig, overrides);

      return {
        id: preset.id || "custom",
        label: preset.label || "未命名策略",
        description: preset.description || "",
        overrides,
        resolvedConfig,
      };
    });
  }

  state.config = deepClone(defaultConfig);
  state.activePresetId = "auto";
  syncStaticControls();
  renderPresetButtons();
  renderParamCards();
}

function metricCard(label, value, footnote) {
  return `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      <div class="metric-footnote">${escapeHtml(footnote)}</div>
    </article>
  `;
}

function renderSummary() {
  const meta = state.analysisMeta;
  const eligibleRows = state.results.filter((row) => row.isEligible);
  const top = eligibleRows[0] || state.results[0];
  const championLabel = top ? `${top.name}${top.area ? ` · ${top.area}` : ""}` : "暂无";

  headlineMetrics.innerHTML = [
    metricCard("样本小区数", String(meta.totalCount), `${state.sourceName || "尚未加载数据"}`),
    metricCard(
      "入围小区数",
      `${meta.eligibleCount}/${meta.totalCount}`,
      `红线：在售 >= ${meta.requestedConfig.hardFilters.min_inventory}，好房 >= ${meta.requestedConfig.hardFilters.min_hq_rooms}，成交 >= ${meta.requestedConfig.hardFilters.min_transaction}`,
    ),
    metricCard(
      "冠军小区",
      championLabel,
      top ? `综合分 ${formatNumber(top.score, 1)}，分层 ${top.tierLabel}` : "等待测算结果",
    ),
    metricCard(
      "执行模式",
      `${meta.waterlines.source} / Alpha ${formatNumber(meta.requestedConfig.alpha, 2)}`,
      `缓存：${meta.cacheHit ? "命中" : "未命中"} | Key ${meta.cacheKey.slice(0, 12)}... | 权重：商品 ${(meta.weights.product * 100).toFixed(0)}%，互动 ${(meta.weights.interaction * 100).toFixed(0)}%`,
    ),
  ].join("");
}

function renderAnalysisCards() {
  const meta = state.analysisMeta;
  const eligibleRows = state.results.filter((row) => row.isEligible);
  const topPool = eligibleRows.length ? eligibleRows.slice(0, 3) : state.results.slice(0, 3);
  const trafficLeader = state.results.reduce((leader, row) => {
    if (!leader || row.traffic > leader.traffic) {
      return row;
    }
    return leader;
  }, null);
  const opportunity = eligibleRows
    .filter((row) => row.score >= 40 && row.inventory < meta.waterlines.I_cap)
    .sort((left, right) => right.interactionIdx - left.interactionIdx)[0];
  const ineligibleCount = state.results.length - eligibleRows.length;
  const activePreset = strategyPresets.find((preset) => preset.id === state.activePresetId);

  const cards = [
    {
      title: "头部盘解读",
      body: topPool.length
        ? `${topPool.map((row) => row.name).join("、")}位居前列，说明这些盘同时具备规模、带看和成交质量，更适合做开放日主会场。`
        : "当前还没有可用于分析的头部盘。",
    },
    {
      title: "流量与转化",
      body: trafficLeader
        ? `${trafficLeader.name} 的带看量最高，但最终排名是第 ${trafficLeader.rank}。这能帮助运营判断“声量型盘”和“转化型盘”是否发生背离。`
        : "等待流量数据。",
    },
    {
      title: "红线过滤",
      body: ineligibleCount
        ? `当前有 ${ineligibleCount} 个小区未过业务红线，会被统一打到 D 级，避免长尾盘凭偶发数据挤占开放日资源。`
        : "当前样本全部通过业务红线，可以放心在同一资源池内做排序。",
    },
    {
      title: "策略建议",
      body: opportunity
        ? `${activePreset ? `当前处于“${activePreset.label}”配置。` : "当前使用自定义参数。"} ${opportunity.name} 没吃满规模分，但互动质量突出，适合做效率型开放日试点。`
        : `${activePreset ? `当前处于“${activePreset.label}”配置。` : "当前使用自定义参数。"} 当前水位线来源是 ${meta.waterlines.source}，适合继续观察样本结构变化。`,
    },
  ];

  analysisCards.innerHTML = cards
    .map((card) => `
      <article class="analysis-card">
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.body)}</p>
      </article>
    `)
    .join("");
}

function renderChart() {
  const pool = state.results.filter((row) => row.isEligible);
  const topRows = (pool.length ? pool : state.results).slice(0, 6);

  chart.innerHTML = topRows.length
    ? topRows
      .map((row) => `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(row.name)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${row.score.toFixed(1)}%"></div></div>
          <div class="bar-value">${row.score.toFixed(1)}</div>
        </div>
      `)
      .join("")
    : `<div class="helper-text">暂无可展示的图表数据。</div>`;
}

function renderTable() {
  resultBody.innerHTML = state.results
    .map((row) => `
      <tr>
        <td><span class="rank-pill">#${row.rank}</span></td>
        <td>${escapeHtml(row.area || "—")}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${formatNumber(row.score, 1)}</td>
        <td>
          <div class="tier-stack">
            <span class="grade-pill grade-${row.tierCode}">${row.tierCode}</span>
            <span>${escapeHtml(row.tierLabel)}</span>
          </div>
        </td>
        <td><span class="eligibility-pill ${row.isEligible ? "is-on" : "is-off"}">${row.isEligible ? "达标" : "未达标"}</span></td>
        <td>${formatNumber(row.scaleIdx, 1)}</td>
        <td>${formatNumber(row.trafficIdx, 1)}</td>
        <td>${formatNumber(row.productIdx, 1)}</td>
        <td>${formatNumber(row.interactionIdx, 1)}</td>
        <td>${formatNumber(row.transactions, 0)}</td>
        <td>${formatPercent(row.convRate, 2)}</td>
      </tr>
    `)
    .join("");
}

function renderPendingState(message = "正在调用后端测算服务...") {
  chart.innerHTML = `<div class="helper-text">${escapeHtml(message)}</div>`;
  resultBody.innerHTML = `<tr><td colspan="12" class="empty-cell">${escapeHtml(message)}</td></tr>`;
}

function renderEmptyResults(message) {
  state.results = [];
  state.analysisMeta = null;
  headlineMetrics.innerHTML = "";
  analysisCards.innerHTML = "";
  chart.innerHTML = `<div class="helper-text">${escapeHtml(message)}</div>`;
  resultBody.innerHTML = `<tr><td colspan="12" class="empty-cell">${escapeHtml(message)}</td></tr>`;
}

function markCustomPreset() {
  if (state.activePresetId !== "custom") {
    state.activePresetId = "custom";
    renderPresetButtons();
  }
}

function applyPreset(presetId) {
  const preset = strategyPresets.find((item) => item.id === presetId);
  state.config = deepClone(preset?.resolvedConfig || mergeConfig(defaultConfig, preset ? preset.overrides : {}));
  state.activePresetId = preset ? preset.id : "auto";
  syncStaticControls();
  renderPresetButtons();
  renderParamCards();
  scheduleComputeAndRender(0);
}

function restoreDefaults() {
  state.config = deepClone(defaultConfig);
  state.activePresetId = "auto";
  syncStaticControls();
  renderPresetButtons();
  renderParamCards();
  scheduleComputeAndRender(0);
}

function scheduleComputeAndRender(delay = 160) {
  if (state.recomputeTimer) {
    clearTimeout(state.recomputeTimer);
  }

  state.recomputeTimer = window.setTimeout(() => {
    state.recomputeTimer = 0;
    void computeAndRender();
  }, delay);
}

async function computeAndRender() {
  if (!state.rows.length) {
    renderEmptyResults("请先上传数据，并完成字段映射。");
    return;
  }

  const requestVersion = state.analysisRequestVersion + 1;
  state.analysisRequestVersion = requestVersion;
  renderPendingState();

  try {
    const payload = await fetchOpenDayAnalysis();
    if (requestVersion !== state.analysisRequestVersion) {
      return;
    }

    state.results = Array.isArray(payload.results) ? payload.results : [];
    state.analysisMeta = payload.meta || null;

    if (!state.analysisMeta || !state.results.length) {
      renderEmptyResults("当前没有可展示的测算结果。");
      return;
    }

    renderSummary();
    renderAnalysisCards();
    renderChart();
    renderTable();
  } catch (error) {
    if (requestVersion !== state.analysisRequestVersion) {
      return;
    }

    renderEmptyResults(error instanceof Error ? error.message : "开放日测算失败");
  }
}

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  try {
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      if (!serverEnabled) {
        throw new Error("Excel 解析需要在本地服务下运行，请通过 React 工作台访问当前页面。");
      }

      await uploadWorkbook(file);
      return;
    }

    const text = await file.text();
    renderSheetPicker([], "");
    applyParsedData(parseCsv(text), file.name);
  } catch (error) {
    renderEmptyResults(error instanceof Error ? error.message : "文件读取失败");
  }
});

loadSampleBtn.addEventListener("click", () => {
  renderSheetPicker([], "");
  applyParsedData(parseCsv(sampleCsv), "示例数据");
});

resetDefaultsBtn.addEventListener("click", restoreDefaults);
recalcBtn.addEventListener("click", () => {
  void computeAndRender();
});

sheetPicker.addEventListener("change", async (event) => {
  const [file] = fileInput.files || [];
  if (!file || !/\.(xlsx|xls)$/i.test(file.name)) {
    return;
  }

  try {
    await uploadWorkbook(file, event.target.value);
  } catch (error) {
    renderEmptyResults(error instanceof Error ? error.message : "切换工作表失败");
  }
});

Object.entries(mappingSelectors).forEach(([key, select]) => {
  select.addEventListener("change", (event) => {
    state.mappings[key] = event.target.value;
    scheduleComputeAndRender();
  });
});

staticControls.waterlineMode.addEventListener("change", (event) => {
  state.config.waterlineMode = event.target.value;
  markCustomPreset();
  renderParamCards();
  scheduleComputeAndRender();
});

staticControls.alpha.addEventListener("input", (event) => {
  state.config.alpha = Math.max(0, Number(event.target.value) || 0);
  markCustomPreset();
  scheduleComputeAndRender();
});

staticControls.productWeight.addEventListener("input", (event) => {
  state.config.weights.product = Math.max(0, Number(event.target.value) || 0);
  markCustomPreset();
  scheduleComputeAndRender();
});

staticControls.interactionWeight.addEventListener("input", (event) => {
  state.config.weights.interaction = Math.max(0, Number(event.target.value) || 0);
  markCustomPreset();
  scheduleComputeAndRender();
});

staticControls.minInventory.addEventListener("input", (event) => {
  state.config.hardFilters.min_inventory = Math.max(0, Number(event.target.value) || 0);
  markCustomPreset();
  scheduleComputeAndRender();
});

staticControls.minPremium.addEventListener("input", (event) => {
  state.config.hardFilters.min_hq_rooms = Math.max(0, Number(event.target.value) || 0);
  markCustomPreset();
  scheduleComputeAndRender();
});

staticControls.minTransactions.addEventListener("input", (event) => {
  state.config.hardFilters.min_transaction = Math.max(0, Number(event.target.value) || 0);
  markCustomPreset();
  scheduleComputeAndRender();
});

async function bootstrapCatalog() {
  try {
    if (serverEnabled) {
      const payload = await fetchOpenDayCatalog();
      applyCatalog(payload);
    } else {
      syncStaticControls();
      renderPresetButtons();
      renderParamCards();
    }
  } catch (error) {
    syncStaticControls();
    renderPresetButtons();
    renderParamCards();
    renderEmptyResults(error instanceof Error ? `${error.message}，已自动回退到本地默认配置。` : "配置目录加载失败，已自动回退到本地默认配置。");
    return;
  }

  renderEmptyResults("请先上传数据，并完成字段映射。");
}

void bootstrapCatalog();
