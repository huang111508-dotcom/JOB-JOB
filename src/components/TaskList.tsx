import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Search,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { TaskItem, TaskStatus } from '../types';

interface TaskListProps {
  tasks: TaskItem[];
  onUpdateStatus: (taskId: string, newStatus: TaskStatus) => void;
  onDeleteTask: (taskId: string) => void;
}

// 格式化截止日期为月日形式（例如 9.22、9.25）
function formatShortDate(deadline: string): string {
  if (!deadline) return '-';
  if (deadline === '当天') {
    return '9.22';
  }
  const match = deadline.match(/(?:(\d{4})[-/.])?(\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const m = parseInt(match[2], 10);
    const d = parseInt(match[3], 10);
    return `${m}.${d}`;
  }
  return deadline;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  onUpdateStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'全部' | TaskStatus>('全部');

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter !== '全部' && task.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchId = task.id.toLowerCase().includes(query);
        const matchTitle = task.title.toLowerCase().includes(query);
        if (!matchId && !matchTitle) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, searchQuery]);

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    const excelRows = tasks.map((task, index) => ({
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
    XLSX.utils.book_append_sheet(workbook, worksheet, '任务追踪清单');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `任务追踪清单_${dateStr}.xlsx`);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      {/* 顶部搜索栏与操作工具条 */}
      <div className="border-b border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* 实时搜索栏：支持任务标题关键字或任务编号 */}
          <div className="relative flex-1">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索任务标题关键字或编号（如 9221、排班）..."
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

          <div className="flex items-center gap-2 shrink-0">
            {/* 状态快捷过滤 */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-hidden"
            >
              <option value="全部">全部状态</option>
              <option value="未开始">未开始</option>
              <option value="进行中">进行中</option>
              <option value="已完成">已完成</option>
            </select>

            {/* 导出 Excel 表格 */}
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              title="导出为 Excel 表格文件 (.xlsx)"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              导出 Excel
            </button>
          </div>
        </div>

        {/* 统计提示 */}
        {(searchQuery || statusFilter !== '全部') && (
          <div className="mt-2 text-[11px] text-slate-500">
            匹配到 <strong className="text-blue-600">{filteredTasks.length}</strong> 项任务（总计 {tasks.length} 项）
          </div>
        )}
      </div>

      {/* 滚动容器：保障手机端与桌面端均单行对齐 */}
      <div className="overflow-x-auto">
        <div className="min-w-full">
          {/* 表头：手机端与电脑端均保持同一行，为任务描述留出最大空间 */}
          <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] sm:text-xs font-semibold text-slate-600">
            <div className="w-12 sm:w-14 shrink-0">序列号</div>
            <div className="flex-1 min-w-0">任务描述</div>
            <div className="w-13 sm:w-15 shrink-0 text-center">状态</div>
            <div className="w-10 sm:w-12 shrink-0 text-center">截止</div>
            <div className="w-11 sm:w-13 shrink-0 text-center">核销</div>
          </div>

          {/* 任务列表：支持文字自动换行，无多余下拉标识 */}
          <div className="divide-y divide-slate-100 max-h-[72vh] overflow-y-auto">
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-8 w-8 text-slate-300" />
                <p className="mt-2 text-xs sm:text-sm text-slate-600">未找到匹配的任务记录</p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-xs text-blue-600 hover:underline"
                  >
                    清除搜索条件
                  </button>
                )}
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isDone = task.status === '已完成';
                const shortDate = formatShortDate(task.deadline);
                return (
                  <div
                    key={task.id}
                    className={`group flex items-center gap-1.5 sm:gap-2 px-2.5 py-2 text-xs transition-colors hover:bg-slate-50 ${
                      isDone ? 'bg-slate-50/40 opacity-75' : 'bg-white'
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

                    {/* 2. 任务描述：一行显示不完全部文字时自动换行显示 */}
                    <div className="flex-1 min-w-0 pr-1">
                      <p
                        className={`font-medium text-[11px] sm:text-xs leading-snug break-words whitespace-normal ${
                          isDone ? 'text-slate-400 line-through' : 'text-slate-800'
                        }`}
                      >
                        {task.title}
                      </p>
                    </div>

                    {/* 3. 状态：直接显示状态名，无下拉箭头标识，点击直接触发系统下拉菜单 */}
                    <div className="w-13 sm:w-15 shrink-0 flex items-center justify-center">
                      <select
                        value={task.status}
                        onChange={(e) => onUpdateStatus(task.id, e.target.value as TaskStatus)}
                        className={`appearance-none cursor-pointer rounded px-1.5 py-0.5 text-[10px] sm:text-xs font-semibold text-center focus:outline-hidden transition-colors ${
                          task.status === '已完成'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : task.status === '进行中'
                            ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                            : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                        }`}
                        title="点击直接切换任务状态"
                      >
                        <option value="未开始">未开始</option>
                        <option value="进行中">进行中</option>
                        <option value="已完成">已完成</option>
                      </select>
                    </div>

                    {/* 4. 截止日期：精简月日形式（如 9.22） */}
                    <div
                      className="w-10 sm:w-12 shrink-0 text-center font-mono text-[10px] sm:text-xs text-slate-600"
                      title={`截止日期: ${task.deadline}`}
                    >
                      {shortDate}
                    </div>

                    {/* 5. 核销按钮 */}
                    <div className="w-11 sm:w-13 shrink-0 flex items-center justify-center">
                      {!isDone ? (
                        <button
                          type="button"
                          onClick={() => onUpdateStatus(task.id, '已完成')}
                          className="w-full inline-flex items-center justify-center rounded bg-emerald-600 py-0.5 text-[10px] sm:text-xs font-medium text-white shadow-2xs hover:bg-emerald-700 active:scale-95"
                          title="点击核销为已完成"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 shrink-0" />
                          核销
                        </button>
                      ) : (
                        <span className="w-full inline-flex items-center justify-center text-[10px] sm:text-xs font-medium text-emerald-600">
                          <CheckCircle2 className="h-3 w-3 mr-0.5 shrink-0" />
                          已核销
                        </span>
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
        <span>当前显示 {filteredTasks.length} 条</span>
        <span className="text-[10px] text-slate-400">紧凑自适应视图 · 完整文字展示</span>
      </div>
    </div>
  );
};
