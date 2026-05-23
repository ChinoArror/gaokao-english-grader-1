# 高考英语作文批改系统

[English README](./README.md)

这是一个基于 Cloudflare 的高考英语作文批改 Web App，支持应用文与读后续写两类题型，支持文本输入与图片上传，支持 OCR 识别、AI 结构化批改、任务队列后台处理、历史记录查看、JSON 导出与 A4 打印。

当前系统已经升级为“任务队列化”架构：浏览器提交任务后，Cloudflare Queue 在后台继续处理，D1 保存任务状态与结果，即使用户刷新页面或临时离开，也不会中断批改流程。

## 系统能力

- 支持两类作文题型：
  - 应用文
  - 读后续写
- 支持两种输入方式：
  - 文本输入
  - 图片上传
- Gemini 调用全部在后端执行：
  - 前端不会直接请求 Gemini
  - 实际模型调用发生在 Cloudflare Worker
- 输出为结构化批改报告：
  - 总评与分数
  - 逐句批改
  - 错误分析
  - 出彩表达
  - 作文润色
  - 题型专属分析模块
- 每次批改都会生成唯一 `task_uuid`
- 支持任务状态追踪：
  - `Queued`
  - `Processing`
  - `Successful`
  - `Failed`
- 支持历史记录：
  - AI 生成的文章大意短标题
  - `task_uuid`
  - 题型标签
  - 时间
  - 删除操作
- 支持结果操作：
  - 下载 JSON
  - 复制 JSON
  - 打印 A4 PDF

## 项目结构

### 前端

- React + TypeScript + Vite
- 主批改页面：
  - [components/EssayGraderV2.tsx](/D:/Code/gaokao-english-grader/components/EssayGraderV2.tsx)
- 历史记录页面：
  - [components/HistoryPageV3.tsx](/D:/Code/gaokao-english-grader/components/HistoryPageV3.tsx)
- 结构化报告渲染：
  - [components/report/ReportRenderer.tsx](/D:/Code/gaokao-english-grader/components/report/ReportRenderer.tsx)
- 前端 API 封装：
  - [services/api.ts](/D:/Code/gaokao-english-grader/services/api.ts)
- 图片压缩与提交：
  - [services/geminiService.ts](/D:/Code/gaokao-english-grader/services/geminiService.ts)
- 打印模板：
  - [services/reportPrintV3.ts](/D:/Code/gaokao-english-grader/services/reportPrintV3.ts)

### 后端

- Cloudflare Worker 主入口：
  - [worker/app.ts](/D:/Code/gaokao-english-grader/worker/app.ts)
- 旧版 Worker 路由仍保留用于其他 API：
  - [worker/index.ts](/D:/Code/gaokao-english-grader/worker/index.ts)
- 结构化批改提示词：
  - [promptsV2.ts](/D:/Code/gaokao-english-grader/promptsV2.ts)

### 存储

- D1：
  - `history`
  - `grading_tasks`
  - `task_user_locks`
  - `usage_logs`
  - `sessions`
- R2：
  - 暂存进入队列前的任务原始 payload
- Queue：
  - `gaokao-english-grader-tasks`

## 批改流程

### 文本提交流程

1. 用户输入题目和作文正文。
2. 前端调用 `POST /api/grade`。
3. Worker 创建唯一 `task_uuid`。
4. Worker 把任务原始数据写入 R2。
5. Worker 在 `grading_tasks` 中写入一条 `queued` 记录。
6. Worker 向 Cloudflare Queue 投递轻量消息。
7. 前端展示任务状态并开始轮询。
8. Queue 消费者在后台继续处理任务。
9. 结果写入 D1，History 页面即可查看。

### 图片提交流程

1. 前端先压缩图片，减少上传体积。
2. 图片通过 `multipart/form-data` 提交到 `POST /api/grade`。
3. Worker 将任务写入 R2 并进入 Queue。
4. Queue 消费者先执行 OCR。
5. OCR 结果作为作文正文进入批改流程。
6. Queue 消费者调用结构化批改 prompt 与总结标题 prompt。
7. 最终把 OCR 文本、结构化报告、任务信息写入 D1。

## 为什么要接入 Queue

引入 Queue 主要是为了解决这些线上问题：

- 图片任务较大，不能依赖前端页面一直保持打开
- 页面刷新后任务不能丢
- 同一用户的多个任务要按顺序处理
- 模型调用必须放在后端，避免前端所在地区无法直接访问 Gemini 时失败

当前系统通过 `task_user_locks` 保证同一用户任务串行处理。

## 数据表说明

### `history`

用于保存成功任务的历史记录，兼容旧历史查看逻辑。

主要字段：

- `id`
- `user_id`
- `timestamp`
- `topic`
- `original_content`
- `feedback`
- `task_uuid`

### `grading_tasks`

这是当前任务系统的主表。

主要字段：

- `task_uuid`
- `user_id`
- `status`
- `essay_type`
- `input_method`
- `summary_title`
- `topic`
- `original_content`
- `transcription`
- `report_json`
- `error_message`
- `payload_r2_key`
- `history_id`
- `created_at`
- `updated_at`

### `task_user_locks`

用于保证同一用户任务按顺序消费。

## 结构化输出

模型不再输出自由文本 Markdown，而是按严格 JSON 结构返回批改结果。

当前支持两类报告结构：

- `PracticalWritingReport`
- `ContinuationWritingReport`

接口定义位于：

- [types.ts](/D:/Code/gaokao-english-grader/types.ts)

当前约束：

- 历史记录中的标题只是列表摘要
- 这个标题不会作为正式报告标题使用
- 打印页使用题型对应的通用标题
- 复制和下载的结果以 JSON 为准，不再以 Markdown 为主

## OCR 与识别策略

当前 OCR 链路做了多层防护：

- 前端先压缩图片再上传
- OCR 使用更高的输出 token 上限
- OCR 被截断时，后端会自动续写补全
- 多张图片按页分别识别，再合并结果

这样做是因为读后续写图片内容较长时，模型容易只返回前半部分识别结果。

## 报告展示与打印

### 网页中的批改报告

网页报告已经按不同设备做了适配：

- 卡片布局可在手机和桌面端自适应
- 表格支持窄屏滚动
- `~~错误~~` 与 `**改正**` 会以 diff 风格显示
- 应用文和读后续写分别渲染不同专属模块

### PDF 打印

打印页针对 A4 做了单独模板：

- 不显示 Markdown 或 JSON 语法符号
- 不显示班级、学号、姓名
- 行距与字号相对收紧，更接近纸质批改样式
- 正文和表格与网页端分开控制

## 下载文件命名规则

下载的 JSON 文件名格式如下：

`username-文章类型-task_uuid前8位-YYYY-MM-DD.json`

示例：

`alice-续写-a1b2c3d4-2026-03-29.json`

## History 页面说明

History 左侧列表显示：

- AI 总结的文章大意
- 状态标签
- 题型标签
- UUID 短标签
- 时间
- 轻量列表数据，打开 History 时不会先加载完整原文和报告

History 右侧详情显示：

- 按题型生成的正式报告标题
- 原文识别结果
- AI 批改详情
- JSON 下载
- JSON 复制
- PDF 打印
- 详情加载中时会在详情区域显示转圈进度条

删除按钮使用红色垃圾桶图标。

宽屏下，History 保持左右两栏布局：左侧为历史条目，右侧为详情。

窄屏或手机页面下，History 使用独立详情路径：

- `/history` 只显示历史条目列表。
- `/history/:task_uuid` 显示对应记录详情。
- 顶部标题区和 `Back to Grader` 固定在列表上方。
- 列表页只有下方条目区域滚动。
- 详情页左上角有 `Back to History`，详情内容可上下滚动查看。

## API 概览

### 批改相关

- `POST /api/grade`
  - 创建任务并放入队列
- `GET /api/tasks/:task_uuid`
  - 获取单个任务状态或结果
- `GET /api/tasks/latest-active`
  - 页面刷新后恢复最近一个未完成任务

### 历史相关

- `GET /api/history`
  - 返回轻量任务列表，不携带完整原文和报告大字段
- `GET /api/tasks/:task_uuid`
  - 返回单个任务详情，包括 OCR 文本和结构化报告 JSON
- `DELETE /api/history/:task_uuid`
  - 删除某个任务/历史记录

### 认证与管理

其他认证、管理、音频相关接口仍由 Worker 提供，但作文批改主流程现在统一走 [worker/app.ts](/D:/Code/gaokao-english-grader/worker/app.ts) 中的队列化链路。

## 环境准备

### 必备条件

- Node.js 18+
- npm
- Cloudflare 账号
- Wrangler CLI
- D1 数据库
- R2 Bucket
- Cloudflare Queue
- 可用的 Gemini API 权限
- 若沿用现有登录体系，还需要 Aryuki Auth Center 配置

### 安装依赖

```bash
npm install
```

### 初始化数据库

全新环境：

```bash
npx wrangler d1 execute gaokao-en-grader-db --remote --file=schema.sql
```

已有环境升级到任务队列版本：

```bash
npx wrangler d1 execute gaokao-en-grader-db --remote --file=migrate-grading-tasks.sql
```

### 创建 Queue

```bash
npx wrangler queues create gaokao-english-grader-tasks
```

### 配置 Secret

至少需要设置：

```bash
npx wrangler secret put API_KEY
```

同时请确认 [wrangler.toml](/D:/Code/gaokao-english-grader/wrangler.toml) 中以下绑定或变量存在并正确：

- D1 绑定：`DB`
- R2 绑定：`R2`
- Queue 绑定：`GRADING_QUEUE`
- 静态资源绑定：`ASSETS`
- `API_DOMAIN`
- `MODEL_NAME`
- `LISTEN_MODEL_NAME`
- `SSO_URL`
- `SSO_APP_ID`
- `SSO_SECRET_KEY`
- `ADMIN_USER_ID`

## 本地开发与部署

### 本地开发

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

### 部署到 Cloudflare

```bash
npx wrangler deploy
```

## 使用指南

### 普通用户操作流程

1. 通过现有 SSO 流程登录。
2. 进入批改页面。
3. 选择题型：
   - 应用文
   - 读后续写
4. 选择输入方式：
   - 文本
   - 图片
5. 提交任务。
6. 查看任务状态：
   - `Queued`
   - `Processing`
   - `Successful`
   - `Failed`
7. 随时进入 History 查看完成结果。
8. 使用：
   - `Copy JSON`
   - `Download JSON`
   - `PDF`

### 图片批改建议

- 图片尽量清晰、裁剪完整
- 多页作文可分多张上传
- 如果识别仍不完整，优先减少单次上传页数或提高图片清晰度

### 运维排查建议

- 如果任务长期停留在 `Queued`：
  - 检查 Queue consumer 是否正常绑定
  - 检查 Worker 是否已正确部署
- 如果任务经常失败：
  - 查看 Worker 日志
  - 查看 `grading_tasks.error_message`
- 如果识别结果异常：
  - 查看 `grading_tasks.transcription`
  - 检查 OCR prompt 与图片质量

## 常见问题

### 任务一直停在 `Queued`

可能原因：

- Queue consumer 没有配置好
- 当前部署没有包含 Queue consumer
- `wrangler.toml` 中队列绑定名不一致

建议检查：

- [wrangler.toml](/D:/Code/gaokao-english-grader/wrangler.toml)
- Cloudflare Queue 控制台
- 最新一次 Worker 部署状态

### 图片 OCR 不完整

可能原因：

- 图片不清晰
- OCR 输出被截断
- 单页内容过长

当前已做的修复：

- 前端压缩
- 按页 OCR
- OCR 截断后自动续写

### 浏览器报网络错误

可能原因：

- 图片体积仍然过大
- 上传网络不稳定

当前已做的缓解：

- 上传前压缩
- 后端队列化处理

### 历史标题过短、不像文章概括

历史标题是专门给列表使用的 AI 摘要。现在 prompt 已要求标题尽量包含：

- 人物或场景
- 核心事件
- 主题或特点

如果后续还要进一步调优，可以修改：

- [promptsV2.ts](/D:/Code/gaokao-english-grader/promptsV2.ts)

## 关键文件

- [App.tsx](/D:/Code/gaokao-english-grader/App.tsx)
- [types.ts](/D:/Code/gaokao-english-grader/types.ts)
- [promptsV2.ts](/D:/Code/gaokao-english-grader/promptsV2.ts)
- [utils/reportUtils.ts](/D:/Code/gaokao-english-grader/utils/reportUtils.ts)
- [services/api.ts](/D:/Code/gaokao-english-grader/services/api.ts)
- [services/geminiService.ts](/D:/Code/gaokao-english-grader/services/geminiService.ts)
- [services/reportPrintV3.ts](/D:/Code/gaokao-english-grader/services/reportPrintV3.ts)
- [components/EssayGraderV2.tsx](/D:/Code/gaokao-english-grader/components/EssayGraderV2.tsx)
- [components/HistoryPageV3.tsx](/D:/Code/gaokao-english-grader/components/HistoryPageV3.tsx)
- [components/report/ReportRenderer.tsx](/D:/Code/gaokao-english-grader/components/report/ReportRenderer.tsx)
- [worker/app.ts](/D:/Code/gaokao-english-grader/worker/app.ts)
- [worker/index.ts](/D:/Code/gaokao-english-grader/worker/index.ts)
- [schema.sql](/D:/Code/gaokao-english-grader/schema.sql)
- [migrate-grading-tasks.sql](/D:/Code/gaokao-english-grader/migrate-grading-tasks.sql)
- [wrangler.toml](/D:/Code/gaokao-english-grader/wrangler.toml)

## Experience

### Gemini 必须由后端调用

只要浏览器能访问你自己的 Worker，哪怕用户本地网络不能直连 Gemini，批改任务仍可以在 Cloudflare 后台完成。

### 队列化比同步请求更稳定

随着 OCR、结构化输出、打印模板等链路变长，同步请求已经不够稳。使用 Queue 后，刷新页面不会中断批改任务。

### OCR 需要处理截断问题

长篇读后续写的图片内容容易超出单次 OCR 输出上限。增加 token 上限并在截断后自动续写，明显改善了识别完整度。

### 历史标题不能混入正式报告

历史列表标题适合浏览记录，但不应替代正式报告标题，也不应出现在范文中。

### 结构化报告更适合用 JSON 导出

当模型返回的是严格 JSON 时，直接复制和下载 JSON，稳定性和可追溯性都比继续使用 Markdown 更高。
