import { TaskItem } from '../types';

export const INITIAL_TASKS: TaskItem[] = [
  {
    id: '9221',
    title: '仓管当日入库追踪',
    priority: '高',
    deadline: '当天',
    status: '进行中',
    completed_at: null,
    created_at: '2026-09-22 09:15',
  },
  {
    id: '9186',
    title: '大客户送礼需求跟进',
    priority: '中',
    deadline: '2026-09-25',
    status: '未开始',
    completed_at: null,
    created_at: '2026-09-18 14:30',
  },
  {
    id: '9184',
    title: '供应商季度对账',
    priority: '高',
    deadline: '2026-09-24',
    status: '未开始',
    completed_at: null,
    created_at: '2026-09-18 10:00',
  },
  {
    id: '9211',
    title: '第三季度财务报表预审',
    priority: '中',
    deadline: '2026-09-21',
    status: '已完成',
    completed_at: '2026-09-21',
    created_at: '2026-09-21 08:30',
  },
];
