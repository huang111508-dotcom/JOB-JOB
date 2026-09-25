import { RecurringPeriod, RecurringTaskItem } from '../types';

export const PERIOD_RANK: Record<RecurringPeriod, number> = {
  日: 1,
  周: 2,
  月: 3,
  季度: 4,
  年度: 5,
};

const WEEKDAY_ORDER: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
};

function extractTimeWeight(item: RecurringTaskItem): number {
  const periodWeight = PERIOD_RANK[item.period] * 10000;
  const deadline = item.deadline || '';

  let subWeight = 500;

  if (item.period === '日') {
    // 每日早中晚
    if (deadline.includes('早') || deadline.includes('上午') || deadline.includes('9:')) subWeight = 100;
    else if (deadline.includes('中午') || deadline.includes('12:')) subWeight = 200;
    else if (deadline.includes('下午') || deadline.includes('18:')) subWeight = 300;
    else if (deadline.includes('晚')) subWeight = 400;
  } else if (item.period === '周') {
    // 提取周几
    for (const [char, dayNum] of Object.entries(WEEKDAY_ORDER)) {
      if (deadline.includes(`周${char}`) || deadline.includes(`星期${char}`)) {
        subWeight = dayNum * 100;
        break;
      }
    }
  } else if (item.period === '月') {
    // 提取几号/几日
    const match = deadline.match(/(\d{1,2})(?:日|号|前)/);
    if (match) {
      const day = parseInt(match[1], 10);
      subWeight = day * 10;
    } else if (deadline.includes('月初')) {
      subWeight = 10;
    } else if (deadline.includes('月中')) {
      subWeight = 150;
    } else if (deadline.includes('月末') || deadline.includes('最后')) {
      subWeight = 310;
    }
  } else if (item.period === '季度') {
    if (deadline.includes('季初')) subWeight = 100;
    else if (deadline.includes('季中')) subWeight = 200;
    else if (deadline.includes('季末') || deadline.includes('季度末')) subWeight = 300;
    else {
      const match = deadline.match(/(\d{1,2})/);
      if (match) subWeight = parseInt(match[1], 10) * 10;
    }
  } else if (item.period === '年度') {
    const matchMonth = deadline.match(/(\d{1,2})月/);
    if (matchMonth) {
      subWeight = parseInt(matchMonth[1], 10) * 100;
    } else if (deadline.includes('年初')) {
      subWeight = 100;
    } else if (deadline.includes('年中')) {
      subWeight = 600;
    } else if (deadline.includes('年末') || deadline.includes('年底')) {
      subWeight = 1200;
    }
  }

  return periodWeight + subWeight;
}

/**
 * 周期任务按时间先后排序：
 * 日 -> 周（周一至周日） -> 月（月初至月末） -> 季度（季初至季末） -> 年度（年初至年末）
 */
export function compareRecurringTasks(a: RecurringTaskItem, b: RecurringTaskItem): number {
  const weightA = extractTimeWeight(a);
  const weightB = extractTimeWeight(b);
  if (weightA !== weightB) {
    return weightA - weightB;
  }
  return a.title.localeCompare(b.title, 'zh-Hans-CN');
}

/**
 * 周期色彩样式配置
 */
export const PERIOD_STYLES: Record<
  RecurringPeriod,
  { bg: string; text: string; ring: string; lightBg: string }
> = {
  日: {
    bg: 'bg-blue-500',
    text: 'text-blue-700',
    ring: 'ring-blue-200',
    lightBg: 'bg-blue-50',
  },
  周: {
    bg: 'bg-indigo-500',
    text: 'text-indigo-700',
    ring: 'ring-indigo-200',
    lightBg: 'bg-indigo-50',
  },
  月: {
    bg: 'bg-amber-500',
    text: 'text-amber-700',
    ring: 'ring-amber-200',
    lightBg: 'bg-amber-50',
  },
  季度: {
    bg: 'bg-emerald-500',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200',
    lightBg: 'bg-emerald-50',
  },
  年度: {
    bg: 'bg-purple-500',
    text: 'text-purple-700',
    ring: 'ring-purple-200',
    lightBg: 'bg-purple-50',
  },
};
