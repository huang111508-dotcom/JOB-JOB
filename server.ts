import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const PORT = 3000;

interface ExistingTask {
  id: string;
  title: string;
  priority: "高" | "中" | "低";
  deadline: string;
  status: "未开始" | "进行中" | "已完成";
  completed_at: string | null;
}

// Helper to calculate MMD prefix and next sequence
function getDayPrefix(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1; // 1-12
  const day = d.getDate(); // 1-31
  return `${month}${day}`;
}

function getNextSequence(prefix: string, existingTasks: ExistingTask[], offset: number = 0): string {
  let maxSeq = 0;
  for (const t of existingTasks) {
    if (t.id && t.id.startsWith(prefix)) {
      const rest = t.id.slice(prefix.length);
      const num = parseInt(rest, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  return `${prefix}${maxSeq + 1 + offset}`;
}

// Fallback rule-based parser if Gemini API key is missing or fails
function fallbackRuleParser(
  input: string,
  baseDate: string,
  existingTasks: ExistingTask[]
): { action: "CREATE" | "UPDATE_STATUS" | "QUERY"; tasks: ExistingTask[] } {
  const text = input.trim();
  const dayPrefix = getDayPrefix(baseDate);

  // Check query intent
  if (
    /^(查看|查询|搜索|列出|有哪些|汇报|进度)/.test(text) ||
    /^(list|show|search|query)/i.test(text)
  ) {
    return {
      action: "QUERY",
      tasks: [],
    };
  }

  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const tasks: ExistingTask[] = [];
  let isUpdateAction = false;
  let newCreatedCount = 0;

  for (const line of lines) {
    // Check if line starts with an ID update: e.g. "9186 已完成", "9184 大客户送礼 进行中", "9221 完成"
    const idStatusMatch = line.match(/^(\d{3,6})\s*(.*)$/);
    if (idStatusMatch) {
      const targetId = idStatusMatch[1];
      const remainder = idStatusMatch[2].trim();
      isUpdateAction = true;

      let newStatus: "未开始" | "进行中" | "已完成" = "进行中";
      let completedAt: string | null = null;

      if (/已完成|完成|做完|搞定|核销|已做/.test(remainder)) {
        newStatus = "已完成";
        completedAt = baseDate;
      } else if (/进行中|在做|跟进中|处理中/.test(remainder)) {
        newStatus = "进行中";
      } else if (/未开始|待办|未做/.test(remainder)) {
        newStatus = "未开始";
      }

      // Find existing task
      const existing = existingTasks.find((t) => t.id === targetId);
      const cleanTitle =
        remainder
          .replace(/已完成|完成|做完|搞定|核销|进行中|在做|跟进中|未开始|待办/g, "")
          .trim() || (existing ? existing.title : `任务 ${targetId}`);

      tasks.push({
        id: targetId,
        title: existing ? existing.title : cleanTitle,
        priority: existing ? existing.priority : "中",
        deadline: existing ? existing.deadline : "当天",
        status: newStatus,
        completed_at: completedAt,
      });
      continue;
    }

    // New task creation
    let priority: "高" | "中" | "低" = "中";
    if (/高优先级|紧急|重要|特急|优先/.test(line)) {
      priority = "高";
    } else if (/低优先级|延后|次要/.test(line)) {
      priority = "低";
    }

    let deadline = "当天";
    const dateMatch = line.match(/(截止|截至|限期|到期)?\s*(\d{1,2}\.\d{1,2}|\d{4}-\d{2}-\d{2}|明天|后天|当天|本周)/);
    if (dateMatch) {
      const rawDate = dateMatch[2];
      if (rawDate === "明天") {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + 1);
        deadline = d.toISOString().split("T")[0];
      } else if (rawDate === "后天") {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + 2);
        deadline = d.toISOString().split("T")[0];
      } else if (rawDate.includes(".")) {
        const [m, day] = rawDate.split(".");
        const year = baseDate.split("-")[0] || "2026";
        deadline = `${year}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
      } else {
        deadline = rawDate;
      }
    }

    let status: "未开始" | "进行中" | "已完成" = "未开始";
    let completedAt: string | null = null;
    if (/已完成|完成|做完/.test(line)) {
      status = "已完成";
      completedAt = baseDate;
    } else if (/进行中|在做/.test(line)) {
      status = "进行中";
    }

    // Clean title
    let title = line
      .replace(/(截止|截至|限期|到期)?\s*(\d{1,2}\.\d{1,2}|\d{4}-\d{2}-\d{2}|明天|后天|当天|本周)/g, "")
      .replace(/高优先级|低优先级|中优先级|紧急|优先|特急|重要/g, "")
      .replace(/已完成|进行中|未开始/g, "")
      .replace(/[,，;；\s]+$/, "")
      .replace(/^[,，;；\s]+/, "")
      .trim();

    if (!title) {
      title = line;
    }

    const newId = getNextSequence(dayPrefix, existingTasks, newCreatedCount);
    newCreatedCount++;

    tasks.push({
      id: newId,
      title,
      priority,
      deadline,
      status,
      completed_at: completedAt,
    });
  }

  return {
    action: isUpdateAction ? "UPDATE_STATUS" : "CREATE",
    tasks,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      hasApiKey: !!process.env.GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  });

  // Task Natural Language Parser Endpoint
  app.post("/api/parse-tasks", async (req, res) => {
    try {
      const { userInput, currentDate, existingTasks = [] } = req.body;

      if (!userInput || typeof userInput !== "string" || !userInput.trim()) {
        res.status(400).json({ error: "用户输入内容不能为空" });
        return;
      }

      const today = currentDate || "2026-09-22";
      const apiKey = process.env.GEMINI_API_KEY;

      // If no Gemini API key, use the deterministic fallback rule parser
      if (!apiKey) {
        console.warn("[Server] No GEMINI_API_KEY provided. Using built-in rule parser.");
        const fallbackResult = fallbackRuleParser(userInput, today, existingTasks);
        res.json(fallbackResult);
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const dayPrefix = getDayPrefix(today);
      const nextSuggestedId = getNextSequence(dayPrefix, existingTasks, 0);

      const systemInstruction = `# Role
你是一个智能工作任务追踪与管理助理。你的核心任务是将用户输入的自然语言（包括新增任务、批量修改状态、完成核销等）解析为标准、严格的 JSON 格式输出，供业务系统存入云端数据库（Firebase Firestore）。

# Current Context
- 当前基准日期：${today}。
- 任务编号规则：MMD + 当日自增序列号。例如：9月22日创建的任务前缀为 ${dayPrefix}，第1个为 ${dayPrefix}1，第2个为 ${dayPrefix}2，第10个为 ${dayPrefix}10。
- 若是新增任务，请根据当前系统中今天已有的最大编号顺延自增。根据系统最新状态，今天的下一个建议编号是：${nextSuggestedId}。如果有多个新增任务，依此类推递增。
- 当前系统已有任务列表（用于核销比对或获取最大序列号）：
${JSON.stringify(existingTasks, null, 2)}

# Input Types & Behaviors
用户输入主要有两种形式：
1. 新增/更新单个或多个任务描述（例如：“10月排班，截止9.25”、“仓管当日入库追踪，高优先级”）。
2. 状态更新/核销指令（例如：“9186 已完成”、“9184 大客户送礼 进行中”或批量粘贴带状态的清单）。

# Parsing Rules
1. 任务字段提取：
   - id (string): 任务编号。若是更新/核销旧任务，直接沿用原编号；若是新增任务，按照“MMD + 序号”生成（请根据上下文最大的序号递增，无历史序号则从 1 开始）。
   - title (string): 任务具体内容，去除日期、优先级等修饰词后的核心描述。
   - priority (string): 优先级。仅限 "高", "中", "低"。若用户未显式说明，默认值一律为 "中"。
   - deadline (string): 截止日期。格式化为标准格式（如 "YYYY-MM-DD"）或规范缩写（如 "当天"、"9.25"）。若用户未显式说明，默认值一律为 "当天"。
   - status (string): 任务状态。仅限 "未开始", "进行中", "已完成"。新增任务默认为 "未开始"；若用户指定为进行中或已完成，则如实记录。
   - completed_at (string | null): 若状态为“已完成”，记录完成日期（如 "${today}"）；否则为 null。
2. 意图判断 (action)：
   - "CREATE": 新建任务
   - "UPDATE_STATUS": 更新状态/核销现有任务
   - "QUERY": 用户仅做查询

# Output Format
严格仅输出纯 JSON 格式数据，不得包含任何 Markdown 代码块标签（如 \`\`\`json），不得包含任何额外的前缀、后缀解释文字。`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `用户输入指令：\n${userInput}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: {
                type: Type.STRING,
                description: '意图判断: "CREATE" | "UPDATE_STATUS" | "QUERY"',
              },
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "任务编号，例如 9221, 9222" },
                    title: { type: Type.STRING, description: "任务核心标题" },
                    priority: { type: Type.STRING, description: '"高" | "中" | "低"' },
                    deadline: { type: Type.STRING, description: "截止日期，如 2026-09-25 或 当天" },
                    status: { type: Type.STRING, description: '"未开始" | "进行中" | "已完成"' },
                    completed_at: {
                      type: Type.STRING,
                      description: '完成时间，未完成则为 null 或空字符串',
                    },
                  },
                  required: ["id", "title", "priority", "deadline", "status"],
                },
              },
            },
            required: ["action", "tasks"],
          },
        },
      });

      const responseText = response.text ? response.text.trim() : "{}";
      let parsedData;
      try {
        parsedData = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("[Server] JSON parse failed on Gemini response:", responseText, parseErr);
        // Fallback if model returned wrapped markdown or partial JSON
        const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        parsedData = JSON.parse(cleaned);
      }

      // Normalize tasks completed_at null value if empty string
      if (Array.isArray(parsedData.tasks)) {
        parsedData.tasks = parsedData.tasks.map((task: any) => ({
          ...task,
          completed_at: task.status === "已完成" ? (task.completed_at || today) : null,
        }));
      }

      res.json(parsedData);
    } catch (err: any) {
      console.error("[Server] Gemini parsing error:", err);
      // If error occurs, fallback gracefully to deterministic parser
      const { userInput, currentDate, existingTasks = [] } = req.body;
      const today = currentDate || "2026-09-22";
      const fallbackResult = fallbackRuleParser(userInput, today, existingTasks);
      res.json(fallbackResult);
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`智能任务追踪助理 Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
