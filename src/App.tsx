/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { TaskInput } from './components/TaskInput';
import { TaskList } from './components/TaskList';
import { INITIAL_TASKS } from './data/initialTasks';
import { ParseResult, TaskItem, TaskStatus } from './types';
import { CheckCircle2, AlertTriangle, Info, Cloud } from 'lucide-react';
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

export default function App() {
  const currentDate = '2026-09-22';

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
    let unsubscribe = () => {};

    try {
      const tasksColRef = collection(db, 'tasks');

      // 先检查云端是否有历史数据，若云端完全为空则做一次友好初始化种子注入
      getDocs(tasksColRef)
        .then((snapshot) => {
          if (snapshot.empty) {
            // 云端为空，将初始数据安全写入 Firebase
            INITIAL_TASKS.forEach((t) => {
              setDoc(doc(db, 'tasks', t.id), t).catch(() => {});
            });
          }
        })
        .catch((err) => {
          console.warn('[Firebase] Initial check note:', err);
        });

      // 实时监听变更
      unsubscribe = onSnapshot(
        tasksColRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteTasks: TaskItem[] = [];
            snapshot.forEach((d) => {
              remoteTasks.push(d.data() as TaskItem);
            });
            // 按照编号倒序或创建时间排序
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
          // 如果 Firestore 规则尚未配置或网络受限，自动使用本地离线持久化
          setCloudSynced(false);
        }
      );
    } catch (e) {
      console.warn('[Firebase] Setup warning:', e);
      setCloudSynced(false);
    }

    return () => unsubscribe();
  }, []);

  // 2. 本地持久化缓存兜底备份
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      console.error('Failed to save tasks', e);
    }
  }, [tasks]);

  const showNotification = (
    message: string,
    type: 'success' | 'info' | 'error' = 'success'
  ) => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3500);
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

        // 写入本地
        setTasks((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const filteredNew = newItems.filter((i) => !existingIds.has(i.id));
          return [...filteredNew, ...prev];
        });

        // 异步持久化到 Firebase Firestore 云端
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

        // 更新本地
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

        // 异步更新到 Firebase Firestore 云端
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

    // 先本地更新 UI（体验极其丝滑）
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

    // 写入 Firebase Firestore
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
        {/* 云端数据同步状态标识 */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <div className="flex items-center gap-1.5">
            <Cloud className={`h-3.5 w-3.5 ${cloudSynced ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>
              {cloudSynced
                ? 'Firebase Firestore 云端持久化已连接'
                : '本地缓存就绪 · 已配置 Firebase 云端存储'}
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">jop-smart-task-tracker</span>
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
    </div>
  );
}
