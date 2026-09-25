/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { TaskInput } from './components/TaskInput';
import { TaskList } from './components/TaskList';
import { PasswordLock } from './components/PasswordLock';
import { INITIAL_TASKS } from './data/initialTasks';
import { INITIAL_RECURRING_TASKS } from './data/initialRecurringTasks';
import { ParseResult, TaskItem, TaskStatus, ActiveTabType, RecurringTaskItem } from './types';
import {
  parseTasksLocally,
  cleanTaskId,
  compareTaskIds,
  getDayPrefix,
  getNextSequence,
} from './utils/taskParser';
import { compareRecurringTasks } from './utils/recurringUtils';
import { CheckCircle2, AlertTriangle, Info, Cloud, Lock, Key } from 'lucide-react';
import { db } from './firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';

const STORAGE_KEY = 'smart_task_tracker_tasks_v2';
const RECURRING_STORAGE_KEY = 'smart_task_tracker_recurring_v1';
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
  const currentDate = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [recentlyUpdatedId, setRecentlyUpdatedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTabType>('active');

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

  const [recurringTasks, setRecurringTasks] = useState<RecurringTaskItem[]>(() => {
    try {
      const saved = localStorage.getItem(RECURRING_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load recurring tasks from localStorage', e);
    }
    return INITIAL_RECURRING_TASKS;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [cloudSynced, setCloudSynced] = useState<boolean | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // 1. 监听 Firebase Firestore 云端数据库，实现待办和周期任务的实时多端同步
  useEffect(() => {
    if (!isAuthenticated) return;

    let unsubscribeTasks = () => {};
    let unsubscribeRecurring = () => {};

    try {
      // 1.1 常规任务集合同步
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

      unsubscribeTasks = onSnapshot(
        tasksColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteTasks: TaskItem[] = [];
            snapshot.forEach((d) => {
              const data = d.data() as TaskItem;
              remoteTasks.push({
                ...data,
                id: cleanTaskId(data.id || d.id),
              });
            });
            remoteTasks.sort((a, b) => compareTaskIds(a.id, b.id));
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

      // 1.2 周期任务集合同步
      const recurringColRef = collection(db, 'recurring_tasks');
      getDocs(recurringColRef)
        .then((snapshot) => {
          if (snapshot.empty) {
            INITIAL_RECURRING_TASKS.forEach((t) => {
              setDoc(doc(db, 'recurring_tasks', t.id), t).catch(() => {});
            });
          }
        })
        .catch((err) => {
          console.warn('[Firebase] Initial recurring check note:', err);
        });

      unsubscribeRecurring = onSnapshot(
        recurringColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteRecurring: RecurringTaskItem[] = [];
            snapshot.forEach((d) => {
              remoteRecurring.push(d.data() as RecurringTaskItem);
            });
            remoteRecurring.sort(compareRecurringTasks);
            setRecurringTasks(remoteRecurring);
            try {
              localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(remoteRecurring));
            } catch {}
          }
        },
        (error) => {
          console.warn('[Firebase] Recurring onSnapshot warning:', error);
        }
      );
    } catch (e) {
      console.warn('[Firebase] Setup warning:', e);
      setCloudSynced(false);
    }

    return () => {
      unsubscribeTasks();
      unsubscribeRecurring();
    };
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

  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(recurringTasks));
    } catch (e) {
      console.error('Failed to save recurring tasks', e);
    }
  }, [recurringTasks, isAuthenticated]);


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
      let result: ParseResult;

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

        if (response.ok) {
          result = await response.json();
        } else {
          console.warn(`[Parse] API responded with ${response.status}. Using smart local parser.`);
          result = parseTasksLocally(userInput, currentDate, tasks);
        }
      } catch (networkErr) {
        console.warn('[Parse] Network or serverless route unavailable. Using smart local parser:', networkErr);
        result = parseTasksLocally(userInput, currentDate, tasks);
      }

      if (result.action === 'CREATE') {
        const newItems: TaskItem[] = result.tasks.map((t) => {
          const cId = cleanTaskId(t.id);
          return {
            ...t,
            id: cId,
            status: t.status || '未开始',
            completed_at: t.status === '已完成' ? (t.completed_at || currentDate) : null,
            created_at: t.created_at || new Date().toISOString().replace('T', ' ').slice(0, 16),
          };
        });

        setTasks((prev) => {
          const newMap = new Map(newItems.map((n) => [cleanTaskId(n.id), n]));
          const updatedPrev = prev.map((item) => {
            const cId = cleanTaskId(item.id);
            return newMap.has(cId) ? { ...item, ...newMap.get(cId)! } : item;
          });
          const existingIds = new Set(prev.map((i) => cleanTaskId(i.id)));
          const completelyNew = newItems.filter((i) => !existingIds.has(cleanTaskId(i.id)));
          const combined = [...completelyNew, ...updatedPrev];
          combined.sort((a, b) => compareTaskIds(a.id, b.id));
          return combined;
        });

        if (newItems.length > 0) {
          setRecentlyUpdatedId(newItems[0].id);
          setTimeout(() => setRecentlyUpdatedId(null), 3500);
        }

        for (const item of newItems) {
          try {
            await setDoc(doc(db, 'tasks', item.id), item, { merge: true });
          } catch (cloudErr) {
            console.warn('[Firebase] Firestore write note:', cloudErr);
          }
        }

        const ids = newItems.map((t) => `#${t.id}`).join('、');
        showNotification(`已新增任务 ${ids}，已存入云端数据库！`, 'success');
      } else if (result.action === 'UPDATE_STATUS') {
        const idMap = new Map<string, TaskItem>();
        const titleMap = new Map<string, TaskItem>();

        result.tasks.forEach((t) => {
          const cId = cleanTaskId(t.id);
          const normalized = { ...t, id: cId };
          if (cId) idMap.set(cId, normalized);
          if (t.title) titleMap.set(t.title.trim().toLowerCase(), normalized);
        });

        const matchedIds = new Set<string>();

        setTasks((prev) => {
          const nextTasks = prev.map((item) => {
            const cId = cleanTaskId(item.id);
            const titleKey = item.title.trim().toLowerCase();
            const updateData = idMap.get(cId) || titleMap.get(titleKey);

            if (updateData) {
              matchedIds.add(cId);
              const targetStatus = updateData.status || item.status;
              const completedAt =
                targetStatus === '已完成'
                  ? updateData.completed_at || currentDate
                  : null;

              return {
                ...item,
                title:
                  updateData.title &&
                  updateData.title !== `任务 ${cId}` &&
                  updateData.title !== `任务 ${item.id}`
                    ? updateData.title
                    : item.title,
                status: targetStatus,
                completed_at: completedAt,
                priority: updateData.priority || item.priority,
                deadline: updateData.deadline || item.deadline,
              };
            }
            return item;
          });

          // If any updated task didn't exist in prev, insert it at the beginning so it is never lost
          for (const t of result.tasks) {
            const cId = cleanTaskId(t.id);
            if (!matchedIds.has(cId) && !prev.some((p) => cleanTaskId(p.id) === cId)) {
              nextTasks.unshift({
                id: cId || getNextSequence(getDayPrefix(currentDate), prev),
                title: t.title || `任务 ${cId}`,
                priority: t.priority || '中',
                deadline: t.deadline || '当天',
                status: t.status || '未开始',
                completed_at: t.status === '已完成' ? (t.completed_at || currentDate) : null,
                created_at: new Date().toISOString().replace('T', ' ').slice(0, 16),
              });
            }
          }

          nextTasks.sort((a, b) => compareTaskIds(a.id, b.id));
          return nextTasks;
        });

        // Highlight the updated task in the table
        const firstUpdated = result.tasks[0];
        if (firstUpdated) {
          const firstId = cleanTaskId(firstUpdated.id);
          setRecentlyUpdatedId(firstId);
          setTimeout(() => setRecentlyUpdatedId(null), 3500);
        }

        // 异步更新到 Firebase Firestore 云端数据库
        for (const t of result.tasks) {
          const cId = cleanTaskId(t.id);
          if (!cId) continue;
          try {
            const completedAt = t.status === '已完成' ? (t.completed_at || currentDate) : null;
            await setDoc(
              doc(db, 'tasks', cId),
              {
                id: cId,
                status: t.status,
                completed_at: completedAt,
                ...(t.title && !t.title.startsWith('任务 ') ? { title: t.title } : {}),
                ...(t.priority ? { priority: t.priority } : {}),
                ...(t.deadline ? { deadline: t.deadline } : {}),
              },
              { merge: true }
            );
          } catch (cloudErr) {
            console.warn('[Firebase] Firestore update note:', cloudErr);
          }
        }

        const updatedIds = result.tasks
          .map((t) => `#${cleanTaskId(t.id)}`)
          .filter(Boolean)
          .join('、');
        const hasCompleted = result.tasks.some((t) => t.status === '已完成');
        if (hasCompleted) {
          showNotification(`已更新任务 ${updatedIds || '明细'}（已核销任务已归档至历史任务）！`, 'success');
        } else {
          showNotification(`已更新任务 ${updatedIds || '明细'} 状态并同步到云端！`, 'success');
        }
      } else if (result.action === 'CREATE_RECURRING' && result.recurringTasks && result.recurringTasks.length > 0) {
        for (const item of result.recurringTasks) {
          await handleAddRecurringTask(item);
        }
        setActiveTab('recurring');
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

  // 4. 周期任务操作（增、改、删、派发）
  const handleAddRecurringTask = async (item: Omit<RecurringTaskItem, 'id'>) => {
    const newId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newItem: RecurringTaskItem = {
      ...item,
      id: newId,
    };

    setRecurringTasks((prev) => {
      const next = [...prev, newItem];
      next.sort(compareRecurringTasks);
      return next;
    });

    try {
      await setDoc(doc(db, 'recurring_tasks', newId), newItem);
    } catch (cloudErr) {
      console.warn('[Firebase] Recurring write note:', cloudErr);
    }

    showNotification(`已新增周期任务「${newItem.title}」，已同步至云端！`, 'success');
  };

  const handleUpdateRecurringTask = async (id: string, updates: Partial<RecurringTaskItem>) => {
    setRecurringTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...updates } : t));
      next.sort(compareRecurringTasks);
      return next;
    });

    try {
      await setDoc(doc(db, 'recurring_tasks', id), updates, { merge: true });
    } catch (cloudErr) {
      console.warn('[Firebase] Recurring update note:', cloudErr);
    }

    showNotification(`已更新周期任务「${updates.title || '信息'}」！`, 'success');
  };

  const handleDeleteRecurringTask = async (id: string) => {
    setRecurringTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteDoc(doc(db, 'recurring_tasks', id));
    } catch (cloudErr) {
      console.warn('[Firebase] Recurring delete note:', cloudErr);
    }
    showNotification('已删除该周期任务', 'info');
  };

  // 将周期任务快捷派生为今日待办任务
  const handleDispatchRecurringToActive = async (item: RecurringTaskItem) => {
    const dayPrefix = getDayPrefix(currentDate);
    const newId = getNextSequence(dayPrefix, tasks);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);

    const newTask: TaskItem = {
      id: newId,
      title: item.title,
      priority: item.period === '日' ? '高' : '中',
      deadline: '当天',
      status: '进行中',
      completed_at: null,
      created_at: nowStr,
      notes: `由周期任务派发（周期：${item.period}，规则：${item.deadline}）`,
    };

    setTasks((prev) => {
      const next = [newTask, ...prev];
      next.sort((a, b) => compareTaskIds(a.id, b.id));
      return next;
    });

    setRecentlyUpdatedId(newId);
    setTimeout(() => setRecentlyUpdatedId(null), 3500);

    try {
      await setDoc(doc(db, 'tasks', newId), newTask);
    } catch (cloudErr) {
      console.warn('[Firebase] Dispatch task note:', cloudErr);
    }

    setActiveTab('active');
    showNotification(`已将周期任务「${item.title}」派发为待办任务 #${newId}！`, 'success');
  };

  // 5. 状态变更（含核销）并推送到 Firestore
  const handleUpdateStatus = async (taskId: string, newStatus: TaskStatus) => {
    const cId = cleanTaskId(taskId);
    const completedAt = newStatus === '已完成' ? currentDate : null;

    setTasks((prev) =>
      prev.map((t) => {
        if (cleanTaskId(t.id) === cId) {
          return {
            ...t,
            status: newStatus,
            completed_at: completedAt,
          };
        }
        return t;
      })
    );

    setRecentlyUpdatedId(cId);
    setTimeout(() => setRecentlyUpdatedId(null), 3500);

    try {
      await setDoc(
        doc(db, 'tasks', cId),
        {
          id: cId,
          status: newStatus,
          completed_at: completedAt,
        },
        { merge: true }
      );
    } catch (cloudErr) {
      console.warn('[Firebase] Firestore status update note:', cloudErr);
    }

    if (newStatus === '已完成') {
      showNotification(`任务 #${cId} 已核销，已移入历史任务库！`, 'success');
    } else {
      showNotification(`任务 #${cId} 已恢复为「${newStatus}」，已重新放回待办明细！`, 'success');
    }
  };

  // 6. 删除任务并从 Firestore 移除
  const handleDeleteTask = async (taskId: string) => {
    const cId = cleanTaskId(taskId);
    setTasks((prev) => prev.filter((t) => cleanTaskId(t.id) !== cId));
    try {
      await deleteDoc(doc(db, 'tasks', cId));
    } catch (cloudErr) {
      console.warn('[Firebase] Firestore delete note:', cloudErr);
    }
    showNotification(`已删除任务 #${cId}`, 'info');
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
      {/* 顶部标题与汇总栏（含待办、进行中、未开始、已核销、周期任务快捷切换） */}
      <Header
        tasks={tasks}
        recurringCount={recurringTasks.length}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />


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

        {/* 任务追踪清单（含主页待办明细、历史任务归档与周期任务明细标签页） */}
        <TaskList
          tasks={tasks}
          recurringTasks={recurringTasks}
          onUpdateStatus={handleUpdateStatus}
          onDeleteTask={handleDeleteTask}
          recentlyUpdatedId={recentlyUpdatedId}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onAddRecurringTask={handleAddRecurringTask}
          onUpdateRecurringTask={handleUpdateRecurringTask}
          onDeleteRecurringTask={handleDeleteRecurringTask}
          onDispatchRecurringToActive={handleDispatchRecurringToActive}
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
