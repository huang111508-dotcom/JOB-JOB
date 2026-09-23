export type Priority = '高' | '中' | '低';

export type TaskStatus = '未开始' | '进行中' | '已完成';

export type TaskAction = 'CREATE' | 'UPDATE_STATUS' | 'QUERY';

export interface TaskItem {
  id: string;
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
  rawText?: string;
  timestamp?: string;
}

export interface ParseRequestPayload {
  userInput: string;
  currentDate?: string; // e.g. "2026-09-22"
  existingTasks?: TaskItem[];
}
