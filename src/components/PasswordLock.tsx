import React, { useState } from 'react';
import {
  Lock,
  User,
  KeyRound,
  ShieldAlert,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Users,
  Sparkles,
} from 'lucide-react';
import { DEFAULT_USERNAME, ADMIN_PASSWORD_FIXED } from '../utils/authService';

interface PasswordLockProps {
  onLogin: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  onAdminOpen: () => void;
  onVerifyAdminPassword: (password: string) => boolean;
}

export const PasswordLock: React.FC<PasswordLockProps> = ({
  onLogin,
  onAdminOpen,
  onVerifyAdminPassword,
}) => {
  const [username, setUsername] = useState('dakbo');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 管理员快捷验证弹窗
  const [showAdminAuthModal, setShowAdminAuthModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username.trim()) {
      setErrorMsg('请输入账号名');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('请输入密码');
      return;
    }

    setIsLoading(true);
    const result = await onLogin(username.trim(), password.trim());
    setIsLoading(false);

    if (!result.success) {
      setErrorMsg(result.message || '登录失败，请检查账号密码');
      setPassword('');
    }
  };

  const handleAdminVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    if (!adminPasswordInput.trim()) {
      setAdminError('请输入后台管理密码');
      return;
    }

    const isValid = onVerifyAdminPassword(adminPasswordInput.trim());
    if (isValid) {
      setShowAdminAuthModal(false);
      setAdminPasswordInput('');
      onAdminOpen();
    } else {
      setAdminError('后台管理密码错误（提示：固定密码为 admin888）');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* 渐变装饰背景 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-900/25 via-slate-900 to-slate-950 -z-10" />

      <div className="w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-8 ring-blue-50/50 mb-3">
            <Users className="h-7 w-7" />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            任务追踪协作管理系统
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            请输入您的账号与密码，开始记录和追踪工作任务
          </p>
        </div>

        {/* 提示信息栏 */}
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-semibold text-blue-950">历史数据说明：</span>
              已有的全部待办、历史与周期任务均统一归属于默认账号「<strong className="text-blue-700">{DEFAULT_USERNAME}</strong>」。若初次使用请输入初始密码
              <code className="mx-1 rounded bg-blue-100 px-1 py-0.5 font-mono font-bold text-blue-800">123456</code>
              （或之前设定的密码）。
            </div>
          </div>
        </div>

        {/* 用户登录表单 */}
        <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              账号名
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <User className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                autoFocus
                placeholder="请输入您的账号名（如 dakbo）"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-hidden focus:ring-3 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              登录密码
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <KeyRound className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="请输入密码"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-10 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-hidden focus:ring-3 focus:ring-blue-100 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>记住免密登录</span>
            </label>

            <button
              type="button"
              onClick={() => {
                setShowAdminAuthModal(true);
                setAdminError('');
              }}
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline inline-flex items-center gap-1"
            >
              <ShieldAlert className="h-3 w-3" />
              <span>后台管理 (admin888)</span>
            </button>
          </div>

          {errorMsg && (
            <div className="rounded-lg bg-rose-50 p-2.5 text-center text-xs font-medium text-rose-600 border border-rose-100 flex items-center justify-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 active:scale-98 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isLoading ? '正在验证登录...' : '登 录'}
          </button>
        </form>

        {/* 底部管理员开通指引 */}
        <div className="mt-5 border-t border-slate-100 pt-4 text-center">
          <p className="text-[11px] text-slate-400">
            其他成员账号需由管理员在后台统一添加分配，登录后可自主修改密码
          </p>
        </div>
      </div>

      {/* 管理员身份验证弹窗 */}
      {showAdminAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base mb-1">
              <ShieldAlert className="h-5 w-5 text-blue-600" />
              <h3>进入后台管理界面</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              请输入固定的后台管理密码（admin888）以添加账号和重置密码。
            </p>

            <form onSubmit={handleAdminVerify} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  管理密码
                </label>
                <input
                  type="password"
                  autoFocus
                  value={adminPasswordInput}
                  onChange={(e) => {
                    setAdminPasswordInput(e.target.value);
                    if (adminError) setAdminError('');
                  }}
                  placeholder="请输入后台管理密码"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              {adminError && (
                <p className="text-xs text-rose-600 font-medium">{adminError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdminAuthModal(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 cursor-pointer"
                >
                  验证并进入后台
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
