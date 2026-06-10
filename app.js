const sampleCsv = `小区名称,在售套数,带看量,好房数,互动率
东洲家园,66,432,6,2.8%
慈云寺,62,421,5,2.4%
南湖中园二区,61,405,5,2.2%
今典花园,45,655,5,2.9%
澳洲康都,70,1120,4,0.72%
华腾园,38,290,4,1.9%
都会华庭,54,388,3,2.1%
远洋天地,43,376,4,1.8%
珠江罗马嘉园,51,345,5,1.7%
石韵浩庭,34,218,3,1.3%
西坝河东里,28,190,3,1.4%
金蝉里,25,172,2,1.1%
青年汇,19,165,2,0.9%
百子湾家园,58,310,4,1.5%
美景东方,40,254,3,1.6%`;

const defaultConfig = {
  inventory: {
    key: "inventory",
    title: "规模潜力",
    description: "在售套数，20 套起步，50 套满分",
    mode: "fixed",
    fixed: { min: 20, max: 50 },
    percentile: { min: 75, max: 95 },
  },
  traffic: {
    key: "traffic",
    title: "流量潜力",
    description: "带看量，400 次标杆，支持平滑指数",
    mode: "fixed",
    fixed: { benchmark: 400 },
    percentile: { benchmark: 95 },
  },
  premium: {
    key: "premium",
    title: "商品潜力",
    description: "好房数，5 套饱和",
    mode: "fixed",
    fixed: { benchmark: 5 },
    percentile: { benchmark: 95 },
  },
  interaction: {
    key: "interaction",
    title: "互动质量",
    description: "互动率，2% 健康线",
    mode: "fixed",
    fixed: { benchmark: 0.02 },
    percentile: { benchmark: 75 },
  },
};

const state = {
  rows: [],
  headers: [],
  workbookSheets: [],
  sourceName: "",
  mappings: {
    name: "",
    inventory: "",
    traffic: "",
    premium: "",
    interaction: "",
  },
  config: structuredClone(defaultConfig),
  results: [],
};

const fieldAliases = {
  name: ["小区", "名称", "楼盘", "项目", "community", "name"],
  inventory: ["在售", "inventory", "sale", "套数", "挂牌"],
  traffic: ["带看", "流量", "traffic", "view", "看房"],
  premium: ["好房", "精品", "premium", "房源"],
  interaction: ["互动", "转化", "成交", "rate", "offer", "互动率"],
};

const serverEnabled = window.location.protocol.startsWith("http");

const fileInput = document.querySelector("#file-input");
const loadSampleBtn = document.querySelector("#load-sample");
const resetDefaultsBtn = document.querySelector("#reset-defaults");
const recalcBtn = document.querySelector("#recalculate");
const dataSummary = document.querySelector("#data-summary");
const sheetPickerWrap = document.querySelector("#sheet-picker-wrap");
const sheetPicker = document.querySelector("#sheet-picker");
const resultBody = document.querySelector("#result-body");
const analysisCards = document.querySelector("#analysis-cards");
const headlineMetrics = document.querySelector("#headline-metrics");
const chart = document.querySelector("#chart");
const paramGrid = document.querySelector("#param-grid");

const mappingSelectors = {
  name: document.querySelector("#name-column"),
  inventory: document.querySelector("#inventory-column"),
  traffic: document.querySelector("#traffic-column"),
  premium: document.querySelector("#premium-column"),
  interaction: document.querySelector("#interaction-column"),
};

const weightInputs = {
  goods: document.querySelector("#goods-weight"),
  interaction: document.querySelector("#interaction-weight"),
  exponent: document.querySelector("#traffic-exponent"),
};

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
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
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
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

function guessMapping(type, headers) {
  const aliases = fieldAliases[type];
  return (
    headers.find((header) => aliases.some((alias) => header.toLowerCase().includes(alias.toLowerCase()))) || headers[0] || ""
  );
}

function populateMappingSelectors() {
  Object.entries(mappingSelectors).forEach(([key, element]) => {
    const options = ['<option value="">请选择字段</option>']
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

function renderParamCards() {
  const template = document.querySelector("#param-template");
  paramGrid.innerHTML = "";

  Object.values(state.config).forEach((config) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.key = config.key;
    node.querySelector("h3").textContent = config.title;
    node.querySelector("p").textContent = config.description;

    const modeSelect = node.querySelector(".mode-select");
    modeSelect.value = config.mode;
    modeSelect.addEventListener("change", (event) => {
      state.config[config.key].mode = event.target.value;
      renderParamCards();
      computeAndRender();
    });

    const inputs = node.querySelector(".param-inputs");
    inputs.innerHTML = config.mode === "fixed" ? buildFixedInputs(config) : buildPercentileInputs(config);
    attachParamInputEvents(inputs, config.key, config.mode);
    paramGrid.appendChild(node);
  });
}

function buildFixedInputs(config) {
  if (config.key === "inventory") {
    return `
      <div class="inline-pair">
        <label><span>起步值</span><input data-key="min" type="number" step="1" value="${config.fixed.min}" /></label>
        <label><span>满分值</span><input data-key="max" type="number" step="1" value="${config.fixed.max}" /></label>
      </div>
    `;
  }
  return `
    <label>
      <span>${config.key === "interaction" ? "健康线" : "标杆值"}</span>
      <input data-key="benchmark" type="number" step="${config.key === "interaction" ? "0.001" : "1"}" value="${config.fixed.benchmark}" />
    </label>
  `;
}

function buildPercentileInputs(config) {
  if (config.key === "inventory") {
    return `
      <div class="inline-pair">
        <label><span>起步分位</span><input data-key="min" type="number" min="1" max="99" step="1" value="${config.percentile.min}" /></label>
        <label><span>满分分位</span><input data-key="max" type="number" min="1" max="99" step="1" value="${config.percentile.max}" /></label>
      </div>
    `;
  }
  return `
    <label>
      <span>标杆分位</span>
      <input data-key="benchmark" type="number" min="1" max="99" step="1" value="${config.percentile.benchmark}" />
    </label>
  `;
}

function attachParamInputEvents(container, sectionKey, mode) {
  container.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", (event) => {
      const key = event.target.dataset.key;
      const target = state.config[sectionKey][mode];
      target[key] = Number(event.target.value);
      computeAndRender();
    });
  });
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text) return 0;
  if (text.endsWith("%")) return Number(text.slice(0, -1)) / 100;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 0;
}

function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = ((q / 100) * (sorted.length - 1));
  const base = Math.floor(position);
  const rest = position - base;
  const lower = sorted[base];
  const upper = sorted[base + 1] ?? lower;
  return lower + rest * (upper - lower);
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function getMappedRows() {
  const { name, inventory, traffic, premium, interaction } = state.mappings;
  if (![name, inventory, traffic, premium, interaction].every(Boolean)) {
    return [];
  }
  return state.rows.map((row) => ({
    name: row[name],
    inventory: parseNumber(row[inventory]),
    traffic: parseNumber(row[traffic]),
    premium: parseNumber(row[premium]),
    interaction: parseNumber(row[interaction]),
    raw: row,
  })).filter((row) => row.name);
}

function getResolvedThresholds(mappedRows) {
  const inventoryValues = mappedRows.map((row) => row.inventory);
  const trafficValues = mappedRows.map((row) => row.traffic);
  const premiumValues = mappedRows.map((row) => row.premium);
  const interactionValues = mappedRows.map((row) => row.interaction);

  return {
    inventoryMin:
      state.config.inventory.mode === "fixed"
        ? state.config.inventory.fixed.min
        : percentile(inventoryValues, state.config.inventory.percentile.min),
    inventoryMax:
      state.config.inventory.mode === "fixed"
        ? state.config.inventory.fixed.max
        : percentile(inventoryValues, state.config.inventory.percentile.max),
    trafficBenchmark:
      state.config.traffic.mode === "fixed"
        ? state.config.traffic.fixed.benchmark
        : percentile(trafficValues, state.config.traffic.percentile.benchmark),
    premiumBenchmark:
      state.config.premium.mode === "fixed"
        ? state.config.premium.fixed.benchmark
        : percentile(premiumValues, state.config.premium.percentile.benchmark),
    interactionBenchmark:
      state.config.interaction.mode === "fixed"
        ? state.config.interaction.fixed.benchmark
        : percentile(interactionValues, state.config.interaction.percentile.benchmark),
  };
}

function computeAndRender() {
  const mappedRows = getMappedRows();
  if (!mappedRows.length) {
    renderEmptyResults("请先完成数据上传和字段映射。");
    return;
  }

  const goodsWeight = Number(weightInputs.goods.value);
  const interactionWeight = Number(weightInputs.interaction.value);
  const exponent = Number(weightInputs.exponent.value);

  if (!goodsWeight && !interactionWeight) {
    renderEmptyResults("商品权重和互动权重不能同时为 0。");
    return;
  }

  const totalWeight = goodsWeight + interactionWeight;
  const normalizedGoodsWeight = goodsWeight / totalWeight;
  const normalizedInteractionWeight = interactionWeight / totalWeight;
  const thresholds = getResolvedThresholds(mappedRows);
  const inventorySpan = Math.max(thresholds.inventoryMax - thresholds.inventoryMin, 1e-6);

  const rawResults = mappedRows.map((row) => {
    const inventoryScore = clamp((row.inventory - thresholds.inventoryMin) / inventorySpan);
    const trafficScore = clamp(Math.pow(row.traffic / Math.max(thresholds.trafficBenchmark, 1e-6), exponent));
    const premiumScore = clamp(row.premium / Math.max(thresholds.premiumBenchmark, 1e-6));
    const interactionScore = clamp(row.interaction / Math.max(thresholds.interactionBenchmark, 1e-6));
    const blended = normalizedGoodsWeight * premiumScore + normalizedInteractionWeight * interactionScore;
    const rawScore = inventoryScore * trafficScore * blended * 100;
    return {
      ...row,
      inventoryScore: inventoryScore * 100,
      trafficScore: trafficScore * 100,
      premiumScore: premiumScore * 100,
      interactionScore: interactionScore * 100,
      rawScore,
    };
  });

  const maxRawScore = Math.max(...rawResults.map((item) => item.rawScore), 1);
  state.results = rawResults
    .map((item) => ({
      ...item,
      score: (item.rawScore / maxRawScore) * 100,
    }))
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      grade: getGrade(item.score),
    }));

  renderSummary(mappedRows.length, thresholds, normalizedGoodsWeight, normalizedInteractionWeight);
  renderAnalysisCards();
  renderChart();
  renderTable();
}

function getGrade(score) {
  if (score >= 85) return "S";
  if (score >= 65) return "A";
  if (score >= 40) return "B";
  return "C";
}

function renderSummary(rowCount, thresholds, goodsWeight, interactionWeight) {
  const top = state.results[0];
  const topCount = state.results.filter((item) => ["S", "A"].includes(item.grade)).length;
  headlineMetrics.innerHTML = [
    metricCard("样本小区数", String(rowCount), "当前上传数据参与测算的楼盘数量"),
    metricCard("冠军小区", top.name, `综合分 ${top.score.toFixed(1)}，互动分 ${top.interactionScore.toFixed(1)}`),
    metricCard("S/A 档占比", `${((topCount / rowCount) * 100).toFixed(1)}%`, `${topCount} 个小区进入重点投放池`),
    metricCard(
      "当前权重",
      `${(goodsWeight * 100).toFixed(0)} / ${(interactionWeight * 100).toFixed(0)}`,
      `阈值：规模 ${thresholds.inventoryMin.toFixed(1)}-${thresholds.inventoryMax.toFixed(1)}，流量 ${thresholds.trafficBenchmark.toFixed(1)}`,
    ),
  ].join("");
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

function renderAnalysisCards() {
  const topThree = state.results.slice(0, 3);
  const trafficLeader = [...state.results].sort((a, b) => b.traffic - a.traffic)[0];
  const efficiencyLeader = [...state.results]
    .filter((item) => item.inventoryScore < 100 && item.score >= 60)
    .sort((a, b) => b.interactionScore - a.interactionScore)[0];

  const cards = [
    {
      title: "头部盘解读",
      body: `${topThree.map((item) => item.name).join("、")}位居前列，说明它们同时具备规模、带看和互动的均衡性，更适合作为开放日核心会场。`,
    },
    {
      title: "流量与互动对比",
      body: `${trafficLeader.name} 的带看量最高，但最终排名为第 ${trafficLeader.rank}。这能帮助团队判断“声量型盘”和“转化型盘”是否发生分化。`,
    },
    {
      title: "效率型机会盘",
      body: efficiencyLeader
        ? `${efficiencyLeader.name} 没吃满规模分，但互动表现突出，适合做效率导向的开放日试点。`
        : "当前样本里暂未出现明显的效率型机会盘，说明头部结果更依赖全维度均衡。 ",
    },
  ];

  analysisCards.innerHTML = cards
    .map(
      (item) => `
        <article class="analysis-card">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.body)}</p>
        </article>
      `,
    )
    .join("");
}

function renderChart() {
  const topFive = state.results.slice(0, 5);
  chart.innerHTML = topFive
    .map(
      (item) => `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(item.name)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${item.score.toFixed(1)}%"></div></div>
          <div class="bar-value">${item.score.toFixed(1)}</div>
        </div>
      `,
    )
    .join("");
}

function renderTable() {
  resultBody.innerHTML = state.results
    .map(
      (item) => `
        <tr>
          <td><span class="rank-pill">#${item.rank}</span></td>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.score.toFixed(1)}</td>
          <td><span class="grade-pill grade-${item.grade}">${item.grade}</span></td>
          <td>${item.inventoryScore.toFixed(1)}</td>
          <td>${item.trafficScore.toFixed(1)}</td>
          <td>${item.premiumScore.toFixed(1)}</td>
          <td>${item.interactionScore.toFixed(1)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderEmptyResults(message) {
  headlineMetrics.innerHTML = "";
  analysisCards.innerHTML = "";
  chart.innerHTML = `<div class="helper-text">${escapeHtml(message)}</div>`;
  resultBody.innerHTML = `<tr><td colspan="8" class="empty-cell">${escapeHtml(message)}</td></tr>`;
}

function updateSummary(sourceName) {
  dataSummary.classList.remove("empty");
  dataSummary.innerHTML = `
    已加载 <strong>${escapeHtml(sourceName)}</strong>，共 <strong>${state.rows.length}</strong> 行，识别到字段：
    <span class="metric-footnote">${state.headers.map(escapeHtml).join(" / ")}</span>
  `;
}

function applyParsedData(parsed, sourceName) {
  state.headers = parsed.headers;
  state.rows = parsed.rows;
  state.sourceName = sourceName;
  state.mappings = {
    name: guessMapping("name", state.headers),
    inventory: guessMapping("inventory", state.headers),
    traffic: guessMapping("traffic", state.headers),
    premium: guessMapping("premium", state.headers),
    interaction: guessMapping("interaction", state.headers),
  };
  populateMappingSelectors();
  updateSummary(sourceName);
  computeAndRender();
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

async function uploadWorkbook(file, sheetName = "") {
  const formData = new FormData();
  formData.append("file", file);
  if (sheetName) formData.append("sheet", sheetName);

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

function restoreDefaults() {
  state.config = structuredClone(defaultConfig);
  weightInputs.goods.value = "0.65";
  weightInputs.interaction.value = "0.35";
  weightInputs.exponent.value = "0.8";
  renderParamCards();
  computeAndRender();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      if (!serverEnabled) {
        throw new Error("Excel 解析需要通过本地服务打开页面，请运行 python3 server.py 后访问 http://127.0.0.1:8000");
      }
      await uploadWorkbook(file);
      return;
    }
    const text = await file.text();
    renderSheetPicker([], "");
    applyParsedData(parseCsv(text), file.name);
  } catch (error) {
    renderEmptyResults(error.message);
  }
});

loadSampleBtn.addEventListener("click", () => {
  renderSheetPicker([], "");
  applyParsedData(parseCsv(sampleCsv), "示例数据");
});

resetDefaultsBtn.addEventListener("click", restoreDefaults);
recalcBtn.addEventListener("click", computeAndRender);

Object.entries(mappingSelectors).forEach(([key, select]) => {
  select.addEventListener("change", (event) => {
    state.mappings[key] = event.target.value;
    computeAndRender();
  });
});

Object.values(weightInputs).forEach((input) => {
  input.addEventListener("input", computeAndRender);
});

sheetPicker.addEventListener("change", async (event) => {
  const [file] = fileInput.files || [];
  if (!file || !file.name.toLowerCase().endsWith(".xlsx")) return;
  try {
    await uploadWorkbook(file, event.target.value);
  } catch (error) {
    renderEmptyResults(error.message);
  }
});

renderParamCards();
renderEmptyResults("请先上传或加载数据。");
