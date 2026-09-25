import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Search,
  X,
  Archive,
  ListTodo,
  RotateCcw,
  Trash2,
  Calendar,
  Repeat,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { TaskItem, TaskStatus, ActiveTabType, RecurringTaskItem } from '../types';
import { compareTaskIds } from '../utils/taskParser';
import { RecurringTaskList } from './RecurringTaskList';

interface TaskListProps {
  tasks: TaskItem[];
  recurringTasks?: RecurringTaskItem[];
  onUpdateStatus: (taskId: string, newStatus: TaskStatus) => void;
  onDeleteTask: (taskId: string) => void;
  recentlyUpdatedId?: string | null;
  activeTab?: ActiveTabType;
  onTabChange?: (tab: ActiveTabType) => void;
  onAddRecurringTask?: (item: Omit<RecurringTaskItem, 'id'>) => Promise<void> | void;
  onUpdateRecurringTask?: (id: string, updates: Partial<RecurringTaskItem>) => Promise<void> | void;
  onDeleteRecurringTask?: (id: string) => Promise<void> | void;
  onDispatchRecurringToActive?: (item: RecurringTaskItem) => void;
}

// 格式化截止日期为月日形式（例如 9.22、9.25），严格只要日期不要时间点
function formatShortDate(deadline: string | undefined | null): string {
  if (!deadline) return '-';
  // 过滤掉具体时间点（如 18:00、09:30、18点、下午、上午等）
  const cleaned = String(deadline)
    .replace(/\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*前)?/g, '')
    .replace(/\s*\d{1,2}点(?:\d{1,2}分)?(?:\s*前)?/g, '')
    .replace(/\s*(?:上午|下午|晚上|中午|早晨|下班前|上班前)/g, '')
    .trim();

  if (cleaned === '当天' || cleaned === '今天') {
    const now = new Date();
    return `${now.getMonth() + 1}.${now.getDate()}`;
  }
  const match = cleaned.match(/(?:(\d{4})[-/.])?(\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const m = parseInt(match[2], 10);
    const d = parseInt(match[3], 10);
    return `${m}.${d}`;
  }
  return cleaned || '-';
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  recurringTasks = [],
  onUpdateStatus,
  onDeleteTask,
  recentlyUpdatedId,
  activeTab: externalTab,
  onTabChange,
  onAddRecurringTask,
  onUpdateRecurringTask,
  onDeleteRecurringTask,
  onDispatchRecurringToActive,
}) => {
  const [internalTab, setInternalTab] = useState<ActiveTabType>('active');
  const currentTab = externalTab ?? internalTab;

  const handleTabSwitch = (newTab: ActiveTabType) => {
    setInternalTab(newTab);
    onTabChange?.(newTab);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [activeStatusFilter, setActiveStatusFilter] = useState<'全部' | '进行中' | '未开始'>('全部');

  // 分流统计：待办任务与已核销历史任务
  const activeTasksList = useMemo(() => {
    return tasks.filter((t) => t.status !== '已完成');
  }, [tasks]);

  const historyTasksList = useMemo(() => {
    return tasks.filter((t) => t.status === '已完成');
  }, [tasks]);

  // 根据当前标签页筛选和排序展示数据
  const displayTasks = useMemo(() => {
    const baseList = currentTab === 'active' ? activeTasksList : historyTasksList;
    const sorted = [...baseList].sort((a, b) => compareTaskIds(a.id, b.id));

    return sorted.filter((task) => {
      // 待办页面子状态筛选
      if (currentTab === 'active' && activeStatusFilter !== '全部') {
        if (task.status !== activeStatusFilter) return false;
      }

      // 关键字搜索
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchId = task.id.toLowerCase().includes(query);
        const matchTitle = task.title.toLowerCase().includes(query);
        if (!matchId && !matchTitle) return false;
      }

      return true;
    });
  }, [currentTab, activeTasksList, historyTasksList, activeStatusFilter, searchQuery]);

  // 导出 Excel 表格 (.xlsx)
  const handleExportExcel = () => {
    const isHistory = currentTab === 'history';
    const targetTasks = isHistory ? historyTasksList : activeTasksList;
    const sheetTitle = isHistory ? '已核销历史任务' : '当前待办任务明细';

    const excelRows = targetTasks.map((task, index) => ({
      序号: index + 1,
      任务编号: task.id,
      任务内容: task.title,
      优先级: task.priority,
      截止日期: task.deadline,
      任务状态: task.status,
      完成核销日期: task.completed_at || '-',
      创建时间: task.created_at || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 12 },
      { wch: 32 },
      { wch: 10 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle);

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `${sheetTitle}_${dateStr}.xlsx`);
  };

  return (
    <div className="space-y-3">
      {/* 顶部标签页切换条：主页任务明细 VS 历史任务 VS 周期任务明细 */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-2 sm:px-4 pt-2 rounded-t-xl border border-b-0 border-slate-200">
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {/* 标签1：主页任务明细 */}
          <button
            type="button"
            onClick={() => handleTabSwitch('active')}
            className={`flex items-center gap-1.5 border-b-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-all shrink-0 ${
              currentTab === 'active'
                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/60 rounded-t-lg'
            }`}
          >
            <ListTodo className="h-4 w-4 text-blue-600" />
            <span>主页任务明细</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                currentTab === 'active'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {activeTasksList.length}
            </span>
          </button>

          {/* 标签2：历史任务（已核销） */}
          <button
            type="button"
            onClick={() => handleTabSwitch('history')}
            className={`flex items-center gap-1.5 border-b-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-all shrink-0 ${
              currentTab === 'history'
                ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/60 rounded-t-lg'
            }`}
          >
            <Archive className="h-4 w-4 text-emerald-600" />
            <span>历史任务</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                currentTab === 'history'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              已核销 {historyTasksList.length}
            </span>
          </button>

          {/* 标签3：周期任务明细（固定周期持续任务） */}
          <button
            type="button"
            onClick={() => handleTabSwitch('recurring')}
            className={`flex items-center gap-1.5 border-b-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-all shrink-0 ${
              currentTab === 'recurring'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/60 rounded-t-lg'
            }`}
          >
            <Repeat className="h-4 w-4 text-indigo-600" />
            <span>周期任务明细</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                currentTab === 'recurring'
                  ? 'bg-indigo-100 text-indigo-800'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {recurringTasks.length}
            </span>
          </button>
        </div>

        {/* 仅在待办和历史视图下展示顶栏导出按钮（周期视图内自带有独立导出与添加） */}
        {currentTab !== 'recurring' && (
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs mb-1.5 shrink-0"
            title={`导出为 Excel 表格 (.xlsx)`}
          >
            <Download className="h-3.5 w-3.5 text-slate-600" />
            <span className="hidden sm:inline">导出</span> Excel
          </button>
        )}
      </div>

      {/* 视图内容分发 */}
      {currentTab === 'recurring' ? (
        <RecurringTaskList
          recurringTasks={recurringTasks}
          onAddRecurringTask={onAddRecurringTask || (() => {})}
          onUpdateRecurringTask={onUpdateRecurringTask || (() => {})}
          onDeleteRecurringTask={onDeleteRecurringTask || (() => {})}
          onDispatchToActive={onDispatchRecurringToActive}
        />
      ) : (
        <div className="rounded-b-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {/* 搜索栏与过滤工具条 */}
          <div className="border-b border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              {/* 实时搜索栏 */}
              <div className="relative flex-1">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    currentTab === 'active'
                      ? '搜索待办任务标题关键字或编号（如 9221、仓管）...'
                      : '搜索已核销历史任务标题或编号...'
                  }
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-8 pl-9 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-600"
                    title="清空搜索"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* 仅在待办视图显示“进行中 / 未开始”快捷过滤 */}
              {currentTab === 'active' && (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={activeStatusFilter}
                    onChange={(e) => setActiveStatusFilter(e.target.value as any)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-hidden"
                  >
                    <option value="全部">全部待办 ({activeTasksList.length})</option>
                    <option value="进行中">
                      进行中 ({activeTasksList.filter((t) => t.status === '进行中').length})
                    </option>
                    <option value="未开始">
                      未开始 ({activeTasksList.filter((t) => t.status === '未开始').length})
                    </option>
                  </select>
                </div>
              )}

              {currentTab === 'history' && (
                <div className="text-xs text-slate-500 shrink-0 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                  <span>保留所有已核销完成的归档记录</span>
                </div>
              )}
            </div>

            {/* 统计提示 */}
            {searchQuery && (
              <div className="mt-2 text-[11px] text-slate-500">
                匹配到 <strong className="text-blue-600">{displayTasks.length}</strong> 项
                {currentTab === 'active' ? '待办任务' : '历史任务'}
              </div>
            )}
          </div>

          {/* 滚动容器：加入 min-w-[480px] 保证手机端任务描述列宽充裕，绝不挤压成单字 */}
          <div className="overflow-x-auto">
            <div className="min-w-[480px] sm:min-w-full">
              {/* 表头 */}
              <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] sm:text-xs font-semibold text-slate-600">
                <div className="w-12 sm:w-14 shrink-0">序列号</div>
                <div className="flex-1 min-w-[140px]">
                  {currentTab === 'active' ? '待办任务描述' : '已核销历史任务描述'}
                </div>
                <div className="w-13 sm:w-15 shrink-0 text-center">状态</div>
                <div className="w-12 sm:w-14 shrink-0 text-center">
                  {currentTab === 'active' ? '截止' : '完成核销'}
                </div>
                <div className="w-12 sm:w-14 shrink-0 text-center">
                  {currentTab === 'active' ? '核销' : '操作'}
                </div>
              </div>

              {/* 任务列表 */}
              <div className="divide-y divide-slate-100 max-h-[72vh] overflow-y-auto">
                {displayTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    {currentTab === 'active' ? (
                      <>
                        <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
                        <p className="text-sm font-semibold text-slate-800">
                          所有任务均已核销完成！
                        </p>
                        <p className="mt-1 text-xs text-slate-500 max-w-sm">
                          已核销的任务已安全保存在「历史任务」中。您可在上方输入框添加新任务，或切换到「历史任务」查阅以往记录。
                        </p>
                        <button
                          type="button"
                          onClick={() => handleTabSwitch('history')}
                          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <Archive className="h-3.5 w-3.5 text-emerald-600" />
                          查看历史任务 ({historyTasksList.length})
                        </button>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-9 w-9 text-slate-300" />
                        <p className="mt-2 text-xs sm:text-sm text-slate-600">
                          {searchQuery ? '未找到匹配的历史任务' : '暂无已核销的历史任务'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          在主页待办任务中点击「核销」后，任务将自动归档并保存在这里。
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  displayTasks.map((task) => {
                    const isHistory = currentTab === 'history';
                    const isJustUpdated =
                      recentlyUpdatedId &&
                      (task.id === recentlyUpdatedId || `#${task.id}` === recentlyUpdatedId);

                    return (
                      <div
                        key={task.id}
                        className={`group flex items-center gap-1.5 sm:gap-2 px-2.5 py-2 text-xs transition-all duration-300 hover:bg-slate-50 ${
                          isJustUpdated
                            ? 'bg-blue-50/80 ring-2 ring-blue-400 ring-inset'
                            : isHistory
                            ? 'bg-white'
                            : 'bg-white'
                        }`}
                      >
                        {/* 1. 序列号 */}
                        <div className="w-12 sm:w-14 shrink-0 flex items-center gap-0.5">
                          <span className="font-mono font-bold text-slate-800 text-[11px] sm:text-xs">
                            #{task.id}
                          </span>
                          {task.priority === '高' && (
                            <span className="rounded bg-rose-50 px-0.5 text-[9px] font-bold text-rose-600 ring-1 ring-rose-200 shrink-0">
                              高
                            </span>
                          )}
                        </div>

                        {/* 2. 任务描述（设置 min-w-[140px]，在手机端保障良好横向阅读排版） */}
                        <div className="flex-1 min-w-[140px] pr-1">
                          <p
                            className={`font-medium text-[11px] sm:text-xs leading-snug break-words whitespace-normal ${
                              isHistory ? 'text-slate-600' : 'text-slate-800'
                            }`}
                          >
                            {task.title}
                          </p>
                          {isHistory && task.completed_at && (
                            <span className="text-[10px] text-emerald-600 font-mono">
                              核销于 {formatShortDate(task.completed_at)}
                            </span>
                          )}
                        </div>

                        {/* 3. 状态 */}
                        <div className="w-13 sm:w-15 shrink-0 flex items-center justify-center">
                          {isHistory ? (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                              已核销
                            </span>
                          ) : (
                            <select
                              value={task.status}
                              onChange={(e) => onUpdateStatus(task.id, e.target.value as TaskStatus)}
                              className={`appearance-none cursor-pointer rounded px-1.5 py-0.5 text-[10px] sm:text-xs font-semibold text-center focus:outline-hidden transition-colors ${
                                task.status === '进行中'
                                  ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                                  : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                              }`}
                              title="点击可直接切换为进行中或未开始"
                            >
                              <option value="进行中">进行中</option>
                              <option value="未开始">未开始</option>
                              <option value="已完成">核销归档</option>
                            </select>
                          )}
                        </div>

                        {/* 4. 截止日期 或 核销日期（只要日期，不要时间点） */}
                        <div
                          className="w-12 sm:w-14 shrink-0 text-center font-mono text-[10px] sm:text-xs text-slate-600 truncate"
                          title={
                            isHistory
                              ? `核销日期: ${formatShortDate(task.completed_at || task.deadline)}`
                              : `截止日期: ${formatShortDate(task.deadline)}`
                          }
                        >
                          {isHistory
                            ? formatShortDate(task.completed_at || task.deadline)
                            : formatShortDate(task.deadline)}
                        </div>

                        {/* 5. 操作栏 */}
                        <div className="w-12 sm:w-14 shrink-0 flex items-center justify-center gap-1">
                          {!isHistory ? (
                            /* 主页待办任务：一键核销按钮，点击后自动归档到历史 */
                            <button
                              type="button"
                              onClick={() => onUpdateStatus(task.id, '已完成')}
                              className="w-full inline-flex items-center justify-center rounded bg-emerald-600 py-0.5 text-[10px] sm:text-xs font-medium text-white shadow-2xs hover:bg-emerald-700 active:scale-95 transition-all"
                              title="点击核销此任务，自动归档至历史任务库"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 shrink-0" />
                              核销
                            </button>
                          ) : (
                            /* 历史任务：支持“恢复至待办”或删除 */
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onUpdateStatus(task.id, '进行中')}
                                className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                                title="恢复此任务为待办，重新放回主页明细"
                              >
                                <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                                恢复
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteTask(task.id)}
                                className="text-slate-400 hover:text-rose-600 p-0.5 transition-colors"
                                title="彻底删除此历史记录"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>


          {/* 底部信息栏 */}
          <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-1.5 text-[11px] text-slate-500 flex items-center justify-between">
            <span>
              {currentTab === 'active' ? '当前待办明细' : '历史归档记录'}：显示 {displayTasks.length} 条
            </span>
            <span className="text-[10px] text-slate-400">
              {currentTab === 'active'
                ? '已核销任务自动保存在历史任务库中'
                : '点击“恢复”可重新放回主页待办明细'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

