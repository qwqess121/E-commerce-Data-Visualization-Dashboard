/* ============================================================
 * app.js — 应用主控：状态、上传解析、字段映射、筛选联动、渲染
 * ============================================================ */
(function () {
  "use strict";
  const DV = window.DV, Charts = window.Charts;

  const $ = id => document.getElementById(id);
  const state = {
    allRows: [],
    schema: {},
    rawHeaders: [],
    datasetName: "",
    filters: { dateStart: null, dateEnd: null, regions: new Set(), categories: new Set(), segments: new Set(), search: "" },
    ui: { theme: "light", trendType: "line", trendGran: "month", catType: "pie" },
    tableSort: { key: "orderDate", dir: -1 },
  };

  /* ---------------- 提示 ---------------- */
  let toastTimer;
  function toast(msg) {
    const el = $("toast"); el.textContent = msg; el.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  /* ---------------- 解析入口 ---------------- */
  function parseAndLoad(text, type, name) {
    let rawRows, headers;
    try {
      if (type === "csv") {
        const res = Papa.parse(text, { header: true, skipEmptyLines: true });
        rawRows = res.data; headers = res.meta.fields || [];
      } else {
        const wb = XLSX.read(text, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        headers = rawRows.length ? Object.keys(rawRows[0]) : [];
      }
    } catch (e) { toast("文件解析失败：" + e.message); return; }
    if (!headers.length || !rawRows.length) { toast("未识别到有效数据行"); return; }
    state.rawHeaders = headers;
    state._pendingRaw = rawRows;
    state._pendingName = name;
    openMapping(detectAndDefault(headers));
  }

  function detectAndDefault(headers) {
    const detected = DV.detectSchema(headers);
    // 映射表：每个标准字段 -> 选中的原始表头（或 "（不使用）"）
    const map = {};
    DV.FIELD_DEFS.forEach(def => { map[def.key] = detected[def.key] || ""; });
    return map;
  }

  /* ---------------- 字段映射弹窗 ---------------- */
  function openMapping(map) {
    state._mapping = map;
    const grid = $("mappingGrid"); grid.innerHTML = "";
    DV.FIELD_DEFS.forEach(def => {
      const row = document.createElement("div");
      row.className = "map-row";
      const sel = document.createElement("select");
      const optNone = document.createElement("option");
      optNone.value = ""; optNone.textContent = "（不使用）";
      sel.appendChild(optNone);
      state.rawHeaders.forEach(h => {
        const o = document.createElement("option"); o.value = h; o.textContent = h;
        if (map[def.key] === h) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", () => { state._mapping[def.key] = sel.value; });
      row.innerHTML = `<span class="src">${def.label}</span>`;
      row.appendChild(sel);
      grid.appendChild(row);
    });
    $("mappingModal").classList.remove("hidden");
  }

  function applyMapping() {
    const schema = {};
    for (const k in state._mapping) {
      const v = state._mapping[k];
      if (v) schema[k] = v;
    }
    try {
      const rows = DV.normalizeRows(state._pendingRaw, schema);
      state.allRows = rows; state.schema = schema; state.datasetName = state._pendingName;
      $("mappingModal").classList.add("hidden");
      afterLoad();
      toast("已加载 " + rows.length + " 条记录");
    } catch (e) { toast(e.message); }
  }

  function afterLoad() {
    buildChips();
    initDateBounds();
    resetFilters(false);
    render();
  }

  /* ---------------- 筛选器 UI ---------------- */
  function buildChips() {
    const regions = DV.uniq(state.allRows, r => r.region).sort();
    const cats = DV.uniq(state.allRows, r => r.category).sort();
    const segs = DV.uniq(state.allRows, r => r.segment).sort();
    renderChips($("regionChips"), regions, state.filters.regions);
    renderChips($("categoryChips"), cats, state.filters.categories);
    renderChips($("segmentChips"), segs, state.filters.segments);
  }
  function renderChips(container, values, set) {
    container.innerHTML = "";
    if (!values.length) { container.innerHTML = '<span style="color:var(--text-soft);font-size:12px">（无该字段）</span>'; return; }
    values.forEach(v => {
      const c = document.createElement("span");
      c.className = "chip" + (set.has(v) ? " active" : "");
      c.textContent = v;
      c.addEventListener("click", () => {
        if (set.has(v)) set.delete(v); else set.add(v);
        c.classList.toggle("active");
        render();
      });
      container.appendChild(c);
    });
  }

  function initDateBounds() {
    const dates = state.allRows.map(r => r.orderDate).filter(d => d instanceof Date).sort((a, b) => a - b);
    if (!dates.length) { $("dateStart").disabled = $("dateEnd").disabled = true; return; }
    const min = DV.fmtDate(dates[0]), max = DV.fmtDate(dates[dates.length - 1]);
    [$("dateStart"), $("dateEnd")].forEach(inp => { inp.min = min; inp.max = max; inp.disabled = false; });
    if (!state.filters.dateStart) { state.filters.dateStart = min; $("dateStart").value = min; }
    if (!state.filters.dateEnd) { state.filters.dateEnd = max; $("dateEnd").value = max; }
  }

  function resetFilters(rerender = true) {
    state.filters.regions.clear(); state.filters.categories.clear(); state.filters.segments.clear();
    state.filters.search = "";
    $("searchInput").value = "";
    const dates = state.allRows.map(r => r.orderDate).filter(d => d instanceof Date).sort((a, b) => a - b);
    if (dates.length) {
      state.filters.dateStart = DV.fmtDate(dates[0]); state.filters.dateEnd = DV.fmtDate(dates[dates.length - 1]);
      $("dateStart").value = state.filters.dateStart; $("dateEnd").value = state.filters.dateEnd;
    }
    buildChips();
    if (rerender) render();
  }

  /* ---------------- 数据筛选 ---------------- */
  function getFiltered(overrides) {
    const f = Object.assign({}, state.filters, overrides || {});
    const s = (f.search || "").trim().toLowerCase();
    return state.allRows.filter(r => {
      if (f.dateStart && r.orderDate instanceof Date && r.orderDate < new Date(f.dateStart + "T00:00:00")) return false;
      if (f.dateEnd && r.orderDate instanceof Date && r.orderDate > new Date(f.dateEnd + "T23:59:59")) return false;
      if (f.regions.size && !f.regions.has(r.region)) return false;
      if (f.categories.size && !f.categories.has(r.category)) return false;
      if (f.segments.size && !f.segments.has(r.segment)) return false;
      if (s) {
        const hay = ((r.customer || "") + " " + (r.product || "")).toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }

  /* ---------------- KPI ---------------- */
  function computeKPIs(rows) {
    const hasProfit = "profit" in state.schema;
    const hasQty = "quantity" in state.schema;
    const hasOrder = "orderId" in state.schema;
    const sales = DV.sum(rows, r => r.sales);
    const profit = hasProfit ? DV.sum(rows, r => r.profit) : NaN;
    const units = hasQty ? DV.sum(rows, r => r.quantity) : NaN;
    const orderSet = new Set(); if (hasOrder) rows.forEach(r => r.orderId && orderSet.add(r.orderId));
    const orderCount = hasOrder ? orderSet.size : rows.length;
    const aov = orderCount ? sales / orderCount : NaN;
    return { sales, profit, hasProfit, units, hasQty, orderCount, aov, margin: sales ? profit / sales : NaN };
  }

  function deltaHTML(cur, prev) {
    if (prev == null || isNaN(prev) || prev === 0) return '<div class="k-delta flat">— 环比</div>';
    const d = (cur - prev) / Math.abs(prev);
    const cls = d > 0.0005 ? "up" : d < -0.0005 ? "down" : "flat";
    const arrow = d > 0.0005 ? "▲" : d < -0.0005 ? "▼" : "■";
    return `<div class="k-delta ${cls}">${arrow} 环比 ${(d * 100).toFixed(1)}%</div>`;
  }

  function renderKPI(rows) {
    const k = computeKPIs(rows);
    // 环比：取与当前筛选条件相同、但时间前移一个等长区间的数据
    let prev = null;
    if (state.filters.dateStart && state.filters.dateEnd && k.hasProfit !== undefined) {
      const start = new Date(state.filters.dateStart + "T00:00:00");
      const end = new Date(state.filters.dateEnd + "T23:59:59");
      const days = Math.round((end - start) / 86400000);
      const pEnd = new Date(start.getTime() - 86400000);
      const pStart = new Date(pEnd.getTime() - days * 86400000);
      const pRows = getFiltered({
        dateStart: DV.fmtDate(pStart), dateEnd: DV.fmtDate(pEnd),
      });
      if (pRows.length) prev = computeKPIs(pRows);
    }
    const cards = [
      { label: "总销售额", value: DV.money(k.sales), delta: prev ? deltaHTML(k.sales, prev.sales) : '<div class="k-delta flat">— 环比</div>' },
      { label: "总利润", value: k.hasProfit ? DV.money(k.profit) : "—", delta: prev && k.hasProfit ? deltaHTML(k.profit, prev.profit) : '<div class="k-delta flat">—</div>' },
      { label: "利润率", value: k.hasProfit ? DV.pct(k.margin) : "—", delta: '<div class="k-delta flat">基于筛选</div>' },
      { label: "订单数", value: DV.num(k.orderCount), delta: prev ? deltaHTML(k.orderCount, prev.orderCount) : '<div class="k-delta flat">— 环比</div>' },
      { label: "客单价", value: DV.money(k.aov), delta: prev ? deltaHTML(k.aov, prev.aov) : '<div class="k-delta flat">— 环比</div>' },
      { label: "销量(件)", value: k.hasQty ? DV.num(k.units) : "—", delta: '<div class="k-delta flat">基于筛选</div>' },
    ];
    $("kpiRow").innerHTML = cards.map(c =>
      `<div class="kpi"><div class="k-label">${c.label}</div><div class="k-value">${c.value}</div>${c.delta}</div>`
    ).join("");
  }

  /* ---------------- 按字段自动显隐卡片/板块 ---------------- */
  function syncCardVisibility() {
    document.querySelectorAll(".card[data-requires]").forEach(card => {
      const req = card.dataset.requires.split(",");
      const ok = req.every(k => k in state.schema);
      card.classList.toggle("card-hidden", !ok);
    });
    document.querySelectorAll(".sec").forEach(sec => {
      const any = sec.querySelector(".card:not(.card-hidden)");
      sec.classList.toggle("sec-hidden", !any && !sec.querySelector("#kpiRow"));
    });
  }

  /* ---------------- 总渲染 ---------------- */
  function render() {
    syncCardVisibility();
    const rows = getFiltered();
    renderKPI(rows);
    const dark = state.ui.theme === "dark";
    const ui = state.ui;
    Charts.renderTrend($("chartTrend"), rows, { dark, granularity: ui.trendGran, type: ui.trendType });
    Charts.renderCategory($("chartCategory"), rows, { dark, type: ui.catType });
    Charts.renderRegion($("chartRegion"), rows, { dark, onPick: pickRegion });
    Charts.renderSubcat($("chartSubcat"), rows, { dark });
    Charts.renderSegment($("chartSegment"), rows, { dark });
    Charts.renderShip($("chartShip"), rows, { dark });
    Charts.renderTopProducts($("chartTopProducts"), rows, { dark, onPick: pickProduct });
    Charts.renderScatter($("chartScatter"), rows, { dark });
    Charts.renderHeatmap($("chartHeatmap"), rows, { dark });
    renderTable(rows);
    updateMeta(rows.length);
  }

  function pickRegion(name) {
    if (state.filters.regions.has(name)) state.filters.regions.delete(name);
    else state.filters.regions.add(name);
    buildChips(); render();
  }
  function pickProduct(name) {
    // 商品筛选：用搜索框承载
    state.filters.search = state.filters.search === name ? "" : name;
    $("searchInput").value = state.filters.search;
    render();
  }

  function updateMeta(n) {
    const f = state.schema;
    const fields = Object.keys(f).map(k => DV.FIELD_DEFS.find(d => d.key === k).label).join("、");
    $("datasetMeta").textContent = `数据源：${state.datasetName} · ${state.allRows.length} 条记录 · 当前筛选 ${n} 条 · 已识别字段：${fields}`;
  }

  /* ---------------- 数据明细表 ---------------- */
  const TABLE_COLS = [
    { key: "orderDate", label: "订单日期", type: "date" },
    { key: "region", label: "地区", type: "txt" },
    { key: "category", label: "品类", type: "txt" },
    { key: "subCategory", label: "子品类", type: "txt" },
    { key: "customer", label: "客户", type: "txt" },
    { key: "product", label: "商品", type: "txt" },
    { key: "sales", label: "销售额", type: "num" },
    { key: "profit", label: "利润", type: "num" },
    { key: "quantity", label: "数量", type: "num" },
  ];
  function renderTable(rows) {
    const cols = TABLE_COLS.filter(c => c.key in state.schema);
    const { key, dir } = state.tableSort;
    const sorted = rows.slice().sort((a, b) => {
      let va = a[key], vb = b[key];
      if (va instanceof Date) va = va.getTime(); if (vb instanceof Date) vb = vb.getTime();
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va == null) va = -Infinity; if (vb == null) vb = -Infinity;
      return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
    });
    const view = sorted.slice(0, 200);
    if (!view.length) { $("dataTable").innerHTML = '<div style="padding:20px;color:var(--text-soft)">无匹配数据</div>'; return; }
    let html = '<table class="data"><thead><tr>';
    cols.forEach(c => {
      const arrow = state.tableSort.key === c.key ? (dir < 0 ? " ↓" : " ↑") : "";
      html += `<th class="${c.type === "txt" ? "txt" : ""}">${c.label}${arrow}</th>`;
    });
    html += "</tr></thead><tbody>";
    view.forEach(r => {
      html += "<tr>";
      cols.forEach(c => {
        let v = r[c.key];
        if (c.type === "date") v = v instanceof Date ? DV.fmtDate(v) : (v || "");
        else if (c.type === "num") {
          if (c.key === "sales") v = DV.money(v);
          else if (c.key === "profit") v = DV.money(v);
          else v = DV.num(v);
          const num = parseFloat(v);
          html += `<td class="${!isNaN(num) && (r[c.key] < 0) ? "neg" : ""}">${v}</td>`; return;
        } else v = v || "";
        html += `<td class="txt">${v}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    $("dataTable").innerHTML = html;
    $("dataTable").querySelectorAll("th").forEach((th, i) => {
      th.addEventListener("click", () => {
        const c = cols[i];
        if (state.tableSort.key === c.key) state.tableSort.dir *= -1;
        else { state.tableSort.key = c.key; state.tableSort.dir = c.type === "txt" ? 1 : -1; }
        renderTable(getFiltered());
      });
    });
  }

  /* ---------------- 左侧导航：滚动联动 ---------------- */
  function initNav() {
    const links = Array.from(document.querySelectorAll(".side-nav a"));
    if (!links.length) return;
    links.forEach(a => a.addEventListener("click", e => {
      e.preventDefault();
      const el = document.getElementById(a.dataset.target);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    const sections = links.map(a => document.getElementById(a.dataset.target)).filter(Boolean);
    if (!("IntersectionObserver" in window)) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          links.forEach(l => l.classList.toggle("active", l.dataset.target === en.target.id));
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    sections.forEach(s => obs.observe(s));
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    $("fileInput").addEventListener("change", e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
    $("loadSampleBtn").addEventListener("click", loadSample);
    $("exportBtn").addEventListener("click", exportCSV);
    $("themeBtn").addEventListener("click", toggleTheme);
    $("resetBtn").addEventListener("click", () => resetFilters(true));
    $("mappingOk").addEventListener("click", applyMapping);
    $("mappingCancel").addEventListener("click", () => $("mappingModal").classList.add("hidden"));

    $("dateStart").addEventListener("change", e => { state.filters.dateStart = e.target.value; render(); });
    $("dateEnd").addEventListener("change", e => { state.filters.dateEnd = e.target.value; render(); });
    let st; $("searchInput").addEventListener("input", e => {
      clearTimeout(st); st = setTimeout(() => { state.filters.search = e.target.value; render(); }, 200);
    });

    document.querySelectorAll("[data-trend]").forEach(b => b.addEventListener("click", () => {
      document.querySelectorAll("[data-trend]").forEach(x => x.classList.remove("active"));
      b.classList.add("active"); state.ui.trendType = b.dataset.trend; render();
    }));
    $("trendGran").addEventListener("change", e => { state.ui.trendGran = e.target.value; render(); });
    document.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => {
      document.querySelectorAll("[data-cat]").forEach(x => x.classList.remove("active"));
      b.classList.add("active"); state.ui.catType = b.dataset.cat; render();
    }));

    // 拖拽上传
    const overlay = $("dropOverlay");
    ["dragenter", "dragover"].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); overlay.classList.add("show"); }));
    ["dragleave", "drop"].forEach(ev => document.addEventListener(ev, e => {
      if (ev === "drop" || e.relatedTarget === null) overlay.classList.remove("show");
    }));
    document.addEventListener("drop", e => {
      e.preventDefault(); overlay.classList.remove("show");
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    window.addEventListener("resize", () => Charts.resizeAll());
  }

  function handleFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      const reader = new FileReader();
      reader.onload = () => parseAndLoad(reader.result, "csv", file.name);
      reader.readAsText(file, "UTF-8");
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = () => parseAndLoad(new Uint8Array(reader.result), "xlsx", file.name);
      reader.readAsArrayBuffer(file);
    } else { toast("仅支持 CSV / Excel 文件"); }
  }

  function toggleTheme() {
    state.ui.theme = state.ui.theme === "dark" ? "light" : "dark";
    document.body.classList.toggle("dark", state.ui.theme === "dark");
    $("themeBtn").textContent = state.ui.theme === "dark" ? "☀ 亮色" : "🌙 暗色";
    render();
  }

  function exportCSV() {
    const rows = getFiltered();
    if (!rows.length) { toast("当前无数据可导出"); return; }
    const cols = TABLE_COLS.filter(c => c.key in state.schema).map(c => c.key);
    const data = rows.map(r => {
      const o = {}; cols.forEach(k => { o[k] = r[k] instanceof Date ? DV.fmtDate(r[k]) : r[k]; });
      return o;
    });
    const csv = Papa.unparse({ fields: cols, data: data.map(r => cols.map(k => r[k])) });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "电商数据筛选结果.csv"; a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出 " + rows.length + " 条记录");
  }

  /* ---------------- 加载示例 ---------------- */
  async function loadSample() {
    let csvText = null;
    try {
      const r = await fetch("data/superstore.csv");
      if (r.ok) csvText = await r.text();
    } catch (e) { /* file:// 下 fetch 失败，回退到内置数据 */ }
    if (!csvText && window.__SAMPLE_CSV__) csvText = window.__SAMPLE_CSV__;
    if (!csvText) { toast("无法加载示例数据，请点击“上传数据”导入 CSV/Excel"); return; }
    parseAndLoad(csvText, "csv", "示例数据（开源 Superstore 结构）");
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    bindEvents();
    initNav();
    loadSample();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
