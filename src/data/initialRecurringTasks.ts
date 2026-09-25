import { RecurringTaskItem } from '../types';

export const INITIAL_RECURRING_TASKS: RecurringTaskItem[] = [
  {
    id: 'rec_1',
    title: '每日工作复盘与工单结转',
    period: '日',
    deadline: '每日',
    created_at: '2026-09-20 09:00',
  },
  {
    id: 'rec_2',
    title: '周例会与部门重点事项排期',
    period: '周',
    deadline: '每周一',
    created_at: '2026-09-20 09:00',
  },
  {
    id: 'rec_3',
    title: '业务线阶段进度与周总结报表',
    period: '周',
    deadline: '每周五',
    created_at: '2026-09-20 09:00',
  },
  {
    id: 'rec_4',
    title: '月度财务对账及开票核对',
    period: '月',
    deadline: '每月25日前',
    created_at: '2026-09-20 09:00',
  },
  {
    id: 'rec_5',
    title: '全员考勤结算与月度绩效提报',
    period: '月',
    deadline: '每月最后一天',
    created_at: '2026-09-20 09:00',
  },
  {
    id: 'rec_6',
    title: '季度经营分析与预算达成复盘',
    period: '季度',
    deadline: '每季度末25日前',
    created_at: '2026-09-20 09:00',
  },
  {
    id: 'rec_7',
    title: '年度资产盘点与财务综合决算',
    period: '年度',
    deadline: '每年12月31日前',
    created_at: '2026-09-20 09:00',
  },
];
