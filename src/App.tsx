/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { TaskInput } from './components/TaskInput';
import { TaskList } from './components/TaskList';
import { PasswordLock } from './components/PasswordLock';
import { INITIAL_TASKS } from './data/initialTasks';
import { ParseResult, TaskItem, TaskStatus } from './types';
import { CheckCircle2, AlertTriangle, Info, Cloud, Lock, Key } from 'lucide-react';
import { db } from './firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';

const STORAGE_KEY = 'smart_task_tracker_tasks_v2';
const AUTH_PASSWORD_KEY = 'smart_task_tracker_pwd_hash';
const AUTH_TOKEN_KEY = 'smart_task_tracker_auth_token';

// 简单高效的字符串哈希算法
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'pwd_' + Math.abs(hash).toString(36) + '_' + str.length;
}

export default function App() {
  const currentDate = '2026-09-22';

  // 认证状态管理：支持记住密码，输入一次后本机永久免密
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      const storedPasswordHash = localStorage.getItem(AUTH_PASSWORD_KEY);
      // 如果之前从未设置过密码，需要先进入设置页
      if (!storedPasswordHash) {
        return false;
      }
      // 如果已经存储过密码，且本地记住的 Token 匹配密码 Hash，则直接免密通过
      return storedToken === storedPasswordHash;
    } catch {
      return false;
    }
  });

  const [hasPasswordSet, setHasPasswordSet] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem(AUTH_PASSWORD_KEY);
    } catch {
      return false;
    }
  });

  const [showChangePwdModal, setShowChangePwdModal] = useState(false);

  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load tasks from localStorage', e);
    }
    return INITIAL_TASKS;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [cloudSynced, setCloudSynced] = useState<boolean | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // 1. 监听 Firebase Firestore 云端数据库，实现数据实时同步与多端同步
  useEffect(() => {
    if (!isAuthenticated) return;

    let unsubscribe = () => {};

    try {
      const tasksColRef = collection(db, 'tasks');

      getDocs(tasksColRef)
        .then((snapshot) => {
          if (snapshot.empty) {
            INITIAL_TASKS.forEach((t) => {
              setDoc(doc(db, 'tasks', t.id), t).catch(() => {});
            });
          }
        })
        .catch((err) => {
          console.warn('[Firebase] Initial check note:', err);
        });

      unsubscribe = onSnapshot(
        tasksColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteTasks: TaskItem[] = [];
            snapshot.forEach((d) => {
              remoteTasks.push(d.data() as TaskItem);
            });
            remoteTasks.sort((a, b) => b.id.localeCompare(a.id));
            setTasks(remoteTasks);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteTasks));
            } catch {}
          }
          setCloudSynced(true);
        },
        (error) => {
          console.warn('[Firebase] Firestore onSnapshot warning:', error);
          setCloudSynced(false);
        }
      );
    } catch (e) {
      console.warn('[Firebase] Setup warning:', e);
      setCloudSynced(false);
    }

    return () => unsubscribe();
  }, [isAuthenticated]);

  // 2. 本地持久化缓存兜底备份
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      console.error('Failed to save tasks', e);
    }
  }, [tasks, isAuthenticated]);

  const showNotification = (
    message: string,
    type: 'success' | 'info' | 'error' = 'success'
  ) => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // 密码验证逻辑
  const handleUnlock = (inputPassword: string) => {
    const currentHash = localStorage.getItem(AUTH_PASSWORD_KEY);
    const inputHash = hashString(inputPassword);

    if (currentHash === inputHash) {
      // 验证成功，保存记住密码的 Token 到本地设备
      localStorage.setItem(AUTH_TOKEN_KEY, inputHash);
      setIsAuthenticated(true);
      showNotification('验证成功，已自动记住此设备！', 'success');
      return true;
    }
    return false;
  };

  // 首次设置密码或修改密码
  const handleSetPassword = (newPassword: string) => {
    const newHash = hashString(newPassword);
    localStorage.setItem(AUTH_PASSWORD_KEY, newHash);
    localStorage.setItem(AUTH_TOKEN_KEY, newHash);
    setHasPasswordSet(true);
    setIsAuthenticated(true);
    setShowChangePwdModal(false);
    showNotification('管理密码设置成功！本机已自动免密记住。', 'success');
  };

  // 锁定/退出免密
  const handleLock = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setIsAuthenticated(false);
    showNotification('已退出免密状态，重新进入需输入密码', 'info');
  };

  // 3. 自然语言智能解析并同步到 Firebase Firestore
  const handleParse = async (userInput: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/parse-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userInput,
          currentDate,
          existingTasks: tasks,
        }),
      });

      if (!response.ok) {
        throw new Error(`服务响应异常: ${response.status}`);
      }

      const result: ParseResult = await response.json();

      if (result.action === 'CREATE') {
        const newItems: TaskItem[] = result.tasks.map((t) => ({
          ...t,
          created_at: new Date().toISOString().replace('T', ' ').slice(0, 16),
        }));

        setTasks((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const filteredNew = newItems.filter((i) => !existingIds.has(i.id));
          return [...filteredNew, ...prev];
        });

        for (const item of newItems) {
          try {
            await setDoc(doc(db, 'tasks', item.id), item);
          } catch (cloudErr) {
            console.warn('[Firebase] Firestore write note:', cloudErr);
          }
        }

        showNotification(`已新增 ${result.tasks.length} 项任务，已存入云端数据库！`, 'success');
      } else if (result.action === 'UPDATE_STATUS') {
        const updateMap = new Map(result.tasks.map((t) => [t.id, t]));

        setTasks((prev) => {
          return prev.map((item) => {
            if (updateMap.has(item.id)) {
              const updated = updateMap.get(item.id)!;
              return {
                ...item,
                status: updated.status,
                completed_at:
                  updated.status === '已完成'
                    ? updated.completed_at || currentDate
                    : null,
                priority: updated.priority || item.priority,
                deadline: updated.deadline || item.deadline,
              };
            }
            return item;
          });
        });

        for (const t of result.tasks) {
          try {
            const completedAt = t.status === '已完成' ? (t.completed_at || currentDate) : null;
            await updateDoc(doc(db, 'tasks', t.id), {
              status: t.status,
              completed_at: completedAt,
            });
          } catch (cloudErr) {
            console.warn('[Firebase] Firestore update note:', cloudErr);
          }
        }

        const updatedIds = result.tasks.map((t) => `#${t.id}`).join('、');
        showNotification(`已更新任务 ${updatedIds} 状态并同步到云端！`, 'success');
      } else if (result.action === 'QUERY') {
        showNotification(`查询指令已识别，共匹配 ${result.tasks.length} 条记录`, 'info');
      }
    } catch (err: any) {
      console.error('Task parse error:', err);
      showNotification(`解析失败: ${err.message || '未知错误'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. 状态变更（含核销）并推送到 Firestore
  const handleUpdateStatus = async (taskId: string, newStatus: TaskStatus) => {
    const completedAt = newStatus === '已完成' ? currentDate : null;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          return {
            ...t,
            status: newStatus,
            completed_at: completedAt,
          };
        }
        return t;
      })
    );

    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        status: newStatus,
        completed_at: completedAt,
      });
    } catch (cloudErr) {
      console.warn('[Firebase] Firestore status update note:', cloudErr);
    }

    showNotification(
      `任务 #${taskId} 已更新为「${newStatus}」${newStatus === '已完成' ? '（已核销）' : ''}`,
      'success'
    );
  };

  // 5. 删除任务并从 Firestore 移除
  const handleDeleteTask = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (cloudErr) {
      console.warn('[Firebase] Firestore delete note:', cloudErr);
    }
    showNotification(`已删除任务 #${taskId}`, 'info');
  };

  // 如果未认证，显示安全密码验证锁屏组件
  if (!isAuthenticated) {
    return (
      <PasswordLock
        isFirstTimeSetup={!hasPasswordSet}
        onUnlock={handleUnlock}
        onSetPassword={handleSetPassword}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* 顶部标题与4行汇总栏 */}
      <Header tasks={tasks} />

      {/* 提示条 */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium shadow-md transition-all">
          {notification.type === 'success' && (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
          {notification.type === 'info' && <Info className="h-4 w-4 text-blue-600" />}
          {notification.type === 'error' && (
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* 主体单列简洁布局 */}
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 space-y-4">
        {/* 安全状态与云端状态条 */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Cloud className={`h-3.5 w-3.5 ${cloudSynced ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span>
                {cloudSynced
                  ? 'Firebase Firestore 云端已连接'
                  : '本地缓存就绪 · 已配置 Firebase'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowChangePwdModal(true)}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 transition-colors"
              title="修改管理密码"
            >
              <Key className="h-3 w-3" />
              <span>修改密码</span>
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={handleLock}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600 transition-colors"
              title="锁定系统，下次需要重新输入密码"
            >
              <Lock className="h-3 w-3" />
              <span>锁定</span>
            </button>
          </div>
        </div>

        {/* 指令输入框与提交按钮 */}
        <TaskInput onParse={handleParse} isLoading={isLoading} />

        {/* 任务追踪清单（含 Excel 导出） */}
        <TaskList
          tasks={tasks}
          onUpdateStatus={handleUpdateStatus}
          onDeleteTask={handleDeleteTask}
        />
      </main>

      {/* 修改密码弹窗 */}
      {showChangePwdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">修改访问密码</h3>
            <p className="text-xs text-slate-500 mb-4">设置新的管理密码，设置成功后将更新本机信任记忆。</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const newPwd = (form.elements.namedItem('newPwd') as HTMLInputElement).value;
                if (!newPwd || newPwd.length < 4) {
                  showNotification('密码至少需要 4 位', 'error');
                  return;
                }
                handleSetPassword(newPwd);
              }}
              className="space-y-3"
            >
              <input
                type="password"
                name="newPwd"
                autoFocus
                placeholder="输入新密码（至少4位）"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm focus:border-blue-600 focus:outline-hidden"
              />
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePwdModal(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
                >
                  保存新密码
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
