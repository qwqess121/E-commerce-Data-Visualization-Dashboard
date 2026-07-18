/* ============================================================
 * utils.js — 数据规整、字段识别与通用工具
 * ============================================================ */
(function (global) {
  "use strict";

  // 规范化字段定义：key 为内部标准字段，aliases 用于表头自动识别（中英文）
  const FIELD_DEFS = [
    { key: "orderId",    label: "订单号",   type: "cat",  aliases: ["order id", "order_id", "订单号", "订单编号", "订单", "单号", "orderid"] },
    { key: "orderDate",  label: "订单日期", type: "date", aliases: ["order date", "order_date", "date", "日期", "时间", "下单日期", "订单日期", "购买日期", "交易日期", "支付日期", "成交日期", "提交日期", "订购日期", "下单时间", "orderdate", "ordertime"] },
    { key: "shipDate",   label: "发货日期", type: "date", aliases: ["ship date", "ship_date", "发货日期", "发货时间", "出库日期", "shipdate"] },
    { key: "shipMode",   label: "配送方式", type: "cat",  aliases: ["ship mode", "ship_mode", "配送方式", "运输方式", "物流方式", "物流", "shipmode"] },
    { key: "customer",   label: "客户",     type: "cat",  aliases: ["customer", "customer name", "客户", "客户名称", "买家", "客户昵称", "用户名", "下单人", "user"] },
    { key: "segment",    label: "客户细分", type: "cat",  aliases: ["segment", "细分", "客户细分", "客户类型", "客户分类", "customer segment"] },
    { key: "region",     label: "地区",     type: "cat",  aliases: ["region", "地区", "大区", "区域", "销售区域"] },
    { key: "state",      label: "省份/州",  type: "cat",  aliases: ["state", "province", "省份", "州", "省", "省市", "所在省"] },
    { key: "city",       label: "城市",     type: "cat",  aliases: ["city", "城市", "市", "所在城市"] },
    { key: "category",   label: "品类",     type: "cat",  aliases: ["category", "品类", "类别", "类目", "产品类别", "商品类别"] },
    { key: "subCategory",label: "子品类",   type: "cat",  aliases: ["sub-category", "subcategory", "子品类", "子类别", "子类目", "二级类目", "三级类目"] },
    { key: "product",    label: "商品",     type: "cat",  aliases: ["product", "product name", "商品", "产品", "货品", "品名", "商品名称", "productname"] },
    { key: "sales",      label: "销售额",   type: "num",  aliases: ["sales", "revenue", "amount", "销售额", "销售金额", "销售总额", "营收", "成交金额", "成交额", "总价", "总收入", "实付金额", "支付金额"] },
    { key: "profit",     label: "利润",     type: "num",  aliases: ["profit", "利润", "毛利", "净利润", "毛利额", "盈利", "净赚"] },
    { key: "quantity",   label: "数量",     type: "num",  aliases: ["quantity", "qty", "数量", "件数", "销量", "购买数量", "个数", "units"] },
    { key: "discount",   label: "折扣",     type: "num",  aliases: ["discount", "折扣", "discount rate", "折让", "折扣率"] },
  ];

  const NUMERIC_KEYS = FIELD_DEFS.filter(f => f.type === "num").map(f => f.key);
  const DATE_KEYS = FIELD_DEFS.filter(f => f.type === "date").map(f => f.key);

  function normHeader(h) {
    return String(h || "").trim().toLowerCase().replace(/[\s_\-（）()]/g, "");
  }

  // 自动识别：返回 { key: {col, raw} }
  function detectSchema(headers) {
    const map = {};            // key -> rawHeader
    const usedCols = new Set();
    const normToRaw = {};
    headers.forEach(h => { normToRaw[normHeader(h)] = h; });

    FIELD_DEFS.forEach(def => {
      // 精确匹配
      for (const a of def.aliases) {
        const raw = normToRaw[normHeader(a)];
        if (raw && !usedCols.has(raw)) { map[def.key] = raw; usedCols.add(raw); return; }
      }
      // 包含匹配（避免误伤，仅在未分配时）
      for (const h of headers) {
        const nh = normHeader(h);
        if (usedCols.has(h)) continue;
        if (def.aliases.some(a => nh.includes(normHeader(a)) && normHeader(a).length >= 3)) {
          map[def.key] = h; usedCols.add(h); return;
        }
      }
    });
    return map;
  }

  function parseNum(v) {
    if (v == null) return NaN;
    if (typeof v === "number") return v;
    let s = String(v).replace(/[, ¥$￥%]/g, "").trim();
    if (s === "" || s === "-") return NaN;
    if (s.endsWith("%")) s = s.slice(0, -1);
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }

  // 解析多种日期格式 -> Date 或 null
  function parseDate(v) {
    if (v == null) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    let s = String(v).trim();
    if (!s) return null;
    s = s.replace(/\//g, "-").replace(/\s*\(.*?\)\s*/g, "");
    // 去掉时间部分
    let datePart = s.split(/[ T]/)[0];
    let m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = datePart.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    m = datePart.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function fmtDate(d) {
    if (!d) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // 将原始行数组按 schema 转换为标准对象数组
  function normalizeRows(rawRows, schema) {
    const required = ["sales"]; // 至少需要销售额
    const missing = required.filter(k => !schema[k]);
    if (missing.length) throw new Error("未识别到必要字段：销售额（Sales）。请检查表头或手动映射。");

    const out = [];
    rawRows.forEach(r => {
      const o = {};
      for (const key in schema) {
        const col = schema[key];
        let val = r[col];
        if (NUMERIC_KEYS.includes(key)) val = parseNum(val);
        else if (DATE_KEYS.includes(key)) val = parseDate(val);
        else val = (val == null ? "" : String(val)).trim();
        o[key] = val;
      }
      // 派生时间字段
      if (o.orderDate instanceof Date) {
        o._y = o.orderDate.getFullYear();
        o._m = o.orderDate.getMonth() + 1;
        o._q = Math.floor((o.orderDate.getMonth()) / 3) + 1;
        o._ym = o._y * 100 + o._m;
      }
      out.push(o);
    });
    return out;
  }

  /* ---------- 格式化 ---------- */
  const nf = new Intl.NumberFormat("zh-CN");
  function money(n) {
    if (n == null || isNaN(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e8) return "¥" + (n / 1e8).toFixed(2) + "亿";
    if (abs >= 1e4) return "¥" + (n / 1e4).toFixed(1) + "万";
    return "¥" + nf.format(Math.round(n * 100) / 100);
  }
  function num(n) {
    if (n == null || isNaN(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e4) return (n / 1e4).toFixed(1) + "万";
    return nf.format(Math.round(n * 10) / 10);
  }
  function pct(n) {
    if (n == null || isNaN(n)) return "—";
    return (n * 100).toFixed(1) + "%";
  }

  /* ---------- 聚合工具 ---------- */
  function sum(arr, f) { let s = 0; for (const x of arr) { const v = f(x); if (!isNaN(v)) s += v; } return s; }
  function uniq(arr, f) { const s = new Set(); arr.forEach(x => { const v = f(x); if (v !== "" && v != null) s.add(v); }); return [...s]; }
  function groupSum(rows, dimKey, valKey) {
    const m = new Map();
    rows.forEach(r => {
      const k = r[dimKey];
      if (k == null || k === "") return;
      m.set(k, (m.get(k) || 0) + (parseNumSafe(r[valKey])));
    });
    return m;
  }
  function parseNumSafe(v) { const n = parseNum(v); return isNaN(n) ? 0 : n; }

  global.DV = {
    FIELD_DEFS, NUMERIC_KEYS, DATE_KEYS,
    detectSchema, normalizeRows, parseNum, parseDate, fmtDate,
    money, num, pct, sum, uniq, groupSum,
  };
})(window);
