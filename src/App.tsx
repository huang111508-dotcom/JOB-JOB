/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { TaskInput } from './components/TaskInput';
import { TaskList, isTaskOverdue, formatShortDate } from './components/TaskList';
import { PasswordLock } from './components/PasswordLock';
import { AdminPanelModal } from './components/AdminPanelModal';
import { INITIAL_TASKS } from './data/initialTasks';
import { INITIAL_RECURRING_TASKS } from './data/initialRecurringTasks';
import {
  ParseResult,
  TaskItem,
  TaskStatus,
  ActiveTabType,
  RecurringTaskItem,
  UserAccount,
} from './types';
import {
  parseTasksLocally,
  cleanTaskId,
  compareTaskIds,
  getDayPrefix,
  getNextSequence,
} from './utils/taskParser';
import { compareRecurringTasks, formatRecurringDeadline } from './utils/recurringUtils';
import {
  DEFAULT_USERNAME,
  initUserSystem,
  authenticateUser,
  updateUserPassword,
  getCurrentSession,
  setCurrentSession,
  verifyAdminPassword,
  sanitizeUsername,
  getAllUsers,
  ADMIN_PASSWORD_FIXED,
} from './utils/authService';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  Cloud,
  Lock,
  Key,
  ShieldAlert,
  UserCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
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

  // 当前登录用户会话
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    return getCurrentSession();
  });

  // 管理员后台模态框状态
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [showAdminAuthModal, setShowAdminAuthModal] = useState(false);
  const [adminAuthInput, setAdminAuthInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');

  // 修改密码模态框状态
  const [showChangePwdModal, setShowChangePwdModal] = useState(false);
  const [changeOldPwd, setChangeOldPwd] = useState('');
  const [changeNewPwd, setChangeNewPwd] = useState('');
  const [changeConfirmPwd, setChangeConfirmPwd] = useState('');
  const [showPwdText, setShowPwdText] = useState(false);
  const [changePwdError, setChangePwdError] = useState('');

  // 初始化用户系统
  useEffect(() => {
    initUserSystem().catch((e) => console.warn('User system init note:', e));
  }, []);

  // 全量任务（包含所有用户，默认历史数据属于 dakbo）
  const [allTasks, setAllTasks] = useState<TaskItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((t: TaskItem) => {
            let d = t.deadline;
            if (d === '当天' || d === '今天') {
              d = t.created_at ? t.created_at.slice(0, 10) : '2026-09-22';
            }
            return {
              ...t,
              deadline: d,
              username: t.username || DEFAULT_USERNAME,
            };
          });
        }
      }
    } catch (e) {
      console.error('Failed to load tasks from localStorage', e);
    }
    return INITIAL_TASKS.map((t) => ({ ...t, username: DEFAULT_USERNAME }));
  });

  // 全量周期任务（包含所有用户，默认历史数据属于 dakbo）
  const [allRecurringTasks, setAllRecurringTasks] = useState<RecurringTaskItem[]>(() => {
    try {
      const saved = localStorage.getItem(RECURRING_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((r: RecurringTaskItem) => ({
            ...r,
            username: r.username || DEFAULT_USERNAME,
          }));
        }
      }
    } catch (e) {
      console.error('Failed to load recurring tasks from localStorage', e);
    }
    return INITIAL_RECURRING_TASKS.map((r) => ({ ...r, username: DEFAULT_USERNAME }));
  });

  const [isLoading, setIsLoading] = useState(false);
  const [cloudSynced, setCloudSynced] = useState<boolean | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  const showNotification = (
    message: string,
    type: 'success' | 'info' | 'error' = 'success'
  ) => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // 当前用户所属的任务明细
  const currentUsername = currentUser?.username || DEFAULT_USERNAME;

  const userTasks = useMemo(() => {
    return allTasks
      .filter((t) => sanitizeUsername(t.username || DEFAULT_USERNAME) === sanitizeUsername(currentUsername))
      .sort((a, b) => compareTaskIds(a.id, b.id));
  }, [allTasks, currentUsername]);

  const userRecurringTasks = useMemo(() => {
    return allRecurringTasks
      .filter((r) => sanitizeUsername(r.username || DEFAULT_USERNAME) === sanitizeUsername(currentUsername))
      .sort(compareRecurringTasks);
  }, [allRecurringTasks, currentUsername]);

  const overdueCount = useMemo(() => {
    return userTasks.filter((t) => isTaskOverdue(t, currentDate)).length;
  }, [userTasks, currentDate]);

  // 生成 Firestore 中文档唯一 ID，防止多用户间同名 sequence 冲突
  const getTaskDocId = (task: TaskItem) => {
    const u = sanitizeUsername(task.username || currentUsername);
    const cid = cleanTaskId(task.id);
    return u === sanitizeUsername(DEFAULT_USERNAME) ? cid : `${u}_${cid}`;
  };

  // 1. 监听 Firebase Firestore 云端数据库，实时同步任务与周期任务
  useEffect(() => {
    let unsubscribeTasks = () => {};
    let unsubscribeRecurring = () => {};

    try {
      // 1.1 常规任务集合同步
      const tasksColRef = collection(db, 'tasks');
      getDocs(tasksColRef)
        .then((snapshot) => {
          if (snapshot.empty) {
            // 初始化将 legacy tasks 写入云端，全量标记为 dakbo
            INITIAL_TASKS.forEach((t) => {
              const item = { ...t, username: DEFAULT_USERNAME };
              setDoc(doc(db, 'tasks', t.id), item).catch(() => {});
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
                username: data.username || DEFAULT_USERNAME,
              });
            });
            remoteTasks.sort((a, b) => compareTaskIds(a.id, b.id));
            setAllTasks(remoteTasks);
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
              const item = { ...t, username: DEFAULT_USERNAME };
              setDoc(doc(db, 'recurring_tasks', t.id), item).catch(() => {});
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
              const data = d.data() as RecurringTaskItem;
              remoteRecurring.push({
                ...data,
                username: data.username || DEFAULT_USERNAME,
              });
            });
            remoteRecurring.sort(compareRecurringTasks);
            setAllRecurringTasks(remoteRecurring);
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
  }, []);

  // 2. 本地持久化缓存兜底备份
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allTasks));
    } catch (e) {
      console.error('Failed to save tasks', e);
    }
  }, [allTasks]);

  useEffect(() => {
    try {
      localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(allRecurringTasks));
    } catch (e) {
      console.error('Failed to save recurring tasks', e);
    }
  }, [allRecurringTasks]);

  // 登录验证逻辑
  const handleLogin = async (usernameInput: string, passwordInput: string) => {
    const res = await authenticateUser(usernameInput, passwordInput);
    if (res.success && res.user) {
      setCurrentUser(res.user);
      setCurrentSession(res.user);
      showNotification(`欢迎回来，${res.user.username}！已进入您的任务空间。`, 'success');
      return { success: true };
    }
    return { success: false, message: res.message || '登录失败' };
  };

  // 登出 / 切换账号
  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentSession(null);
    showNotification('已退出登录，请重新选择账号登录', 'info');
  };

  // 管理员密码验证
  const handleVerifyAdmin = (passwordInput: string) => {
    return verifyAdminPassword(passwordInput);
  };

  // 从顶栏触发管理员后台验证
  const handleOpenAdminFromHeader = () => {
    setShowAdminAuthModal(true);
    setAdminAuthInput('');
    setAdminAuthError('');
  };

  const handleAdminAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminAuthInput.trim()) {
      setAdminAuthError('请输入后台管理密码');
      return;
    }
    if (verifyAdminPassword(adminAuthInput.trim())) {
      setShowAdminAuthModal(false);
      setIsAdminModalOpen(true);
      setAdminAuthInput('');
      setAdminAuthError('');
    } else {
      setAdminAuthError('后台管理密码错误（提示：固定密码为 admin888）');
    }
  };

  // 从管理后台直接切换测试账号
  const handleSwitchUserFromAdmin = async (targetUsername: string) => {
    const allUsers = await getAllUsers();
    const user = allUsers.find(
      (u) => sanitizeUsername(u.username) === sanitizeUsername(targetUsername)
    );
    if (user) {
      setCurrentUser(user);
      setCurrentSession(user);
      showNotification(`已切换为账号「${user.username}」的工作空间`, 'success');
    }
  };

  // 修改密码（普通使用者仅可修改密码，不可修改账号名）
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePwdError('');

    if (!currentUser) return;
    if (!changeOldPwd.trim()) {
      setChangePwdError('请输入当前原密码进行安全核验');
      return;
    }

    // 核验原密码
    const authCheck = await authenticateUser(currentUser.username, changeOldPwd.trim());
    if (!authCheck.success) {
      setChangePwdError('原密码核验不通过，请重新输入');
      return;
    }

    if (!changeNewPwd || changeNewPwd.length < 4) {
      setChangePwdError('新密码至少需要 4 位字符');
      return;
    }

    if (changeNewPwd !== changeConfirmPwd) {
      setChangePwdError('两次输入的新密码不一致');
      return;
    }

    const res = await updateUserPassword(currentUser.username, changeNewPwd.trim());
    if (res.success) {
      showNotification('密码修改成功！下次请使用新密码登录。', 'success');
      setShowChangePwdModal(false);
      setChangeOldPwd('');
      setChangeNewPwd('');
      setChangeConfirmPwd('');
      setChangePwdError('');
    } else {
      setChangePwdError(res.message);
    }
  };

  // 3. 自然语言智能解析（当前用户空间隔离，自动打上 username 标签）
  const handleParse = async (userInput: string) => {
    if (!currentUser) return;
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
            existingTasks: userTasks,
          }),
        });

        if (response.ok) {
          result = await response.json();
        } else {
          console.warn(`[Parse] API responded with ${response.status}. Using smart local parser.`);
          result = parseTasksLocally(userInput, currentDate, userTasks);
        }
      } catch (networkErr) {
        console.warn('[Parse] Network or serverless route unavailable. Using smart local parser:', networkErr);
        result = parseTasksLocally(userInput, currentDate, userTasks);
      }

      if (result.action === 'CREATE') {
        const newItems: TaskItem[] = result.tasks.map((t) => {
          const cId = cleanTaskId(t.id);
          return {
            ...t,
            id: cId,
            username: currentUser.username,
            status: t.status || '未开始',
            completed_at: t.status === '已完成' ? (t.completed_at || currentDate) : null,
            created_at: t.created_at || new Date().toISOString().replace('T', ' ').slice(0, 16),
          };
        });

        setAllTasks((prev) => {
          const newMap = new Map(newItems.map((n) => [cleanTaskId(n.id), n]));
          const updatedPrev = prev.map((item) => {
            const isSameUser =
              sanitizeUsername(item.username || DEFAULT_USERNAME) === sanitizeUsername(currentUser.username);
            const cId = cleanTaskId(item.id);
            if (isSameUser && newMap.has(cId)) {
              return { ...item, ...newMap.get(cId)!, username: currentUser.username };
            }
            return item;
          });

          const existingUserIds = new Set(
            prev
              .filter(
                (i) =>
                  sanitizeUsername(i.username || DEFAULT_USERNAME) === sanitizeUsername(currentUser.username)
              )
              .map((i) => cleanTaskId(i.id))
          );
          const completelyNew = newItems.filter((i) => !existingUserIds.has(cleanTaskId(i.id)));
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
            const docId = getTaskDocId(item);
            await setDoc(doc(db, 'tasks', docId), item, { merge: true });
          } catch (cloudErr) {
            console.warn('[Firebase] Firestore write note:', cloudErr);
          }
        }

        const ids = newItems.map((t) => `#${t.id}`).join('、');
        showNotification(`已新增任务 ${ids}（归属账号：${currentUser.username}），已存入云端！`, 'success');
      } else if (result.action === 'UPDATE_STATUS') {
        const idMap = new Map<string, TaskItem>();
        const titleMap = new Map<string, TaskItem>();

        result.tasks.forEach((t) => {
          const cId = cleanTaskId(t.id);
          const normalized = { ...t, id: cId, username: currentUser.username };
          if (cId) idMap.set(cId, normalized);
          if (t.title) titleMap.set(t.title.trim().toLowerCase(), normalized);
        });

        const matchedIds = new Set<string>();
        const hasExplicitDateInInput = /(?:截止|截至|限期|到期|改期|延期)\s*(?:\d{1,2}\.\d{1,2}|\d{4}-\d{2}-\d{2}|明天|后天|下周)/.test(userInput);

        setAllTasks((prev) => {
          const nextTasks = prev.map((item) => {
            const isSameUser =
              sanitizeUsername(item.username || DEFAULT_USERNAME) === sanitizeUsername(currentUser.username);
            if (!isSameUser) return item;

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

              const finalDeadline =
                hasExplicitDateInInput && updateData.deadline && updateData.deadline !== item.deadline
                  ? updateData.deadline
                  : item.deadline;

              return {
                ...item,
                username: currentUser.username,
                title:
                  updateData.title &&
                  updateData.title !== `任务 ${cId}` &&
                  updateData.title !== `任务 ${item.id}`
                    ? updateData.title
                    : item.title,
                status: targetStatus,
                completed_at: completedAt,
                priority: updateData.priority || item.priority,
                deadline: finalDeadline,
              };
            }
            return item;
          });

          // 如果任务在当前用户的任务库中不存在，则自动补入
          for (const t of result.tasks) {
            const cId = cleanTaskId(t.id);
            if (!matchedIds.has(cId) && !userTasks.some((p) => cleanTaskId(p.id) === cId)) {
              nextTasks.unshift({
                id: cId || getNextSequence(getDayPrefix(currentDate), userTasks),
                username: currentUser.username,
                title: t.title || `任务 ${cId}`,
                priority: t.priority || '中',
                deadline: t.deadline || currentDate,
                status: t.status || '未开始',
                completed_at: t.status === '已完成' ? (t.completed_at || currentDate) : null,
                created_at: new Date().toISOString().replace('T', ' ').slice(0, 16),
              });
            }
          }

          nextTasks.sort((a, b) => compareTaskIds(a.id, b.id));
          return nextTasks;
        });

        const firstUpdated = result.tasks[0];
        if (firstUpdated) {
          const firstId = cleanTaskId(firstUpdated.id);
          setRecentlyUpdatedId(firstId);
          setTimeout(() => setRecentlyUpdatedId(null), 3500);
        }

        // 异步更新到 Firebase Firestore
        for (const t of result.tasks) {
          const cId = cleanTaskId(t.id);
          if (!cId) continue;
          try {
            const completedAt = t.status === '已完成' ? (t.completed_at || currentDate) : null;
            const docId = getTaskDocId({ ...t, id: cId, username: currentUser.username } as TaskItem);
            await setDoc(
              doc(db, 'tasks', docId),
              {
                id: cId,
                username: currentUser.username,
                status: t.status,
                completed_at: completedAt,
                ...(t.title && !t.title.startsWith('任务 ') ? { title: t.title } : {}),
                ...(t.priority ? { priority: t.priority } : {}),
                ...(hasExplicitDateInInput && t.deadline ? { deadline: t.deadline } : {}),
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

  // 4. 周期任务操作（自动打上当前登录用户 username 标签）
  const handleAddRecurringTask = async (item: Omit<RecurringTaskItem, 'id'>) => {
    if (!currentUser) return;
    const newId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newItem: RecurringTaskItem = {
      ...item,
      id: newId,
      username: currentUser.username,
    };

    setAllRecurringTasks((prev) => {
      const next = [...prev, newItem];
      next.sort(compareRecurringTasks);
      return next;
    });

    try {
      await setDoc(doc(db, 'recurring_tasks', newId), newItem);
    } catch (cloudErr) {
      console.warn('[Firebase] Recurring write note:', cloudErr);
    }

    showNotification(`已为「${currentUser.username}」新增周期任务「${newItem.title}」！`, 'success');
  };

  const handleUpdateRecurringTask = async (id: string, updates: Partial<RecurringTaskItem>) => {
    if (!currentUser) return;
    setAllRecurringTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...updates, username: t.username || currentUser.username } : t));
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
    setAllRecurringTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteDoc(doc(db, 'recurring_tasks', id));
    } catch (cloudErr) {
      console.warn('[Firebase] Recurring delete note:', cloudErr);
    }
    showNotification('已删除该周期任务', 'info');
  };

  // 将周期任务派生为当前使用者的今日待办任务
  const handleDispatchRecurringToActive = async (item: RecurringTaskItem) => {
    if (!currentUser) return;
    const dayPrefix = getDayPrefix(currentDate);
    const newId = getNextSequence(dayPrefix, userTasks);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);

    const newTask: TaskItem = {
      id: newId,
      username: currentUser.username,
      title: item.title,
      priority: item.period === '日' ? '高' : '中',
      deadline: currentDate,
      status: '进行中',
      completed_at: null,
      created_at: nowStr,
      notes: `由周期任务派发（周期：${item.period}，规则：${formatRecurringDeadline(item.deadline)}）`,
    };

    setAllTasks((prev) => {
      const next = [newTask, ...prev];
      next.sort((a, b) => compareTaskIds(a.id, b.id));
      return next;
    });

    setRecentlyUpdatedId(newId);
    setTimeout(() => setRecentlyUpdatedId(null), 3500);

    try {
      const docId = getTaskDocId(newTask);
      await setDoc(doc(db, 'tasks', docId), newTask);
    } catch (cloudErr) {
      console.warn('[Firebase] Dispatch task note:', cloudErr);
    }

    setActiveTab('active');
    showNotification(`已为「${currentUser.username}」派发待办任务 #${newId}！`, 'success');
  };

  // 5. 任务状态变更
  const handleUpdateStatus = async (taskId: string, newStatus: TaskStatus) => {
    if (!currentUser) return;
    const cId = cleanTaskId(taskId);
    const completedAt = newStatus === '已完成' ? currentDate : null;

    setAllTasks((prev) =>
      prev.map((t) => {
        const isSameUser =
          sanitizeUsername(t.username || DEFAULT_USERNAME) === sanitizeUsername(currentUser.username);
        if (isSameUser && cleanTaskId(t.id) === cId) {
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
      const targetTask = userTasks.find((t) => cleanTaskId(t.id) === cId);
      const docId = targetTask ? getTaskDocId(targetTask) : cId;
      await setDoc(
        doc(db, 'tasks', docId),
        {
          id: cId,
          username: currentUser.username,
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

  // 5.2 截止日期点选修改
  const handleUpdateDeadline = async (taskId: string, newDeadline: string) => {
    if (!currentUser) return;
    const cId = cleanTaskId(taskId);
    setAllTasks((prev) =>
      prev.map((t) => {
        const isSameUser =
          sanitizeUsername(t.username || DEFAULT_USERNAME) === sanitizeUsername(currentUser.username);
        if (isSameUser && cleanTaskId(t.id) === cId) {
          return {
            ...t,
            deadline: newDeadline,
          };
        }
        return t;
      })
    );

    setRecentlyUpdatedId(cId);
    setTimeout(() => setRecentlyUpdatedId(null), 3500);

    try {
      const targetTask = userTasks.find((t) => cleanTaskId(t.id) === cId);
      const docId = targetTask ? getTaskDocId(targetTask) : cId;
      await setDoc(
        doc(db, 'tasks', docId),
        {
          id: cId,
          username: currentUser.username,
          deadline: newDeadline,
        },
        { merge: true }
      );
    } catch (cloudErr) {
      console.warn('[Firebase] Firestore deadline update note:', cloudErr);
    }

    showNotification(`已将任务 #${cId} 截止日期修改为 ${formatShortDate(newDeadline)}！`, 'success');
  };

  // 6. 删除任务
  const handleDeleteTask = async (taskId: string) => {
    if (!currentUser) return;
    const cId = cleanTaskId(taskId);
    const targetTask = userTasks.find((t) => cleanTaskId(t.id) === cId);
    const docId = targetTask ? getTaskDocId(targetTask) : cId;

    setAllTasks((prev) =>
      prev.filter((t) => {
        const isSameUser =
          sanitizeUsername(t.username || DEFAULT_USERNAME) === sanitizeUsername(currentUser.username);
        if (isSameUser && cleanTaskId(t.id) === cId) {
          return false;
        }
        return true;
      })
    );

    try {
      await deleteDoc(doc(db, 'tasks', docId));
    } catch (cloudErr) {
      console.warn('[Firebase] Firestore delete note:', cloudErr);
    }
    showNotification(`已删除任务 #${cId}`, 'info');
  };

  // 如果未登录，展示多用户登录界面（含后台管理员入口）
  if (!currentUser) {
    return (
      <>
        <PasswordLock
          onLogin={handleLogin}
          onAdminOpen={() => setIsAdminModalOpen(true)}
          onVerifyAdminPassword={handleVerifyAdmin}
        />

        {/* 管理员后台模态框（支持从登录界面直接呼出并管理账号） */}
        <AdminPanelModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          allTasks={allTasks}
          allRecurringTasks={allRecurringTasks}
          onSwitchUser={handleSwitchUserFromAdmin}
          onNotification={showNotification}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* 顶部标题与汇总栏（含当前用户标牌、切换账号、修改密码与管理员后台入口） */}
      <Header
        tasks={userTasks}
        recurringCount={userRecurringTasks.length}
        overdueCount={overdueCount}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        onChangePassword={() => {
          setShowChangePwdModal(true);
          setChangeOldPwd('');
          setChangeNewPwd('');
          setChangeConfirmPwd('');
          setChangePwdError('');
        }}
        onOpenAdmin={handleOpenAdminFromHeader}
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
        {/* 安全状态、多用户指示与云端状态条 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 px-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Cloud className={`h-3.5 w-3.5 ${cloudSynced ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span>
                {cloudSynced
                  ? 'Firebase Firestore 云端多端实时同步中'
                  : '本地就绪 · Firebase 实时监听'}
              </span>
            </div>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-1 text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block"></span>
              <span>独立工作区：<strong className="text-slate-800">{currentUser.username}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenAdminFromHeader}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
              title="输入后台固定密码 admin888 访问管理控制台"
            >
              <ShieldAlert className="h-3 w-3 text-blue-600" />
              <span>后台管理</span>
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => {
                setShowChangePwdModal(true);
                setChangeOldPwd('');
                setChangeNewPwd('');
                setChangeConfirmPwd('');
                setChangePwdError('');
              }}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
              title="修改当前使用者密码"
            >
              <Key className="h-3 w-3" />
              <span>修改密码</span>
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
              title="退出登录"
            >
              <Lock className="h-3 w-3" />
              <span>退出</span>
            </button>
          </div>
        </div>

        {/* 指令输入框与提交按钮 */}
        <TaskInput onParse={handleParse} isLoading={isLoading} />

        {/* 任务追踪清单（展示当前用户的专属待办明细、历史任务归档与周期任务明细） */}
        <TaskList
          tasks={userTasks}
          recurringTasks={userRecurringTasks}
          onUpdateStatus={handleUpdateStatus}
          onUpdateDeadline={handleUpdateDeadline}
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

      {/* 修改密码弹窗（强调：只可修改密码，不可修改账号名） */}
      {showChangePwdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 mb-1">
              <Key className="h-5 w-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">修改登录密码</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              账号名为系统唯一标识不可修改；您可以随时修改登录密码。
            </p>

            <form onSubmit={handleChangePasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  当前账号名 <span className="text-[10px] text-slate-400 font-normal">（不可修改）</span>
                </label>
                <input
                  type="text"
                  disabled
                  value={currentUser.username}
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 py-2 px-3 text-xs text-slate-500 cursor-not-allowed select-none font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  当前原密码
                </label>
                <input
                  type={showPwdText ? 'text' : 'password'}
                  autoFocus
                  value={changeOldPwd}
                  onChange={(e) => {
                    setChangeOldPwd(e.target.value);
                    if (changePwdError) setChangePwdError('');
                  }}
                  placeholder="请输入当前原密码"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs focus:bg-white focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  新密码（至少4位）
                </label>
                <div className="relative">
                  <input
                    type={showPwdText ? 'text' : 'password'}
                    value={changeNewPwd}
                    onChange={(e) => {
                      setChangeNewPwd(e.target.value);
                      if (changePwdError) setChangePwdError('');
                    }}
                    placeholder="请输入新密码"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-9 px-3 text-xs focus:bg-white focus:border-blue-600 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwdText(!showPwdText)}
                    className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPwdText ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  确认新密码
                </label>
                <input
                  type={showPwdText ? 'text' : 'password'}
                  value={changeConfirmPwd}
                  onChange={(e) => {
                    setChangeConfirmPwd(e.target.value);
                    if (changePwdError) setChangePwdError('');
                  }}
                  placeholder="请再次输入新密码"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs focus:bg-white focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              {changePwdError && (
                <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-600 font-medium border border-rose-100 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{changePwdError}</span>
                </div>
              )}

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

      {/* 管理员验证弹窗（固定密码 admin888） */}
      {showAdminAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base mb-1">
              <ShieldAlert className="h-5 w-5 text-blue-600" />
              <h3>管理员身份验证</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              请输入固定的后台管理密码（固定：admin888）以进入控制台。
            </p>

            <form onSubmit={handleAdminAuthSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  管理密码
                </label>
                <input
                  type="password"
                  autoFocus
                  value={adminAuthInput}
                  onChange={(e) => {
                    setAdminAuthInput(e.target.value);
                    if (adminAuthError) setAdminAuthError('');
                  }}
                  placeholder="请输入后台管理密码"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              {adminAuthError && (
                <p className="text-xs text-rose-600 font-medium">{adminAuthError}</p>
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
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
                >
                  验证进入
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 管理员后台管理弹窗 */}
      <AdminPanelModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        allTasks={allTasks}
        allRecurringTasks={allRecurringTasks}
        onSwitchUser={handleSwitchUserFromAdmin}
        onNotification={showNotification}
      />
    </div>
  );
}
