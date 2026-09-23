import React, { useState } from 'react';
import { Lock, KeyRound, ShieldCheck, Eye, EyeOff } from 'lucide-react';

interface PasswordLockProps {
  onUnlock: (password: string) => boolean;
  onSetPassword?: (newPassword: string) => void;
  isFirstTimeSetup?: boolean;
}

export const PasswordLock: React.FC<PasswordLockProps> = ({
  onUnlock,
  onSetPassword,
  isFirstTimeSetup = false,
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (isFirstTimeSetup) {
      if (!password.trim() || password.length < 4) {
        setErrorMsg('请设置至少 4 位访问密码');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('两次输入的密码不一致，请重新输入');
        return;
      }
      if (onSetPassword) {
        onSetPassword(password.trim());
      }
    } else {
      if (!password.trim()) {
        setErrorMsg('请输入管理访问密码');
        return;
      }
      const success = onUnlock(password.trim());
      if (!success) {
        setErrorMsg('密码错误，请重新输入');
        setPassword('');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      {/* Background radial highlight */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900 to-slate-950 -z-10" />

      <div className="w-full max-w-sm rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-8 ring-blue-50/50 mb-4">
            {isFirstTimeSetup ? (
              <ShieldCheck className="h-7 w-7" />
            ) : (
              <Lock className="h-7 w-7" />
            )}
          </div>

          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {isFirstTimeSetup ? '初次使用：设置访问密码' : '安全访问验证'}
          </h2>
          <p className="mt-1.5 text-xs text-slate-500 leading-relaxed max-w-[260px]">
            {isFirstTimeSetup
              ? '为了防止他人随意篡改任务数据，请设置您的专属密码。本机将自动记住，今后无需重复输入。'
              : '当前任务管理页面受密码保护。验证通过后本机将自动记住，以后可直接进入。'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {isFirstTimeSetup ? '设置管理密码' : '访问密码'}
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
                autoFocus
                placeholder={isFirstTimeSetup ? '至少4位字符或数字' : '请输入密码'}
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

          {isFirstTimeSetup && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                再次确认密码
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <KeyRound className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="请再次输入新密码"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-10 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-hidden focus:ring-3 focus:ring-blue-100 transition-all"
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg bg-rose-50 p-2.5 text-center text-xs font-medium text-rose-600 border border-rose-100 animate-shake">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 active:scale-98 transition-all"
          >
            {isFirstTimeSetup ? '保存密码并进入系统' : '解锁并记住此设备'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block"></span>
            已开启「记住密码」免密信任机制
          </p>
        </div>
      </div>
    </div>
  );
};
