export type Priority = '高' | '中' | '低';

export type TaskStatus = '未开始' | '进行中' | '已完成';

export type TaskAction = 'CREATE' | 'UPDATE_STATUS' | 'QUERY' | 'CREATE_RECURRING';

export type RecurringPeriod = '日' | '周' | '月' | '季度' | '年度';

export interface UserAccount {
  username: string; // 唯一账号名，不可修改
  passwordHash: string; // 密码哈希
  createdAt: string; // 创建时间
  updatedAt?: string; // 最近更新时间
  role?: 'admin' | 'user'; // 角色
  notes?: string; // 备注说明
}

export interface RecurringTaskItem {
  id: string;
  username?: string; // 任务所属账号，默认属于 dakbo
  title: string;
  period: RecurringPeriod;
  deadline: string;
  created_at?: string;
  notes?: string;
}

export type ActiveTabType = 'active' | 'history' | 'recurring';

export interface TaskItem {
  id: string;
  username?: string; // 任务所属账号，默认属于 dakbo
  title: string;
  priority: Priority;
  deadline: string;
  status: TaskStatus;
  completed_at: string | null;
  created_at?: string;
  notes?: string;
}

export interface ParseResult {
  action: TaskAction;
  tasks: TaskItem[];
  recurringTasks?: RecurringTaskItem[];
  rawText?: string;
  timestamp?: string;
}

export interface ParseRequestPayload {
  userInput: string;
  currentDate?: string; // e.g. "2026-09-22"
  existingTasks?: TaskItem[];
}


