import React from 'react';
import { CheckCircle2, Clock, ListTodo } from 'lucide-react';
import { TaskItem } from '../types';

interface HeaderProps {
  tasks: TaskItem[];
}

export const Header: React.FC<HeaderProps> = ({ tasks }) => {
  const pendingCount = tasks.filter((t) => t.status === '未开始').length;
  const inProgressCount = tasks.filter((t) => t.status === '进行中').length;
  const completedCount = tasks.filter((t) => t.status === '已完成').length;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            任务追踪管理
          </h1>
          <span className="text-xs text-slate-400">智能自然语言解析系统</span>
        </div>

        {/* 任务汇总栏：4个模块改为4行 */}
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          {/* 第1行：总任务量 */}
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2">
            <div className="flex items-center gap-2.5 text-xs text-slate-600">
              <ListTodo className="h-4 w-4 text-slate-500" />
              <span>总任务量</span>
            </div>
            <span className="text-sm font-semibold text-slate-900">{tasks.length} 项</span>
          </div>

          {/* 第2行：进行中 */}
          <div className="flex items-center justify-between rounded-lg bg-amber-50/70 px-3.5 py-2">
            <div className="flex items-center gap-2.5 text-xs text-amber-800">
              <Clock className="h-4 w-4 text-amber-600" />
              <span>进行中任务</span>
            </div>
            <span className="text-sm font-semibold text-amber-900">{inProgressCount} 项</span>
          </div>

          {/* 第3行：未开始 */}
          <div className="flex items-center justify-between rounded-lg bg-slate-100/70 px-3.5 py-2">
            <div className="flex items-center gap-2.5 text-xs text-slate-700">
              <Clock className="h-4 w-4 text-slate-500" />
              <span>未开始任务</span>
            </div>
            <span className="text-sm font-semibold text-slate-900">{pendingCount} 项</span>
          </div>

          {/* 第4行：已完成核销 */}
          <div className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-3.5 py-2">
            <div className="flex items-center gap-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>已完成核销</span>
            </div>
            <span className="text-sm font-semibold text-emerald-900">{completedCount} 项</span>
          </div>
        </div>
      </div>
    </header>
  );
};
