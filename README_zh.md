# 高考英语作文批改系统 - AI Essay Grading System

[English README](./README.md)

这是一个面向高考英语场景的 AI 作文批改系统，支持用户管理、批改历史、使用统计、图片转写与作文批改等能力。

## 功能特性

### 认证与用户管理
- **多用户支持**：区分管理员和普通用户角色，并提供安全认证。
- **管理员面板**：
  - 管理用户，包括创建、更新和删除账号。
  - **用户暂停**：可立即暂停或恢复用户访问，并强制已暂停用户退出登录。
  - **使用统计**：通过日视图和月视图交互图表查看系统使用情况。
- **会话管理**：基于令牌的安全认证，并支持自动持久化登录状态。
- **密码保护**：用户密码使用 SHA-256 进行哈希存储。

### 作文批改
- **双输入方式**：
  - 手动输入题目与作文正文。
  - 上传图片，支持手写作文 OCR/转写。
- **AI 批改**：由 Google Gemini 3.0 Pro Preview 提供能力支持。
- **支持题型**：
  - 应用文，15 分制。
  - 读后续写，25 分制。
- **转写功能**：自动提取上传图片中的文本，并通过悬浮查看器展示。

### 历史记录
- **批改历史**：完整保存所有作文批改记录与时间戳。
- **记录管理**：支持查看、导出、删除和复制历史记录。
- **导出方式**：
  - 下载为 Markdown（`.md`）。
  - 打印友好格式。
  - 直接复制 Markdown 文本。
- **按用户隔离**：普通用户只能看到自己的记录，管理员可以查看全部记录。

### 用户体验
- **单页应用路由**：前端路由切换快速流畅。
- **响应式设计**：适配移动端与桌面端。
- **现代化界面**：采用玻璃拟态风格，带平滑动画与过渡效果。
- **实时反馈**：提供加载状态与清晰的错误提示。
- **悬浮转写查看器**：无需打断主流程即可查看 OCR 结果。

## 技术栈

### 前端
- **React 19** + TypeScript
- **React Router DOM** 用于前端路由
- **Recharts** 用于数据可视化
- **Tailwind CSS** 用于样式
- **Marked.js** 用于 Markdown 渲染
- **Vite** 用于构建

### 后端
- **Cloudflare Workers** 提供无服务器计算能力
- **D1 Database** 提供持久化存储
- **Google Gemini 3.0** 提供 AI 批改能力

## 安装

1. 克隆仓库：
```bash
git clone <repository-url>
cd gaokao-english-grader
```

2. 安装依赖：
```bash
npm install
```

3. 初始化数据库：
```bash
npx wrangler d1 execute gaokao-en-grader-db --remote --file=schema.sql
```

4. 在 `wrangler.toml` 或 Cloudflare Dashboard 中配置环境变量：
- `API_KEY`：Google Gemini API Key，使用 secret 保存。
- `API_DOMAIN`：Gemini API 域名，默认 `generativelanguage.googleapis.com`。
- `MODEL_NAME`：作文批改模型，默认 `gemini-3-pro-preview`。
- `LISTEN_MODEL_NAME`：听力任务模型。
- `SSO_URL`：统一认证中心地址。
- `SSO_APP_ID`：在 SSO 系统中的应用标识。
- `SSO_SECRET_KEY`：后端进行配额与 SSO 调用时使用的密钥。
- `ADMIN_USER_ID`：认证中心中的管理员用户 ID。

5. 设置 API Key Secret：
```bash
npx wrangler secret put API_KEY
# 按提示输入你的 Gemini API Key
```

## 部署

1. 构建前端：
```bash
npm run build
```

2. 部署到 Cloudflare Workers：
```bash
npx wrangler deploy
```

3. 访问地址：**https://eng.aryuki.com**

## 使用方式

### 管理员

1. **登录**：使用管理员凭证登录。
2. **总览面板**：
   - 查看请求数量与 token 用量的日/月统计图表。
3. **用户管理**：
   - 查看所有注册用户及其状态。
   - 新增用户。
   - 暂停或恢复用户，并清理该用户的活动会话。
   - 编辑凭证或删除账号。
4. **进入批改器**：从管理员面板进入作文批改页。
5. **查看全部历史**：查看所有用户的批改记录。

### 普通用户

1. **登录**：通过认证中心流程完成登录。
2. **批改作文**：
   - 选择题型：应用文或读后续写。
   - 选择输入方式：文本或图片。
   - 输入或上传作文内容。
   - 点击 **Start AI Grading**。
3. **查看结果**：
   - 查看 AI 评分与点评。
   - 图片模式可通过悬浮按钮查看转写内容。
   - 支持下载、打印或复制 Markdown 结果。
4. **查看历史**：
   - 点击顶部 **History** 按钮。
   - 查看历史批改记录。
   - 支持导出、复制、打印或删除单条记录。

## 数据库结构

### Users 表
- `id`：主键。
- `username`：唯一用户名。
- `password`：SHA-256 哈希后的密码。
- `status`：`active` 或 `suspended`。
- `created_at`：Unix 时间戳。

### Usage Logs 表
- `id`：主键。
- `user_id`：指向用户表的外键。
- `timestamp`：Unix 时间戳。
- `action_type`：`grade_success` 或 `grade_error`。
- `tokens`：token 使用量。
- `error_details`：错误详情。

### History 表
- `id`：主键。
- `user_id`：指向用户表的外键。
- `timestamp`：Unix 时间戳。
- `topic`：作文题目或主题。
- `original_content`：原始文本或 OCR/转写文本。
- `feedback`：AI 生成的 Markdown 批改结果。

### Sessions 表
- `token`：主键，UUID。
- `user_id`：指向用户表的外键，管理员时可为空。
- `role`：`admin` 或 `user`。
- `created_at`：Unix 时间戳。
- `expires_at`：Unix 时间戳，通常为创建后 7 天。

## 设计理念

整个应用保持统一的设计语言：
- **配色**：主要操作使用靛蓝和蓝色渐变。
- **玻璃拟态**：卡片采用背景模糊与半透明效果。
- **平滑动画**：包含 hover 效果和轻微位移动画。
- **响应式布局**：采用移动端优先设计。
- **可访问性**：使用清晰标签并兼顾键盘操作。

## 安全特性

1. **密码哈希**：用户密码以 SHA-256 哈希形式保存。
2. **会话令牌**：使用安全的令牌式会话认证。
3. **API Key 保护**：Gemini API Key 保存在 Cloudflare secret 中。
4. **CORS 保护**：已配置安全的跨域策略。
5. **输入校验**：同时进行前端和后端校验。

## API 接口

### 认证
- `POST /api/sso-callback`：接收认证中心回调的 JWT 并写入本地用户信息。
- `GET /api/auth/verify`：校验当前会话令牌。
- `POST /api/auth/logout`：退出登录并清理 SSO 状态。

### 管理员
- `GET /api/admin/users`：获取用户列表。
- `GET /api/admin/stats`：获取使用统计。

### 历史记录
- `GET /api/history`：获取批改历史。
- `DELETE /api/history/:id`：删除历史记录。

### 作文批改
- `POST /api/grade`：提交作文进行批改，保存历史并记录用量。

### 音频
- `POST /api/audio/upload`：上传音频到 R2。
- `POST /api/audio/segment`：对上传音频生成听力片段。
- `GET /api/audio/files`：列出已上传音频。
- `GET /api/audio/proxy/:key`：从 R2 代理音频文件。
- `DELETE /api/audio/files/:id`：删除音频文件。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `API_KEY` | Google Gemini API Key | 必填，使用 secret 保存 |
| `API_DOMAIN` | Gemini API 域名 | `generativelanguage.googleapis.com` |
| `MODEL_NAME` | 作文批改模型 | `gemini-3-pro-preview` |
| `LISTEN_MODEL_NAME` | 听力模型 | `gemini-3-flash-preview` |
| `SSO_URL` | 认证中心地址 | `https://accounts.aryuki.com` |
| `SSO_APP_ID` | 认证中心应用 ID | `gaokao-english-grader` |
| `SSO_SECRET_KEY` | 后端 SSO/配额调用密钥 | 在 `wrangler.toml` 中配置 |
| `ADMIN_USER_ID` | 认证中心管理员用户 ID | `0` |

## 重要说明

1. **修改敏感默认值**：正式环境中请检查并替换任何默认或开发阶段的配置。
2. **数据库**：首次使用前必须初始化 D1 数据库。
3. **API Key**：请确认 Gemini API Key 有权访问所配置模型。
4. **浏览器兼容性**：适用于支持 ES6+ 的现代浏览器。

## 贡献

欢迎贡献代码。请确保：
- 代码遵循现有风格规范。
- 新功能附带适当文档。
- 前端改动保持响应式表现。
- 后端改动包含合理的错误处理。

## 许可证

本项目为专有软件，保留所有权利。

## 支持

如遇到问题或需要帮助：
1. 检查数据库结构是否已正确初始化。
2. 检查 API Key 与 SSO 配置是否正确。
3. 查看浏览器控制台中的前端错误。
4. 查看 Cloudflare Workers 日志中的后端错误。

## Experience

以下是近期修复和线上排障中总结出的经验：

- **Gemini 调用始终由后端执行**：浏览器只会把批改请求发送到本应用的 Worker，真正的 Gemini `generateContent` 调用发生在 [worker/index.ts](./worker/index.ts) 中。这有助于在终端用户本地网络无法直接访问 Gemini，但 Cloudflare Workers 侧仍可访问时继续正常工作。
- **大图片可能在批改开始前就让请求失败**：图片模式下，如果把手机原图直接转成 Base64 发送，会形成非常大的 JSON 请求体，浏览器侧往往只看到 `Failed to fetch` 或 `ERR_CONNECTION_CLOSED`，而不是规范的 API 错误。
- **前端图片压缩非常重要**：现在图片批改请求会在前端先进行缩放和压缩，再发送到 Worker，从而减少请求体积并提高稳定性。
- **图片批改结果容易被截断**：图片模式要求模型同时输出完整转写和完整批改内容，容易触发模型输出长度上限，导致结果看起来“不完整”。
- **Worker 现在会更稳妥地处理截断**：后端会检查 Gemini 返回是否被截断，必要时自动请求继续生成，并在最终结果仍可能不完整时给出明确信号。
- **历史记录保存的是处理后的 Markdown**：保存到 `history.feedback` 中的是去掉转写标记后的 Markdown 批改结果，`history.original_content` 则保存原始作文文本或 OCR/转写文本。
- **Markdown 复制现在是一等导出能力**：评分结果和历史详情都可以直接以 Markdown 形式复制，不依赖复制渲染后的 HTML。

---

**Powered by Google Cloud & Gemini 3.0**
