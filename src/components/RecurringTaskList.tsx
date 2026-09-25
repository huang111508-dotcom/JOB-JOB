import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Plus,
  Search,
  X,
  Edit3,
  Trash2,
  Download,
  Clock,
  Sparkles,
  ArrowRightCircle,
  CheckCircle2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { RecurringPeriod, RecurringTaskItem } from '../types';
import { compareRecurringTasks, PERIOD_STYLES, formatRecurringDeadline } from '../utils/recurringUtils';

interface RecurringTaskListProps {
  recurringTasks: RecurringTaskItem[];
  onAddRecurringTask: (item: Omit<RecurringTaskItem, 'id'>) => Promise<void> | void;
  onUpdateRecurringTask: (id: string, updates: Partial<RecurringTaskItem>) => Promise<void> | void;
  onDeleteRecurringTask: (id: string) => Promise<void> | void;
  onDispatchToActive?: (item: RecurringTaskItem) => void;
}

// 截止日期预设：严格只要日期，不带任何具体时间点
const PRESET_DEADLINES: Record<RecurringPeriod, string[]> = {
  日: ['每日', '当天'],
  周: ['每周一', '每周二', '每周三', '每周四', '每周五', '每周日'],
  月: ['每月25日前', '每月10日前', '每月15日前', '每月最后一天', '每月1日'],
  季度: ['每季度末25日前', '每季末', '每季度初'],
  年度: ['每年12月31日前', '每年6月30日前', '每年1月31日前'],
};

export const RecurringTaskList: React.FC<RecurringTaskListProps> = ({
  recurringTasks,
  onAddRecurringTask,
  onUpdateRecurringTask,
  onDeleteRecurringTask,
  onDispatchToActive,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'全部' | RecurringPeriod>('全部');

  // 弹窗状态：新增或编辑
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringTaskItem | null>(null);

  // 表单状态
  const [formTitle, setFormTitle] = useState('');
  const [formPeriod, setFormPeriod] = useState<RecurringPeriod>('月');
  const [formDeadline, setFormDeadline] = useState('每月25日前');
  const [formNotes, setFormNotes] = useState('');

  // 打开新增弹窗
  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormTitle('');
    setFormPeriod('月');
    setFormDeadline('每月25日前');
    setFormNotes('');
    setIsModalOpen(true);
  };

  // 打开编辑弹窗
  const handleOpenEdit = (item: RecurringTaskItem) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormPeriod(item.period);
    setFormDeadline(formatRecurringDeadline(item.deadline));
    setFormNotes(item.notes || '');
    setIsModalOpen(true);
  };

  // 切换周期时自动填充推荐截止预设
  const handlePeriodChange = (period: RecurringPeriod) => {
    setFormPeriod(period);
    const presets = PRESET_DEADLINES[period];
    if (presets && presets.length > 0) {
      setFormDeadline(presets[0]);
    }
  };

  // 提交保存：过滤具体时间点，只保留日期
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const cleanedDeadline = formatRecurringDeadline(formDeadline.trim()) || '按周期执行';

    if (editingItem) {
      await onUpdateRecurringTask(editingItem.id, {
        title: formTitle.trim(),
        period: formPeriod,
        deadline: cleanedDeadline,
        notes: formNotes.trim(),
      });
    } else {
      await onAddRecurringTask({
        title: formTitle.trim(),
        period: formPeriod,
        deadline: cleanedDeadline,
        notes: formNotes.trim(),
        created_at: new Date().toISOString().replace('T', ' ').slice(0, 16),
      });
    }
    setIsModalOpen(false);
  };

  // 按时间先后排序及筛选数据
  const sortedAndFilteredTasks = useMemo(() => {
    const list = [...recurringTasks].sort(compareRecurringTasks);
    return list.filter((task) => {
      if (periodFilter !== '全部' && task.period !== periodFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const cleanDl = formatRecurringDeadline(task.deadline).toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(q);
        const matchDeadline = cleanDl.includes(q);
        const matchPeriod = task.period.toLowerCase().includes(q);
        if (!matchTitle && !matchDeadline && !matchPeriod) return false;
      }
      return true;
    });
  }, [recurringTasks, periodFilter, searchQuery]);

  // 导出 Excel
  const handleExportExcel = () => {
    const excelRows = sortedAndFilteredTasks.map((task, index) => ({
      序号: index + 1,
      任务描述: task.title,
      周期: task.period,
      截止日期: formatRecurringDeadline(task.deadline),
      备注说明: task.notes || '-',
      创建时间: task.created_at || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 36 },
      { wch: 10 },
      { wch: 20 },
      { wch: 24 },
      { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '固定周期任务明细');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `周期任务明细_${dateStr}.xlsx`);
  };

  return (
    <div className="space-y-3">
      {/* 搜索、过滤与操作工具栏 */}
      <div className="border-b border-slate-200 bg-white p-3 sm:p-4 rounded-xl border">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* 实时搜索 */}
          <div className="relative flex-1">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索周期任务描述（如：对账、考勤、例会）或截止日期..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-8 pl-9 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* 周期筛选与添加按钮 */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              {(['全部', '日', '周', '月', '季度', '年度'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriodFilter(p)}
                  className={`rounded-md px-2 py-1 font-medium transition-all ${
                    periodFilter === p
                      ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>添加周期任务</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
              title="导出周期任务为 Excel 表格"
            >
              <Download className="h-3.5 w-3.5 text-slate-600" />
              <span className="hidden sm:inline">导出</span> Excel
            </button>
          </div>
        </div>

        {/* 顶部简短提示 */}
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-blue-600" />
            <span>
              已按时间先后规则自动排序（日 → 周 → 月 → 季度 → 年度）
            </span>
          </div>
          <span>
            共 <strong className="text-blue-600">{sortedAndFilteredTasks.length}</strong> 项周期任务
          </span>
        </div>
      </div>

      {/* 周期任务列表卡片：无序列号，只显示【任务描述】、【周期】、【截止日期】及操作 */}
      {/* overflow-x-auto 配合 min-w 彻底解决手机端列宽被挤压成单字的问题 */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[460px] sm:min-w-full">
            {/* 表头（严格不包含序列号列，保证任务描述列宽充裕） */}
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/90 px-3 py-2.5 text-xs font-semibold text-slate-700">
              <div className="flex-1 min-w-[150px]">任务描述</div>
              <div className="w-14 sm:w-18 shrink-0 text-center">周期</div>
              <div className="w-28 sm:w-36 shrink-0 text-center">截止日期</div>
              <div className="w-20 sm:w-24 shrink-0 text-center">操作</div>
            </div>

            {/* 列表项 */}
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {sortedAndFilteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <Calendar className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">
                    {searchQuery ? '未找到符合条件的周期任务' : '暂无固定周期任务'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400 max-w-sm">
                    周期任务用于管理固定时间的例行事项（如每周一例会、每月25日对账、季末决算等），无需序列号。
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenAdd}
                    className="mt-3.5 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    立即创建第一个周期任务
                  </button>
                </div>
              ) : (
                sortedAndFilteredTasks.map((task) => {
                  const style = PERIOD_STYLES[task.period] || PERIOD_STYLES['月'];
                  const displayDeadline = formatRecurringDeadline(task.deadline);

                  return (
                    <div
                      key={task.id}
                      className="group flex items-center gap-2 px-3 py-2.5 text-xs transition-colors hover:bg-slate-50/80 bg-white"
                    >
                      {/* 1. 任务描述（无序列号，min-w保证手机端字词完整阅读，绝不挤压成单字） */}
                      <div className="flex-1 min-w-[150px] pr-2">
                        <p className="font-medium text-slate-900 text-xs sm:text-sm leading-snug break-words whitespace-normal">
                          {task.title}
                        </p>
                        {task.notes && (
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {task.notes}
                          </p>
                        )}
                      </div>

                      {/* 2. 周期（日、周、月、季度、年度） */}
                      <div className="w-14 sm:w-18 shrink-0 flex items-center justify-center">
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${style.lightBg} ${style.text} ring-1 ${style.ring}`}
                        >
                          {task.period}
                        </span>
                      </div>

                      {/* 3. 截止日期（只要日期不要时间点，如：每日、每周一、每月25日前） */}
                      <div
                        className="w-28 sm:w-36 shrink-0 text-center font-mono text-xs font-medium text-slate-700 bg-slate-50/90 rounded-md py-1 px-2 border border-slate-100 truncate"
                        title={displayDeadline}
                      >
                        {displayDeadline}
                      </div>

                      {/* 4. 操作栏：生成当期待办、编辑、删除 */}
                      <div className="w-20 sm:w-24 shrink-0 flex items-center justify-center gap-1 sm:gap-1.5">
                        {onDispatchToActive && (
                          <button
                            type="button"
                            onClick={() => onDispatchToActive(task)}
                            className="inline-flex items-center rounded border border-blue-200 bg-blue-50/60 p-1 text-blue-700 hover:bg-blue-100 transition-colors"
                            title="将此周期任务派生为今日待办任务，放入主页明细"
                          >
                            <ArrowRightCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(task)}
                          className="inline-flex items-center rounded border border-slate-200 bg-white p-1 text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-colors"
                          title="编辑周期任务"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRecurringTask(task.id)}
                          className="inline-flex items-center rounded border border-slate-200 bg-white p-1 text-slate-400 hover:text-rose-600 hover:border-rose-300 transition-colors"
                          title="删除此周期任务"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 底部信息 */}
        <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-500 flex items-center justify-between">
          <span>固定周期任务库 · 显示 {sortedAndFilteredTasks.length} 项</span>
          <span className="text-[10px] text-slate-400">
            点击右侧箭头可一键生成今日待办
          </span>
        </div>
      </div>

      {/* 新增/编辑周期任务模态框 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-blue-600" />
                {editingItem ? '编辑周期任务' : '添加固定时间周期任务'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              {/* 1. 任务描述 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  任务描述 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="例如：供应商月度对账与发票核对、周例会复盘"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* 2. 周期选择（日、周、月、季度、年度） */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  周期类型 <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['日', '周', '月', '季度', '年度'] as const).map((p) => {
                    const isSelected = formPeriod === p;
                    const style = PERIOD_STYLES[p];
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePeriodChange(p)}
                        className={`flex flex-col items-center justify-center rounded-lg border py-2 text-xs font-bold transition-all ${
                          isSelected
                            ? `${style.lightBg} ${style.text} border-blue-500 ring-2 ring-blue-200`
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. 截止日期（只要日期，不要时间点） */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    截止日期 <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-blue-600 font-medium">仅需日期，无需具体时间点</span>
                </div>
                <input
                  type="text"
                  required
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                  placeholder="如：每日、每周一、每月25日前、每季度末等"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
                />

                {/* 快捷推荐预设（无时间点） */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-slate-400 self-center">快捷填入:</span>
                  {(PRESET_DEADLINES[formPeriod] || []).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormDeadline(preset)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                        formDeadline === preset
                          ? 'bg-blue-100 text-blue-700 font-semibold'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. 备注说明（选填） */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  备注说明 <span className="text-slate-400 text-[10px]">（选填）</span>
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="补充说明或执行要点..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* 提交按钮栏 */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{editingItem ? '保存修改' : '确认添加'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

