# 进境台 · 设计与交互验收

日期：2026-10-04。验收对象为 Windows Electron 桌面界面原型。未接入 Codex。

## 比较对象和证据

来源视觉：`E:/ChatGPT/进境台/design/ux-v1/screens/01-today-detail.png`、`02-calendar.png`、`03-projects.png`、`04-retrospective.png`。交互依据：`../design/ux-v1/interaction-spec.md`。

实现截图：`qa/01-today-detail.png`、`qa/02-calendar-baseline.png`、`qa/03-projects-baseline.png`、`qa/04-retrospective-baseline.png`。分别为今日草稿及选中详情、2026-10-03 日历、潮痕手作项目、本周回望。baseline 截图在测试修改数据之前捕获。

来源与实现均为 1487×1058 像素；Electron 内容视口为 1487×1058 CSS px，截图密度为 1。无浏览器或窗口标题栏。直接在同一张比较输入中并排查看，未将分开的图片误认为并排比较：

- `qa/comparison-01-today-detail-final.png`
- `qa/comparison-02-calendar-final.png`
- `qa/comparison-03-projects-final.png`
- `qa/comparison-04-retrospective-final.png`

局部字体、层级和选中线比较：`qa/focus-reading-final.png`；同时放大查看 1024px 编辑面板截图。全图和局部均已实际打开检查。局部裁切因左栏宽度略有差别而存在约 24px 对齐偏差，完整比较用于判断区域比例，局部用于读字与素材细节。

状态证据：`qa/05-edit.png`、`qa/06-add.png`、`qa/07-new-draft.png`、`qa/08-empty.png`。窗口适配：`qa/responsive-1440.png`、`responsive-1280.png`、`responsive-1024.png`，内容高度为 900px。

内置浏览器连接返回“privileged native pipe bridge is not available; browser-client is not trusted”。本轮采用桌面应用自身的 BrowserWindow 渲染、capturePage 截图与应用内 DOM 操作验收；未使用 Playwright 或把网页预览当作桌面交付。

## 发现、修复及比较历史

1. 第一轮 blocked：P2 选中竖线几乎不可见，墨块按钮过扁，左栏山水过小，字体层级偏弱。证据 `qa/comparison-today-iteration1.png`。修复：对真实透明 PNG 调整裁切比例，扩大左栏插画显示区域，提高标题、记录行和说明文字的字号，保留稳定底栏。
2. 第二轮 blocked：P1 项目页多出全宽页头；P2 日历没有源图的明确格线，月份箭头离标题太远；P2 回望缺少双栏层级；P2 插画白底挡住品牌墨圈下部。证据 `qa/comparison-*-iteration2.png`。修复：将项目标题放回第二栏，主体恢复状态、下一步、历程；月历增加完整周、相邻月份日期及轻格线；月份控件相邻；回望按项目分组并增加右栏所得和待继续；插画退到品牌后方。
3. 第三轮：证据 `qa/comparison-*-iteration3.png`。补充离线 Noto Sans SC，统一标题与正文两种字体；回望的周月年与日期范围回到同一工具行；今日列表使用简短摘要而详情保留全文。项目补记改为区域唯一的水墨主动作，最终截图重新捕获。
4. 最终：查看上面的四张完整并排比较和局部比较；关键区域没有遮挡、错误状态或不可达控件。1024px 使用覆盖式详情，1440px 使用分栏，保存区域在窗口内。无剩余阻塞使用的 P0/P1/P2。

## 五项视觉检查

| 表面 | 结论 |
| --- | --- |
| 字体和排版 | 标题使用离线 Noto Serif SC，正文及控件使用 Noto Sans SC；实际窗口字号按交互规范收敛到 17–20px 正文、48px 主标题，较示意图略紧凑。中文换行、标题和说明的区分已检查。 |
| 间距与布局 | 左栏 236px、详情 402px；窄窗左栏 208px、详情覆盖。与交互规范约 208px/360–400px 的范围一致。主操作范围固定，项目第二栏和回望双栏已恢复。 |
| 色彩与状态 | 只用黑白和中性灰；待确认、已确认、新增草稿都有文字。选择墨线不表示完成。焦点为清楚的轮廓。 |
| 图片与素材 | 墨圈、墨块、竖线和芦苇山水全部来自真实生成 PNG；用 Phosphor 图标。未用 SVG、CSS 绘画或字符拼水墨素材。图片加载无错误，透明边缘可读。 |
| 文案与内容 | 今日关键内容对应源图；日历和项目的数据统一来自样例模型，源图里额外的“排除”和早期事件未凭空补造。回望按规范对缺少结构化对比的数据使用有来源的时间记录，未编造“此前/现在”。这些内容差异属于明确的功能约束。 |

右下方装饰性远山和全栏纸张纹理没有铺进阅读正文，以维持文字区域清晰。保留用户特别选择的白色左栏、墨圈、芦苇、选中墨线和墨块按钮。图像主题与字级为同一方向，并非逐像素复制。

## 操作验收

`qa/interaction-results.json`：29 项应用内操作检查通过；`qa/console-errors.json` 为空。覆盖补记、草稿编辑、依据展开、未保存导航保护、保存失败保留输入、窗口关闭保护、确认及撤销、确认后新增、空白日、项目补记、新建项目、周期切换、移除及恢复、重新打开保存状态和三个窗口尺寸。

`tests/records.test.mjs`：5 个状态及日期边界测试通过。TypeScript 检查和 Vite 桌面构建通过。

正式采集、模型调用、JSON/SQLite、备份、长期大数据量性能与完整辅助技术验收不属于本轮范围。便携打包的加载检查独立记录于 `qa/portable-smoke.json`。

## 实施检查单

- [x] 四个一级页面、共享详情和编辑面板
- [x] 补记、编辑、已确认后新增、无记录日
- [x] 保留输入、确认范围、撤销和软移除
- [x] 水墨素材与离线字体
- [x] 1440/1280/1024px 控件可达
- [x] 原生渲染证据、并排比较和控制台检查

## 后续细化

P3：品牌墨圈和芦苇可以在用户实际屏幕上进一步校准大小；原生窗口图标暂沿用墨圈素材；正式数据接入后再验证超长项目名、长时间线和辅助阅读器。

final result: passed
