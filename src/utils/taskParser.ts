import { ParseResult, TaskItem } from '../types';

export function getDayPrefix(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}${day}`;
}

export function getNextSequence(
  prefix: string,
  existingTasks: TaskItem[],
  offset: number = 0
): string {
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

export function parseTasksLocally(
  input: string,
  baseDate: string,
  existingTasks: TaskItem[]
): ParseResult {
  const text = input.trim();
  const dayPrefix = getDayPrefix(baseDate);

  // Check query intent
  if (
    /^(查看|查询|搜索|列出|有哪些|汇报|进度)/.test(text) ||
    /^(list|show|search|query)/i.test(text)
  ) {
    return {
      action: 'QUERY',
      tasks: [],
    };
  }

  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const tasks: TaskItem[] = [];
  let isUpdateAction = false;
  let newCreatedCount = 0;

  for (const line of lines) {
    // Check if line starts with an ID update: e.g. "9186 已完成", "9184 大客户送礼 进行中", "9221 完成"
    const idStatusMatch = line.match(/^(\d{3,6})\s*(.*)$/);
    if (idStatusMatch) {
      const targetId = idStatusMatch[1];
      const remainder = idStatusMatch[2].trim();
      isUpdateAction = true;

      let newStatus: '未开始' | '进行中' | '已完成' = '进行中';
      let completedAt: string | null = null;

      if (/已完成|完成|做完|搞定|核销|已做/.test(remainder)) {
        newStatus = '已完成';
        completedAt = baseDate;
      } else if (/进行中|在做|跟进中|处理中/.test(remainder)) {
        newStatus = '进行中';
      } else if (/未开始|待办|未做/.test(remainder)) {
        newStatus = '未开始';
      }

      // Find existing task
      const existing = existingTasks.find((t) => t.id === targetId);
      const cleanTitle =
        remainder
          .replace(/已完成|完成|做完|搞定|核销|进行中|在做|跟进中|未开始|待办/g, '')
          .trim() || (existing ? existing.title : `任务 ${targetId}`);

      tasks.push({
        id: targetId,
        title: existing ? existing.title : cleanTitle,
        priority: existing ? existing.priority : '中',
        deadline: existing ? existing.deadline : '当天',
        status: newStatus,
        completed_at: completedAt,
      });
      continue;
    }

    // New task creation
    let priority: '高' | '中' | '低' = '中';
    if (/高优先级|紧急|重要|特急|优先|加急/.test(line)) {
      priority = '高';
    } else if (/低优先级|延后|次要/.test(line)) {
      priority = '低';
    }

    let deadline = '当天';
    const dateMatch = line.match(
      /(截止|截至|限期|到期)?\s*(\d{1,2}\.\d{1,2}|\d{4}-\d{2}-\d{2}|明天|后天|当天|本周)/
    );
    if (dateMatch) {
      const rawDate = dateMatch[2];
      if (rawDate === '明天') {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + 1);
        deadline = d.toISOString().split('T')[0];
      } else if (rawDate === '后天') {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + 2);
        deadline = d.toISOString().split('T')[0];
      } else if (rawDate.includes('.')) {
        const [m, day] = rawDate.split('.');
        const year = baseDate.split('-')[0] || '2026';
        deadline = `${year}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } else {
        deadline = rawDate;
      }
    }

    let status: '未开始' | '进行中' | '已完成' = '未开始';
    let completedAt: string | null = null;
    if (/已完成|完成|做完|核销/.test(line)) {
      status = '已完成';
      completedAt = baseDate;
    } else if (/进行中|在做/.test(line)) {
      status = '进行中';
    }

    // Clean title
    let title = line
      .replace(/(截止|截至|限期|到期)?\s*(\d{1,2}\.\d{1,2}|\d{4}-\d{2}-\d{2}|明天|后天|当天|本周)/g, '')
      .replace(/高优先级|低优先级|中优先级|紧急|优先|特急|重要|加急/g, '')
      .replace(/已完成|进行中|未开始/g, '')
      .replace(/[,，;；\s]+$/, '')
      .replace(/^[,，;；\s]+/, '')
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
    action: isUpdateAction ? 'UPDATE_STATUS' : 'CREATE',
    tasks,
  };
}
