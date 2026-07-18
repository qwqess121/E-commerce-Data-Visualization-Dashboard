/* ============================================================
 * charts.js — 基于 ECharts 的可视化渲染层
 * 所有图表均数据驱动，随筛选状态实时重绘
 * ============================================================ */
(function (global) {
  "use strict";
  const DV = global.DV;
  const instances = new Map();

  const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1"];
  const PALETTE_DARK = ["#818cf8", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#f472b6", "#2dd4bf", "#fb923c", "#a5b4fc"];

  function themeOf(dark) {
    return {
      dark,
      text: dark ? "#cbd5e1" : "#475569",
      textStrong: dark ? "#e6eaf2" : "#1f2937",
      axisLine: dark ? "#374151" : "#cbd5e1",
      split: dark ? "#263041" : "#eef2f7",
      tipBg: dark ? "#1b2233" : "#ffffff",
      tipBorder: dark ? "#374151" : "#e5e9f2",
      palette: dark ? PALETTE_DARK : PALETTE,
      panel: dark ? "#161c2b" : "#ffffff",
    };
  }

  function getInst(dom) {
    let inst = instances.get(dom);
    if (!inst) { inst = echarts.init(dom, null, { renderer: "canvas" }); instances.set(dom, inst); }
    return inst;
  }
  function resizeAll() { instances.forEach(i => i.resize()); }
  function clearAll() { instances.forEach(i => i.clear()); }

  function baseOption(t) {
    return {
      backgroundColor: "transparent",
      textStyle: { color: t.text, fontFamily: "inherit" },
      tooltip: {
        backgroundColor: t.tipBg, borderColor: t.tipBorder, borderWidth: 1,
        textStyle: { color: t.textStrong, fontSize: 12 },
        extraCssText: "box-shadow:0 4px 14px rgba(0,0,0,.15);border-radius:8px;",
      },
      grid: { left: 48, right: 24, top: 30, bottom: 40, containLabel: true },
    };
  }
  function axisStyle(t) {
    return {
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.text, fontSize: 11 },
      splitLine: { lineStyle: { color: t.split } },
      axisTick: { show: false },
    };
  }
  function emptyOption(t, msg) {
    return {
      backgroundColor: "transparent",
      title: { text: msg || "无数据", left: "center", top: "center", textStyle: { color: t.text, fontSize: 13, fontWeight: 400 } },
    };
  }

  /* ---------------- 销售 & 利润趋势 ---------------- */
  function renderTrend(dom, rows, opts) {
    const t = themeOf(opts.dark);
    const inst = getInst(dom);
    const hasProfit = DV.sum(rows, r => r.profit) !== 0;
    const groups = new Map();
    rows.forEach(r => {
      if (!(r.orderDate instanceof Date)) return;
      let key, label;
      if (opts.granularity === "year") { key = r._y; label = r._y + ""; }
      else if (opts.granularity === "quarter") { key = r._y + "-Q" + r._q; label = r._y + " Q" + r._q; }
      else { key = r._ym; label = r._y + "/" + String(r._m).padStart(2, "0"); }
      if (!groups.has(key)) groups.set(key, { label, sales: 0, profit: 0 });
      const g = groups.get(key);
      g.sales += isNaN(r.sales) ? 0 : r.sales;
      g.profit += isNaN(r.profit) ? 0 : r.profit;
    });
    if (!groups.size) { inst.setOption(emptyOption(t, "未识别到「订单日期」字段，无法绘制趋势"), true); return; }
    const sorted = [...groups.values()].sort((a, b) => (a.label < b.label ? -1 : 1));
    const x = sorted.map(g => g.label);
    const salesData = sorted.map(g => +g.sales.toFixed(2));
    const profitData = sorted.map(g => +g.profit.toFixed(2));
    const series = [];
    if (opts.type === "bar") {
      series.push({ name: "销售额", type: "bar", data: salesData, itemStyle: { color: t.palette[0], borderRadius: [4, 4, 0, 0] },
        emphasis: { focus: "series" } });
      if (hasProfit) series.push({ name: "利润", type: "bar", yAxisIndex: 1, data: profitData, itemStyle: { color: t.palette[2], borderRadius: [4, 4, 0, 0] }, emphasis: { focus: "series" } });
    } else {
      series.push({ name: "销售额", type: "line", smooth: true, data: salesData, showSymbol: false,
        lineStyle: { width: 2.5, color: t.palette[0] }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: hexA(t.palette[0], .28) }, { offset: 1, color: hexA(t.palette[0], 0) }]) },
        emphasis: { focus: "series" } });
      if (hasProfit) series.push({ name: "利润", type: "line", smooth: true, yAxisIndex: 1, data: profitData, showSymbol: false, lineStyle: { width: 2.5, color: t.palette[2] }, emphasis: { focus: "series" } });
    }
    const opt = Object.assign(baseOption(t), {
      legend: { data: hasProfit ? ["销售额", "利润"] : ["销售额"], top: 0, textStyle: { color: t.text }, icon: "roundRect" },
      tooltip: Object.assign(baseOption(t).tooltip, { trigger: "axis", valueFormatter: v => DV.money(v) }),
      xAxis: Object.assign({ type: "category", data: x, boundaryGap: opts.type === "bar" }, axisStyle(t)),
      yAxis: hasProfit ? [
        Object.assign({ type: "value", name: "销售额", nameTextStyle: { color: t.text }, axisLabel: { color: t.text, formatter: v => DV.num(v) } }, axisStyle(t)),
        Object.assign({ type: "value", name: "利润", nameTextStyle: { color: t.text }, axisLabel: { color: t.text, formatter: v => DV.num(v) }, splitLine: { show: false } }, axisStyle(t)),
      ] : [
        Object.assign({ type: "value", name: "销售额", nameTextStyle: { color: t.text }, axisLabel: { color: t.text, formatter: v => DV.num(v) } }, axisStyle(t)),
      ],
      series,
    });
    inst.setOption(opt, true);
  }

  /* ---------------- 品类占比 ---------------- */
  function renderCategory(dom, rows, opts) {
    const t = themeOf(opts.dark);
    const inst = getInst(dom);
    const m = DV.groupSum(rows, "category", "sales");
    if (!m.size) { inst.setOption(emptyOption(t, "未识别到「品类」字段，无法绘制占比"), true); return; }
    const data = [...m.entries()].map(([k, v]) => ({ name: k, value: +v.toFixed(2) })).sort((a, b) => b.value - a.value);
    let opt;
    if (opts.type === "treemap") {
      opt = Object.assign(baseOption(t), {
        tooltip: { ...baseOption(t).tooltip, formatter: p => `${p.name}<br/>销售额 ${DV.money(p.value)}` },
        series: [{ type: "treemap", roam: false, data, label: { color: "#fff", fontSize: 12 }, upperLabel: { show: false },
          levels: [{ itemStyle: { borderColor: t.panel, borderWidth: 2, gapWidth: 2 } }] }],
      });
    } else {
      opt = Object.assign(baseOption(t), {
        tooltip: { ...baseOption(t).tooltip, trigger: "item", formatter: p => `${p.name}<br/>销售额 ${DV.money(p.value)} (${p.percent}%)` },
        legend: { type: "scroll", bottom: 0, textStyle: { color: t.text }, icon: "circle" },
        series: [{
          type: "pie", radius: ["42%", "70%"], center: ["50%", "46%"], avoidLabelOverlap: true,
          itemStyle: { borderColor: t.panel, borderWidth: 2, borderRadius: 4 },
          label: { color: t.text, formatter: "{b}\n{d}%" },
          data: data.map((d, i) => ({ ...d, itemStyle: { color: t.palette[i % t.palette.length] } })),
        }],
      });
    }
    inst.setOption(opt, true);
  }

  /* ---------------- 各地区销售额（可点击筛选） ---------------- */
  function renderRegion(dom, rows, opts) {
    const t = themeOf(opts.dark);
    const inst = getInst(dom);
    const m = DV.groupSum(rows, "region", "sales");
    if (!m.size) { inst.setOption(emptyOption(t, "未识别到「地区」字段，无法绘制地区分布"), true); return; }
    const data = [...m.entries()].map(([k, v]) => ({ name: k, value: +v.toFixed(2) })).sort((a, b) => a.value - b.value);
    const max = Math.max(...data.map(d => d.value));
    inst.setOption(Object.assign(baseOption(t), {
      tooltip: { ...baseOption(t).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: v => DV.money(v) },
      grid: { left: 70, right: 40, top: 10, bottom: 20, containLabel: true },
      xAxis: Object.assign({ type: "value", axisLabel: { color: t.text, formatter: v => DV.num(v) } }, axisStyle(t)),
      yAxis: Object.assign({ type: "category", data: data.map(d => d.name) }, axisStyle(t)),
      series: [{
        type: "bar", data: data.map(d => ({ value: d.value, itemStyle: { color: hexA(t.palette[0], 0.45 + 0.55 * d.value / max), borderRadius: [0, 5, 5, 0] } })),
        barWidth: "58%", label: { show: true, position: "right", color: t.text, formatter: p => DV.num(p.value) },
        emphasis: { itemStyle: { color: t.palette[0] } },
      }],
    }), true);
    inst.off("click"); inst.on("click", p => opts.onPick && opts.onPick(p.name));
  }

  /* ---------------- 子品类利润排行 ---------------- */
  function renderSubcat(dom, rows, opts) {
    const t = themeOf(opts.dark);
    const inst = getInst(dom);
    const m = DV.groupSum(rows, "subCategory", "profit");
    if (!m.size) { inst.setOption(emptyOption(t, "未识别到「子品类」字段，无法绘制利润排行"), true); return; }
    const data = [...m.entries()].map(([k, v]) => ({ name: k, value: +v.toFixed(2) })).sort((a, b) => a.value - b.value);
    inst.setOption(Object.assign(baseOption(t), {
      tooltip: { ...baseOption(t).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: v => DV.money(v) },
      grid: { left: 80, right: 50, top: 10, bottom: 20, containLabel: true },
      xAxis: Object.assign({ type: "value", axisLabel: { color: t.text, formatter: v => DV.num(v) } }, axisStyle(t)),
      yAxis: Object.assign({ type: "category", data: data.map(d => d.name) }, axisStyle(t)),
      series: [{
        type: "bar", data: data.map(d => ({ value: d.value, itemStyle: { color: d.value < 0 ? t.palette[4] : t.palette[2], borderRadius: 4 } })),
        barWidth: "58%", label: { show: true, position: "right", color: t.text, formatter: p => DV.num(p.value) },
      }],
    }), true);
  }

  /* ---------------- 客户细分 ---------------- */
  function donut(dom, rows, dim, opts, dimLabel) {
    const t = themeOf(opts.dark);
    const inst = getInst(dom);
    const m = DV.groupSum(rows, dim, "sales");
    if (!m.size) { inst.setOption(emptyOption(t, "未识别到「" + (dimLabel || dim) + "」字段"), true); return; }
    const data = [...m.entries()].map(([k, v]) => ({ name: k, value: +v.toFixed(2) })).sort((a, b) => b.value - a.value);
    inst.setOption(Object.assign(baseOption(t), {
      tooltip: { ...baseOption(t).tooltip, trigger: "item", formatter: p => `${p.name}<br/>销售额 ${DV.money(p.value)} (${p.percent}%)` },
      legend: { bottom: 0, textStyle: { color: t.text }, icon: "circle" },
      series: [{
        type: "pie", radius: ["45%", "68%"], center: ["50%", "44%"], avoidLabelOverlap: true,
        itemStyle: { borderColor: t.panel, borderWidth: 2 }, label: { show: false },
        data: data.map((d, i) => ({ ...d, itemStyle: { color: t.palette[i % t.palette.length] } })),
      }],
    }), true);
  }

  /* ---------------- Top 商品（可点击筛选） ---------------- */
  function renderTopProducts(dom, rows, opts) {
    const t = themeOf(opts.dark);
    const inst = getInst(dom);
    const m = DV.groupSum(rows, "product", "sales");
    if (!m.size) { inst.setOption(emptyOption(t, "未识别到「商品」字段，无法绘制 Top 商品"), true); return; }
    const data = [...m.entries()].map(([k, v]) => ({ name: k, value: +v.toFixed(2) })).sort((a, b) => b.value - a.value).slice(0, 10).reverse();
    inst.setOption(Object.assign(baseOption(t), {
      tooltip: { ...baseOption(t).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: v => DV.money(v) },
      grid: { left: 10, right: 60, top: 10, bottom: 10, containLabel: true },
      xAxis: Object.assign({ type: "value", axisLabel: { color: t.text, formatter: v => DV.num(v) } }, axisStyle(t)),
      yAxis: Object.assign({ type: "category", data: data.map(d => d.name), axisLabel: { color: t.text, fontSize: 10 } }, axisStyle(t)),
      series: [{
        type: "bar", data: data.map(d => d.value), barWidth: "60%",
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: t.palette[0] }, { offset: 1, color: t.palette[1] }]), borderRadius: [0, 5, 5, 0] },
        label: { show: true, position: "right", color: t.text, formatter: p => DV.num(p.value) },
      }],
    }), true);
    inst.off("click"); inst.on("click", p => opts.onPick && opts.onPick(p.name));
  }

  /* ---------------- 折扣-利润散点 ---------------- */
  function renderScatter(dom, rows, opts) {
    const t = themeOf(opts.dark);
    const inst = getInst(dom);
    let pts = rows.filter(r => !isNaN(r.discount) && !isNaN(r.profit));
    if (pts.length > 2500) pts = pts.filter((_, i) => i % Math.ceil(pts.length / 2500) === 0);
    if (!pts.length) { inst.setOption(emptyOption(t, "需同时具备「折扣」与「利润」字段"), true); return; }
    const pos = [], neg = [];
    pts.forEach(r => { const p = [r.discount, +r.profit.toFixed(2)]; (r.profit >= 0 ? pos : neg).push(p); });
    inst.setOption(Object.assign(baseOption(t), {
      tooltip: { ...baseOption(t).tooltip, formatter: p => `折扣 ${(p.value[0] * 100).toFixed(0)}%<br/>利润 ${DV.money(p.value[1])}` },
      legend: { data: ["盈利", "亏损"], top: 0, textStyle: { color: t.text }, icon: "circle" },
      grid: { left: 50, right: 24, top: 34, bottom: 40, containLabel: true },
      xAxis: Object.assign({ type: "value", name: "折扣", nameTextStyle: { color: t.text }, axisLabel: { color: t.text, formatter: v => (v * 100).toFixed(0) + "%" } }, axisStyle(t)),
      yAxis: Object.assign({ type: "value", name: "利润", nameTextStyle: { color: t.text }, axisLabel: { color: t.text, formatter: v => DV.num(v) } }, axisStyle(t)),
      series: [
        { name: "盈利", type: "scatter", data: pos, symbolSize: 7, itemStyle: { color: hexA(t.palette[2], .6) } },
        { name: "亏损", type: "scatter", data: neg, symbolSize: 7, itemStyle: { color: hexA(t.palette[4], .6) } },
      ],
    }), true);
  }

  /* ---------------- 地区 × 月份 销售堆叠 ---------------- */
  function renderHeatmap(dom, rows, opts) {
    const t = themeOf(opts.dark);
    const inst = getInst(dom);
    const regions = DV.uniq(rows, r => r.region).sort();
    if (!regions.length) { inst.setOption(emptyOption(t, "需同时具备「地区」与「订单日期」字段"), true); return; }
    const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    const acc = {};
    rows.forEach(r => {
      if (!(r.orderDate instanceof Date) || !r.region) return;
      const k = r.region + "#" + r._m;
      acc[k] = (acc[k] || 0) + (isNaN(r.sales) ? 0 : r.sales);
    });
    const series = regions.map((rg, i) => ({
      name: rg,
      type: "bar",
      stack: "month",
      data: months.map((_, mi) => +((acc[rg + "#" + (mi + 1)] || 0).toFixed(2))),
      itemStyle: { color: t.palette[i % t.palette.length] },
      emphasis: { focus: "series" },
    }));
    inst.setOption(Object.assign(baseOption(t), {
      tooltip: { ...baseOption(t).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: v => DV.money(v) },
      legend: { type: "scroll", bottom: 0, textStyle: { color: t.text }, icon: "roundRect" },
      grid: { left: 50, right: 20, top: 14, bottom: 46, containLabel: true },
      xAxis: Object.assign({ type: "category", data: months }, axisStyle(t)),
      yAxis: Object.assign({ type: "value", name: "销售额", nameTextStyle: { color: t.text }, axisLabel: { color: t.text, formatter: v => DV.num(v) } }, axisStyle(t)),
      series,
    }), true);
  }

  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  global.Charts = {
    resizeAll, clearAll,
    renderTrend, renderCategory, renderRegion, renderSubcat,
    renderSegment: (d, r, o) => donut(d, r, "segment", o, "客户细分"),
    renderShip: (d, r, o) => donut(d, r, "shipMode", o, "配送方式"),
    renderTopProducts, renderScatter, renderHeatmap,
  };
})(window);
