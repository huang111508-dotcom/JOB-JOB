import React, { useState } from 'react';
import { Smartphone, Download, X, Share2, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA in standalone mode, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 active:scale-95 transition-all"
        title="安装应用到桌面/手机"
      >
        <Download className="h-3.5 w-3.5" />
        <span>安装应用</span>
      </button>
    );
  }

  // iOS Safari flow (WebKit doesn't trigger beforeinstallprompt)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          title="在 iPhone / iPad 上安装此应用"
        >
          <Smartphone className="h-3.5 w-3.5" />
          <span>安装到手机</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-600 text-white">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">安装「智能任务追踪」</h3>
                    <p className="text-[11px] text-slate-500">免下载 App Store，直接在桌面独立运行</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs text-slate-600">
                <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-2.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-xs">
                    1
                  </div>
                  <p className="pt-0.5">
                    点击 Safari 浏览器底部的 <Share2 className="inline h-4 w-4 text-blue-600 mx-0.5" /> <strong>“分享”</strong> 按钮。
                  </p>
                </div>

                <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-2.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-xs">
                    2
                  </div>
                  <p className="pt-0.5">
                    在弹出的菜单中向下滑动，找到并点击 <PlusSquare className="inline h-4 w-4 text-slate-800 mx-0.5" /> <strong>“添加到主屏幕”</strong>。
                  </p>
                </div>

                <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-2.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-xs">
                    3
                  </div>
                  <p className="pt-0.5">
                    点击右上角的 <strong>“添加”</strong>，即可像原生 App 一样全屏沉浸使用！
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                我知道了
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
