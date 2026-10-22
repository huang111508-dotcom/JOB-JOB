import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  UserPlus,
  Users,
  KeyRound,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  UserCheck,
} from 'lucide-react';
import { UserAccount, TaskItem, RecurringTaskItem } from '../types';
import {
  getAllUsers,
  addUser,
  adminResetPassword,
  deleteUser,
  DEFAULT_USERNAME,
  sanitizeUsername,
} from '../utils/authService';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  allTasks?: TaskItem[];
  allRecurringTasks?: RecurringTaskItem[];
  onSwitchUser?: (username: string) => void;
  onNotification: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  allTasks = [],
  allRecurringTasks = [],
  onSwitchUser,
  onNotification,
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 新增账号表单
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // 重置密码弹窗
  const [resettingUser, setResettingUser] = useState<UserAccount | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetError, setResetError] = useState('');

  // 删除确认
  const [deletingUser, setDeletingUser] = useState<UserAccount | null>(null);

  const loadUserList = async () => {
    setIsLoading(true);
    try {
      const list = await getAllUsers();
      setUsers(list);
    } catch (e) {
      console.warn('Failed to load users in admin', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUserList();
      setFormError('');
      setResettingUser(null);
      setDeletingUser(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newUsername.trim()) {
      setFormError('请输入账号名');
      return;
    }
    if (!newPassword.trim() || newPassword.length < 4) {
      setFormError('初始密码至少需要 4 位字符');
      return;
    }

    setIsSubmitting(true);
    const result = await addUser(newUsername.trim(), newPassword.trim(), newNotes);
    setIsSubmitting(false);

    if (result.success) {
      onNotification(result.message, 'success');
      setNewUsername('');
      setNewPassword('');
      setNewNotes('');
      loadUserList();
    } else {
      setFormError(result.message);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;
    if (!resetPasswordInput || resetPasswordInput.length < 4) {
      setResetError('新密码至少需要 4 位字符');
      return;
    }

    const res = await adminResetPassword(resettingUser.username, resetPasswordInput);
    if (res.success) {
      onNotification(`已成功将账号「${resettingUser.username}」密码重置！`, 'success');
      setResettingUser(null);
      setResetPasswordInput('');
      loadUserList();
    } else {
      setResetError(res.message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    const res = await deleteUser(deletingUser.username);
    if (res.success) {
      onNotification(res.message, 'info');
      setDeletingUser(null);
      loadUserList();
    } else {
      onNotification(res.message, 'error');
    }
  };

  // 统计每个用户的任务数量
  const getUserStats = (username: string) => {
    const isDakbo = sanitizeUsername(username) === sanitizeUsername(DEFAULT_USERNAME);
    const userTasks = allTasks.filter((t) => {
      const u = t.username ? sanitizeUsername(t.username) : sanitizeUsername(DEFAULT_USERNAME);
      return u === sanitizeUsername(username);
    });
    const userRec = allRecurringTasks.filter((r) => {
      const u = r.username ? sanitizeUsername(r.username) : sanitizeUsername(DEFAULT_USERNAME);
      return u === sanitizeUsername(username);
    });

    const activeCount = userTasks.filter((t) => t.status !== '已完成').length;
    const completedCount = userTasks.filter((t) => t.status === '已完成').length;
    return { activeCount, completedCount, recurringCount: userRec.length, isDakbo };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5 backdrop-blur-xs">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/30">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">后台管理控制台</h2>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                  管理员权限已激活
                </span>
              </div>
              <p className="text-xs text-slate-400">
                添加团队成员账号、设置初始密码与重置凭证（固定密码：admin888）
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title="关闭管理后台"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 主体滚动区 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* 信息概览与规则说明卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-900 mb-1">
                <Users className="h-4 w-4 text-blue-600" />
                <span>总账号数</span>
              </div>
              <p className="text-2xl font-bold text-blue-950">{users.length} 个</p>
              <p className="text-[11px] text-blue-700/80 mt-0.5">支持多人独立追踪各自任务</p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 mb-1">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                <span>默认数据归属账号</span>
              </div>
              <p className="text-base font-bold text-emerald-950 flex items-center gap-1.5">
                <span>{DEFAULT_USERNAME}</span>
                <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.2 rounded font-normal">
                  系统默认
                </span>
              </p>
              <p className="text-[11px] text-emerald-700/80 mt-0.5">历史遗留全部任务与周期项归属此账号</p>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900 mb-1">
                <Lock className="h-4 w-4 text-indigo-600" />
                <span>账号管理安全机制</span>
              </div>
              <p className="text-xs font-medium text-indigo-950">
                使用者登录后可修改自身密码
              </p>
              <p className="text-[11px] text-indigo-700/80 mt-0.5">
                账号名为唯一标识，禁止使用者自行篡改
              </p>
            </div>
          </div>

          {/* 添加新账号表单 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <UserPlus className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">添加新使用者账号</h3>
                <p className="text-xs text-slate-500">为同事或协作者分配账号名与初始登录密码</p>
              </div>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    账号名 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => {
                      setNewUsername(e.target.value);
                      if (formError) setFormError('');
                    }}
                    placeholder="如：张三、alice、tech01"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    初始密码 <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (formError) setFormError('');
                      }}
                      placeholder="初始登录密码（至少4位）"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 pr-8 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    备注 / 所属部门（选填）
                  </label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="如：设计组、业务运营"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 border border-rose-100">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setNewUsername('');
                    setNewPassword('');
                    setNewNotes('');
                    setFormError('');
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
                >
                  清空重填
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 active:scale-98 disabled:opacity-50 transition-all"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>{isSubmitting ? '正在开通...' : '立即开通账号'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* 账号列表与管理操作 */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold text-slate-800">全部使用者账号列表</h3>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  共 {users.length} 个
                </span>
              </div>
              <button
                onClick={loadUserList}
                disabled={isLoading}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600"
              >
                <RotateCcw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>刷新列表</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">账号名</th>
                    <th className="py-2.5 px-3">账号类型</th>
                    <th className="py-2.5 px-3">当前任务数据</th>
                    <th className="py-2.5 px-3">创建时间</th>
                    <th className="py-2.5 px-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => {
                    const stats = getUserStats(user.username);
                    const isDakbo = stats.isDakbo;

                    return (
                      <tr key={user.username} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span>{user.username}</span>
                            {isDakbo && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                                默认主账号
                              </span>
                            )}
                            {user.notes && (
                              <span className="text-[10px] text-slate-400">({user.notes})</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${
                              isDakbo
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isDakbo ? '默认历史归属' : '使用者账号'}
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-medium text-slate-700">
                              待办 {stats.activeCount}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-500">
                              已归档 {stats.completedCount}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-indigo-600">
                              周期 {stats.recurringCount}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-[11px] text-slate-400">
                          {user.createdAt || '-'}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {onSwitchUser && (
                              <button
                                onClick={() => {
                                  onSwitchUser(user.username);
                                  onClose();
                                }}
                                className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                title="直接以此账号进入工作界面"
                              >
                                <span>进入此账号</span>
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setResettingUser(user);
                                setResetPasswordInput('');
                                setResetError('');
                              }}
                              className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-200 transition-colors"
                              title="重置该账号密码"
                            >
                              <KeyRound className="h-3 w-3 text-slate-500" />
                              <span>重置密码</span>
                            </button>

                            {isDakbo ? (
                              <button
                                disabled
                                className="cursor-not-allowed rounded p-1 text-slate-300"
                                title="系统默认账号承接历史所有数据，不可删除"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setDeletingUser(user)}
                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                title="删除此账号"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 底部操作与关闭 */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
          <p className="text-[11px] text-slate-400">
            提示：普通使用者无法修改账号名，但登录后可在顶栏随时修改各自的登录密码。
          </p>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
          >
            完成并关闭
          </button>
        </div>
      </div>

      {/* 重置密码子弹窗 */}
      {resettingUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <h4 className="text-sm font-bold text-slate-900 mb-1">
              重置「{resettingUser.username}」的密码
            </h4>
            <p className="text-xs text-slate-500 mb-3">
              请输入该账号的新密码，保存后使用者下次登录须使用此密码。
            </p>

            <form onSubmit={handleConfirmReset} className="space-y-3">
              <input
                type="text"
                autoFocus
                value={resetPasswordInput}
                onChange={(e) => {
                  setResetPasswordInput(e.target.value);
                  if (resetError) setResetError('');
                }}
                placeholder="输入新密码（至少4位）"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:border-blue-600 focus:outline-hidden"
              />

              {resetError && (
                <p className="text-xs text-rose-600 font-medium">{resetError}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setResettingUser(null)}
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  确认重置
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认子弹窗 */}
      {deletingUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm mb-2">
              <AlertTriangle className="h-5 w-5" />
              <span>确认删除账号</span>
            </div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              确定要删除使用者账号「<strong className="text-slate-900">{deletingUser.username}</strong>」吗？删除后该使用者将无法登录。
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
