import { ParseResult, TaskItem, RecurringTaskItem, RecurringPeriod } from '../types';

export function cleanTaskId(id: string | undefined | null): string {
  if (!id) return '';
  return String(id).replace(/^[#＃\s]+/, '').trim();
}

export function compareTaskIds(idA: string, idB: string): number {
  const cleanA = cleanTaskId(idA);
  const cleanB = cleanTaskId(idB);
  const numA = parseInt(cleanA, 10);
  const numB = parseInt(cleanB, 10);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numB - numA; // Descending order
  }
  return cleanB.localeCompare(cleanA);
}

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
    const cId = cleanTaskId(t.id);
    if (cId && cId.startsWith(prefix)) {
      const rest = cId.slice(prefix.length);
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

  // Check recurring task creation intent
  if (/^(?:添加|新增)?\s*周期任务|周期[:：]/i.test(text) || /周期任务/.test(text)) {
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const recurringTasks: RecurringTaskItem[] = [];

    for (const rawLine of lines) {
      let line = rawLine.replace(/^(?:添加|新增)?\s*周期任务[:：]?\s*/i, '').trim();
      if (!line) continue;

      let period: RecurringPeriod = '月';
      if (/年度|每年|按年/.test(line)) {
        period = '年度';
      } else if (/季度|每季|按季/.test(line)) {
        period = '季度';
      } else if (/每周|周度|按周|星期/.test(line)) {
        period = '周';
      } else if (/每日|每天|日度|按日/.test(line)) {
        period = '日';
      } else if (/每月|月度|按月/.test(line)) {
        period = '月';
      }

      let deadline = '按周期执行';
      const deadlineMatch = line.match(/(?:截止|截至|期限|日期)?\s*(每日[^\s,，]*|每周[^\s,，]*|每月[^\s,，]*|每季[^\s,，]*|每年[^\s,，]*|\d{1,2}日[前]?|\d{1,2}号[前]?)/);
      if (deadlineMatch) {
        deadline = deadlineMatch[1];
      } else if (period === '日') {
        deadline = '每日';
      } else if (period === '周') {
        deadline = '每周一';
      } else if (period === '月') {
        deadline = '每月25日前';
      } else if (period === '季度') {
        deadline = '每季度末25日前';
      } else if (period === '年度') {
        deadline = '每年12月31日前';
      }

      // Clean title
      let title = line
        .replace(/(?:截止|截至|期限|日期)?\s*(每日[^\s,，]*|每周[^\s,，]*|每月[^\s,，]*|每季[^\s,，]*|每年[^\s,，]*|\d{1,2}日[前]?|\d{1,2}号[前]?)/g, '')
        .replace(/(?:周期[：:]?\s*(?:日|周|月|季度|年度))/g, '')
        .replace(/(?:日度|周度|月度|季度|年度|每日|每周|每月|每季|每年)/g, '')
        .replace(/[,，;；\s]+$/, '')
        .replace(/^[,，;；\s]+/, '')
        .trim();

      if (!title) {
        title = line;
      }

      recurringTasks.push({
        id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        period,
        deadline,
        created_at: new Date().toISOString().replace('T', ' ').slice(0, 16),
      });
    }

    if (recurringTasks.length > 0) {
      return {
        action: 'CREATE_RECURRING',
        tasks: [],
        recurringTasks,
      };
    }
  }

  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const tasks: TaskItem[] = [];
  let isUpdateAction = false;
  let newCreatedCount = 0;

  for (const line of lines) {
    // 1. Flexible ID matching:
    // Handles: "9221 已完成", "9221已完成", "#9221 完成", "任务9221已完成", "更新9221为进行中", "将9221改为已完成"
    const flexibleIdMatch = line.match(/(?:任务|#|＃|更新|将|把)?\s*(\d{3,6})\s*(.*)/i);
    let targetId: string | null = null;
    let remainder = '';

    if (flexibleIdMatch) {
      targetId = flexibleIdMatch[1];
      remainder = flexibleIdMatch[2].trim();
    } else {
      // Or check if the line directly contains any existing task's ID or exact title
      const foundTask = existingTasks.find((t) => {
        const cId = cleanTaskId(t.id);
        return (cId && line.includes(cId)) || (t.title && line.includes(t.title));
      });
      if (foundTask) {
        targetId = cleanTaskId(foundTask.id);
        remainder = line
          .replace(new RegExp(`(?:任务|#|＃|更新|将|把)?\\s*${targetId}`, 'i'), '')
          .replace(foundTask.title, '')
          .trim();
      }
    }

    // Determine if this line is an update
    const hasStatusKeyword = /已完成|完成|做完|搞定|核销|已做|进行中|在做|跟进中|处理中|未开始|待办|未做/.test(line);

    if (targetId && (hasStatusKeyword || remainder.length > 0)) {
      isUpdateAction = true;

      let newStatus: '未开始' | '进行中' | '已完成' = '进行中';
      let completedAt: string | null = null;

      if (/已完成|完成|做完|搞定|核销|已做/.test(line)) {
        newStatus = '已完成';
        completedAt = baseDate;
      } else if (/进行中|在做|跟进中|处理中/.test(line)) {
        newStatus = '进行中';
      } else if (/未开始|待办|未做/.test(line)) {
        newStatus = '未开始';
      }

      // Match existing task by normalized ID or title
      const existing = existingTasks.find(
        (t) => cleanTaskId(t.id) === targetId || (t.title && line.includes(t.title))
      );

      // Clean title from remainder
      const cleanTitle = remainder
        .replace(/(?:更新|将|把|状态|改为|标记为|为)/g, '')
        .replace(/已完成|完成|做完|搞定|核销|已做|进行中|在做|跟进中|处理中|未开始|待办|未做/g, '')
        .replace(/[,，;；\s]+$/, '')
        .replace(/^[,，;；\s]+/, '')
        .trim();

      tasks.push({
        id: targetId,
        title: cleanTitle && cleanTitle.length > 1 ? cleanTitle : existing ? existing.title : `任务 ${targetId}`,
        priority: existing ? existing.priority : '中',
        deadline: existing ? existing.deadline : '当天',
        status: newStatus,
        completed_at: completedAt,
      });
      continue;
    }

    // 2. New task creation
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
