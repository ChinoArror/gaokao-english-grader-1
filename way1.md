# SubApp 用量控制接入指南 (Quota & Rate Limiting)

本指南针对已接入 Auth-Center 的 SubApp，说明如何增加使用大模型 API 等计费或限制频率服务时的前置配额检查（Pre-check）和后置扣费（Post-deduction）。

## 1. 核心原理
1. 在向大模型（如 OpenAI、Anthropic）发起请求前，向 Auth-Center 校验当前用户是否有权发送请求，以及是否超过了设定的频率或 Token 消耗。
2. 在大模型返回数据后，统计真实消耗的 Token 并在 Auth-Center 扣除。
3. 身份验证使用 SubApp 在 Auth-Center 注册的 `app_id` 和专属 `secret_key`，确保安全性。

## 2. 从 Auth-Center 获取配置

在 Auth-Center 的管理面板，点击 **Applications** 标签页。找到或注册你要接入的子应用，记录下两项信息：
* `app_id`: 例如 `my_agent_app`
* `secret_key`: 在注册该应用时填写的密钥

你需要将这两项保存在你的 SubApp 环境变量中（如 Cloudflare Workers 的 `.dev.vars` / `wrangler.toml`）。

## 3. 请求 Auth-Center 接口的代码规范

在你的 SubApp 代码 (如 Worker 或 Node.js 后端) 中，你需要处理如下逻辑：

### A. 前置检查 (Pre-check)

在收到前端对话请求，并解析出用户 `uuid` 后：

```javascript
// Auth-Center 的基础域名
const AUTH_CENTER_URL = "https://your-auth-center-domain.com";

async function checkQuota(uuid) {
  const url = `${AUTH_CENTER_URL}/api/quota/check?uuid=${uuid}&app_id=${env.APP_ID}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${env.SECRET_KEY}`
    }
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("用量超限，请稍后再试或联系管理员增加额度");
    } else if (response.status === 403) {
      throw new Error("当前用户未获得该应用的访问权限");
    }
    throw new Error("权限校验失败：" + response.statusText);
  }
  
  // 校验通过，可以继续请求大模型
  return true;
}
```

### B. 后置扣费 (Post-deduction)

在 LLM 返回了数据后，我们可以拿到 `usage` 比如 `prompt_tokens` 和 `completion_tokens`，接着发送给 Auth-Center 消费。

```javascript
async function consumeQuota(uuid, totalTokens) {
  const url = `${AUTH_CENTER_URL}/api/quota/consume`;
  
  // 可以选择使用 waitUntil 等机制异步发送，不阻塞主流程响应
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.SECRET_KEY}`
    },
    body: JSON.stringify({
      uuid: uuid,
      app_id: env.APP_ID,
      tokens: totalTokens // 消耗的 token 数
    })
  });

  if (!response.ok) {
    console.error("上报消耗失败", await response.text());
  }
}
```

## 4. SubApp 综合示例

```javascript
export default {
  async fetch(request, env, ctx) {
    // 1. 获取并校验用户的 JWT
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    // ...验证 token 逻辑，获取 user uuid
    const userUuid = "xxxx-xxxx-xxxx-xxx"; 

    // 2. 拦截并进行 Quota 检查
    try {
      await checkQuota(userUuid);
    } catch (e) {
      return new Response(e.message, { status: 429 });
    }

    // 3. 执行大模型请求
    const llmResponse = await fetch("https://api.openai.com/v1/chat/completions", {
       // ... openai 请求细节
    });
    
    // 获取 LLM 计算结果（非流式示例）
    const llmData = await llmResponse.json();
    const usedTokens = llmData.usage?.total_tokens || 0;

    // 4. 异步上报消耗 
    // 若环境支持 ctx.waitUntil，能避免堵塞前端响应
    ctx.waitUntil(consumeQuota(userUuid, usedTokens));

    return Response.json(llmData.choices[0].message);
  }
}
```

## 5. 常见问题
* **权限不足 (403):** 确保在 Auth-Center 的 `Permissions` 页面为该用户勾选了对应应用。
* **密码不匹配 (401):** 检查 `env.SECRET_KEY` 是否和在 Auth-Center `Apps` 里配置的完全一致。
* **重置时间:** 默认 Auth-Center 是对每日用量 (`used_tokens_today` 和 `used_requests_today`) 按 UTC/服务器本地时间跨天重置。
