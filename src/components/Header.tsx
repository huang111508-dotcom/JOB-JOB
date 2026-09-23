import React from 'react';
import { CheckCircle2, Clock, ListTodo, Archive, ChevronRight } from 'lucide-react';
import { TaskItem } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  tasks: TaskItem[];
  activeTab?: 'active' | 'history';
  onTabChange?: (tab: 'active' | 'history') => void;
}

export const Header: React.FC<HeaderProps> = ({
  tasks,
  activeTab = 'active',
  onTabChange,
}) => {
  const pendingCount = tasks.filter((t) => t.status === '未开始').length;
  const inProgressCount = tasks.filter((t) => t.status === '进行中').length;
  const completedCount = tasks.filter((t) => t.status === '已完成').length;
  const activeCount = pendingCount + inProgressCount;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              任务追踪管理
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              待办敏捷跟踪 · 已核销自动归档历史
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton />
            <span className="hidden sm:inline text-xs text-slate-400">
              智能自然语言解析系统
            </span>
          </div>
        </div>

        {/* 任务汇总栏：4个模块交互行，支持点击快捷切换视图 */}
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          {/* 第1行：当前待办总任务量 */}
          <div
            onClick={() => onTabChange?.('active')}
            className={`flex items-center justify-between rounded-lg px-3.5 py-2 cursor-pointer transition-all ${
              activeTab === 'active'
                ? 'bg-blue-50/80 ring-1 ring-blue-200'
                : 'bg-slate-50 hover:bg-slate-100'
            }`}
            title="点击查看主页待办任务明细"
          >
            <div className="flex items-center gap-2.5 text-xs text-slate-700">
              <ListTodo className="h-4 w-4 text-blue-600" />
              <span className="font-medium">主页待办任务总量</span>
              <span className="text-[10px] text-slate-400">（仅显示进行中与未开始）</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-slate-900">{activeCount} 项</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>

          {/* 第2行：进行中 */}
          <div
            onClick={() => onTabChange?.('active')}
            className="flex items-center justify-between rounded-lg bg-amber-50/70 px-3.5 py-2 cursor-pointer hover:bg-amber-100/70 transition-colors"
            title="点击切换至待办任务列表"
          >
            <div className="flex items-center gap-2.5 text-xs text-amber-800">
              <Clock className="h-4 w-4 text-amber-600" />
              <span>进行中任务</span>
            </div>
            <span className="text-sm font-semibold text-amber-900">{inProgressCount} 项</span>
          </div>

          {/* 第3行：未开始 */}
          <div
            onClick={() => onTabChange?.('active')}
            className="flex items-center justify-between rounded-lg bg-slate-100/70 px-3.5 py-2 cursor-pointer hover:bg-slate-200/70 transition-colors"
            title="点击切换至待办任务列表"
          >
            <div className="flex items-center gap-2.5 text-xs text-slate-700">
              <Clock className="h-4 w-4 text-slate-500" />
              <span>未开始任务</span>
            </div>
            <span className="text-sm font-semibold text-slate-900">{pendingCount} 项</span>
          </div>

          {/* 第4行：已完成核销（点击直接切到历史任务） */}
          <div
            onClick={() => onTabChange?.('history')}
            className={`flex items-center justify-between rounded-lg px-3.5 py-2 cursor-pointer transition-all ${
              activeTab === 'history'
                ? 'bg-emerald-100/90 ring-1 ring-emerald-300'
                : 'bg-emerald-50/70 hover:bg-emerald-100/80'
            }`}
            title="点击查看已核销历史任务库"
          >
            <div className="flex items-center gap-2.5 text-xs text-emerald-800">
              <Archive className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold">已核销任务（保存在历史任务库）</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-emerald-900">{completedCount} 项</span>
              <span className="rounded bg-emerald-200/80 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                查看历史
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
