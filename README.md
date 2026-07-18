# 电商数据可视化分析面板 · E-Commerce Data Visualization Dashboard

纯前端、零构建的电商数据可视化看板：上传你的 CSV / Excel，系统自动识别字段并实时生成多维度可视化，所有图表随筛选条件联动。

> ✅ 本项目已推送到 GitHub 仓库 [`qwqess121/E-commerce-Data-Visualization-Dashboard`](https://github.com/qwqess121/E-commerce-Data-Visualization-Dashboard)
> 🌐 启用 GitHub Pages 后的访问地址：`https://qwqess121.github.io/E-commerce-Data-Visualization-Dashboard/`

---

## ✨ 功能特性

- **上传即分析**：支持 CSV / Excel，自动识别中英文表头（销售额 / Sales、地区 / Region、利润 / Profit …），并弹出字段映射弹窗供手动校正。
- **字段稀疏自适应**：只强制要求「销售额」一个字段，缺少的维度图表会自动隐藏并友好提示缺了哪个字段。
- **丰富的可视化**：
  - 核心 KPI（总销售额、订单数、利润、客单价、环比）
  - 销售 & 利润趋势（折线 / 柱状，按月 / 季 / 年）
  - 品类销售占比（饼图 / 矩形树）、子品类利润排行
  - 各地区销售额、地区 × 月份销售堆叠
  - Top 10 商品、折扣—利润关系散点
  - 客户细分占比、配送方式分布
  - 可排序的数据明细表
- **强交互**：全局筛选（时间范围 / 地区 / 品类 / 客户细分 / 关键词）、图表点击下钻、明暗主题切换、导出筛选结果为 CSV。

---

## 🚀 一键托管到 GitHub Pages（让网页一直可访问）

仓库里的代码已经就绪，只需开启 Pages 即可生成一个**长期有效**的网址，无需任何服务器维护：

1. 打开仓库 **Settings → Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `main`，目录选择 `/ (root)`
4. 点击 **Save**，等待 1–2 分钟
5. 浏览器访问 `https://qwqess121.github.io/E-commerce-Data-Visualization-Dashboard/`

> 仓库已包含 `.nojekyll` 文件，确保静态资源不会被 Jekyll 处理，**开箱即用、刷新即生效**。

---

## 💻 本地运行

由于页面使用 `fetch` 加载示例数据，建议通过本地服务器打开（直接双击 `index.html` 也能用，只是示例数据需走内嵌兜底）：

```bash
# 在项目根目录执行
python -m http.server 8080
# 然后浏览器访问 http://127.0.0.1:8080
```

---

## 📁 目录结构

```
.
├── index.html                # 入口页面（离线版，库与字体均本地内置）
├── README.md
├── .nojekyll               # 禁用 GitHub Pages 的 Jekyll 处理
├── assets/
│   ├── css/style.css        # 样式（左侧导航 / 居中标题 / 响应式）
│   ├── fonts/               # Inter 字体（本地化，离线可用）
│   ├── vendor/              # 第三方库（本地内置）
│   │   ├── echarts.min.js   # ECharts 5.5.1 图表渲染
│   │   ├── papaparse.min.js # PapaParse 5.4.1 CSV 解析
│   │   └── xlsx.full.min.js # SheetJS 0.18.5 Excel 解析
│   └── js/
│       ├── utils.js         # 字段识别 / 归一化 / 聚合
│       ├── charts.js        # ECharts 渲染层
│       └── app.js           # 状态 / 上传 / 筛选联动 / 交互主控
└── data/
    ├── superstore.csv       # 内置示例数据（开源 Superstore 结构）
    └── sample.js            # 内嵌示例兜底（file:// 直接打开时生效）
```

---

## 📝 说明

- **完全离线**：第三方库与 Inter 字体均内置在 `assets/` 中，托管到任意静态服务（GitHub Pages / Vercel / Netlify 等）均无需联网。
- 示例数据仅作演示用途，将你自己的数据（CSV / Excel）通过「上传数据」按钮导入即可替换。
- 字段名若与常见中英文表头不同，系统会弹出字段映射弹窗供你手动指定。

---

## 🛠 技术栈

- [ECharts 5.5.1](https://echarts.apache.org/) — 图表渲染
- [PapaParse 5.4.1](https://www.papaparse.com/) — CSV 解析
- [SheetJS 0.18.5](https://sheetjs.com/) — Excel 解析
- 原生 HTML / CSS / JavaScript，无需打包工具
