import { db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { UserAccount } from '../types';

export const DEFAULT_USERNAME = 'dakbo';
export const ADMIN_PASSWORD_FIXED = 'admin888';

const USERS_STORAGE_KEY = 'smart_task_tracker_users_v2';
const CURRENT_USER_KEY = 'smart_task_tracker_active_user';
const LEGACY_PWD_KEY = 'smart_task_tracker_pwd_hash';

export function hashPassword(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'pwd_' + Math.abs(hash).toString(36) + '_' + str.length;
}

export function verifyPassword(inputPassword: string, storedHash: string): boolean {
  return hashPassword(inputPassword) === storedHash;
}

export function verifyAdminPassword(inputPassword: string): boolean {
  return inputPassword.trim() === ADMIN_PASSWORD_FIXED;
}

export function sanitizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function getStoredLocalUsers(): UserAccount[] {
  try {
    const saved = localStorage.getItem(USERS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[Auth] Failed to load users from localStorage', e);
  }
  return [];
}

function saveLocalUsers(users: UserAccount[]): void {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    console.warn('[Auth] Failed to save users to localStorage', e);
  }
}

/**
 * 初始化用户系统，确保默认账号 "dakbo" 必定存在
 */
export async function initUserSystem(): Promise<UserAccount[]> {
  const localUsers = getStoredLocalUsers();
  let dakboUser = localUsers.find(
    (u) => sanitizeUsername(u.username) === sanitizeUsername(DEFAULT_USERNAME)
  );

  // 检查是否有之前旧版本的免密哈希
  const legacyHash = localStorage.getItem(LEGACY_PWD_KEY);
  const initialDakboHash = legacyHash || hashPassword('123456');

  if (!dakboUser) {
    dakboUser = {
      username: DEFAULT_USERNAME,
      passwordHash: initialDakboHash,
      createdAt: '2026-09-22 09:00',
      role: 'admin',
      notes: '系统默认账号（归属所有历史数据）',
    };
    localUsers.unshift(dakboUser);
    saveLocalUsers(localUsers);
  }

  // 云端 Firestore 同步与初始化
  try {
    const usersColRef = collection(db, 'users');
    const snapshot = await getDocs(usersColRef);
    const remoteUsers: UserAccount[] = [];

    snapshot.forEach((d) => {
      const data = d.data() as UserAccount;
      if (data && data.username) {
        remoteUsers.push(data);
      }
    });

    const hasRemoteDakbo = remoteUsers.some(
      (u) => sanitizeUsername(u.username) === sanitizeUsername(DEFAULT_USERNAME)
    );

    if (!hasRemoteDakbo) {
      // 写入 dakbo 到云端
      const dakboDocRef = doc(db, 'users', DEFAULT_USERNAME.toLowerCase());
      await setDoc(dakboDocRef, dakboUser, { merge: true });
      remoteUsers.unshift(dakboUser);
    }

    // 合并本地与远端用户（远端优先）
    const mergedMap = new Map<string, UserAccount>();
    localUsers.forEach((u) => mergedMap.set(sanitizeUsername(u.username), u));
    remoteUsers.forEach((u) => mergedMap.set(sanitizeUsername(u.username), u));

    const finalUsers = Array.from(mergedMap.values());
    saveLocalUsers(finalUsers);
    return finalUsers;
  } catch (err) {
    console.warn('[Auth] Firestore users check fallback to local:', err);
    return localUsers;
  }
}

/**
 * 获取所有用户列表
 */
export async function getAllUsers(): Promise<UserAccount[]> {
  try {
    const usersColRef = collection(db, 'users');
    const snapshot = await getDocs(usersColRef);
    if (!snapshot.empty) {
      const remoteUsers: UserAccount[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as UserAccount;
        if (data && data.username) {
          remoteUsers.push(data);
        }
      });
      // 确保包含 dakbo
      if (!remoteUsers.some((u) => sanitizeUsername(u.username) === sanitizeUsername(DEFAULT_USERNAME))) {
        remoteUsers.unshift({
          username: DEFAULT_USERNAME,
          passwordHash: hashPassword('123456'),
          createdAt: '2026-09-22 09:00',
          role: 'admin',
          notes: '系统默认账号',
        });
      }
      saveLocalUsers(remoteUsers);
      return remoteUsers;
    }
  } catch (err) {
    console.warn('[Auth] Remote fetch failed, using local users cache:', err);
  }
  return initUserSystem();
}

/**
 * 管理员添加新账号（账号名 + 初始密码）
 */
export async function addUser(
  username: string,
  initialPassword: string,
  notes?: string
): Promise<{ success: boolean; message: string; user?: UserAccount }> {
  const cleanName = username.trim();
  if (!cleanName) {
    return { success: false, message: '账号名不能为空' };
  }
  if (cleanName.length < 2 || cleanName.length > 20) {
    return { success: false, message: '账号名长度需在 2 到 20 个字符之间' };
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(cleanName)) {
    return { success: false, message: '账号名仅支持字母、数字、下划线或中文汉字' };
  }
  if (cleanName.toLowerCase() === 'admin') {
    return { success: false, message: '“admin”为系统后台预留名称，不可作为普通账号' };
  }
  if (!initialPassword || initialPassword.length < 4) {
    return { success: false, message: '初始密码至少需要 4 位字符' };
  }

  const allUsers = await getAllUsers();
  const exists = allUsers.some(
    (u) => sanitizeUsername(u.username) === sanitizeUsername(cleanName)
  );
  if (exists) {
    return { success: false, message: `账号名“${cleanName}”已存在，请换一个名称` };
  }

  const now = new Date();
  const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;

  const newUser: UserAccount = {
    username: cleanName,
    passwordHash: hashPassword(initialPassword),
    createdAt: nowStr,
    role: 'user',
    notes: notes?.trim() || undefined,
  };

  const updatedUsers = [...allUsers, newUser];
  saveLocalUsers(updatedUsers);

  try {
    await setDoc(doc(db, 'users', cleanName.toLowerCase()), newUser);
  } catch (err) {
    console.warn('[Auth] Firestore save user note:', err);
  }

  return {
    success: true,
    message: `账号“${cleanName}”创建成功！初始密码已生效。`,
    user: newUser,
  };
}

/**
 * 普通用户修改密码（只能改密码，不能改账号名）
 */
export async function updateUserPassword(
  username: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  if (!newPassword || newPassword.length < 4) {
    return { success: false, message: '新密码至少需要 4 位字符' };
  }

  const allUsers = await getAllUsers();
  const targetUser = allUsers.find(
    (u) => sanitizeUsername(u.username) === sanitizeUsername(username)
  );

  if (!targetUser) {
    return { success: false, message: '用户不存在' };
  }

  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
  targetUser.passwordHash = hashPassword(newPassword);
  targetUser.updatedAt = nowStr;

  saveLocalUsers(allUsers);

  try {
    await setDoc(
      doc(db, 'users', sanitizeUsername(username)),
      { passwordHash: targetUser.passwordHash, updatedAt: nowStr },
      { merge: true }
    );
  } catch (err) {
    console.warn('[Auth] Firestore password update note:', err);
  }

  return { success: true, message: '密码修改成功！下次登录请使用新密码。' };
}

/**
 * 管理员重置账号密码
 */
export async function adminResetPassword(
  username: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  return updateUserPassword(username, newPassword);
}

/**
 * 管理员删除账号（不可删除 dakbo 默认账号）
 */
export async function deleteUser(
  username: string
): Promise<{ success: boolean; message: string }> {
  if (sanitizeUsername(username) === sanitizeUsername(DEFAULT_USERNAME)) {
    return { success: false, message: `默认账号“${DEFAULT_USERNAME}”不能被删除！` };
  }

  const allUsers = await getAllUsers();
  const filtered = allUsers.filter(
    (u) => sanitizeUsername(u.username) !== sanitizeUsername(username)
  );

  saveLocalUsers(filtered);

  try {
    await deleteDoc(doc(db, 'users', sanitizeUsername(username)));
  } catch (err) {
    console.warn('[Auth] Firestore delete user note:', err);
  }

  return { success: true, message: `账号“${username}”已删除！` };
}

/**
 * 用户登录认证
 */
export async function authenticateUser(
  username: string,
  inputPassword: string
): Promise<{ success: boolean; user?: UserAccount; message?: string }> {
  const cleanName = username.trim();
  if (!cleanName) {
    return { success: false, message: '请输入账号名' };
  }
  if (!inputPassword) {
    return { success: false, message: '请输入登录密码' };
  }

  // 先从本地/云端检索用户
  const allUsers = await getAllUsers();
  let user = allUsers.find(
    (u) => sanitizeUsername(u.username) === sanitizeUsername(cleanName)
  );

  // 如果查找 dakbo 且未在用户列表中（可能首次离线访问），尝试自动注册
  if (!user && sanitizeUsername(cleanName) === sanitizeUsername(DEFAULT_USERNAME)) {
    const initialUsers = await initUserSystem();
    user = initialUsers.find(
      (u) => sanitizeUsername(u.username) === sanitizeUsername(DEFAULT_USERNAME)
    );
  }

  if (!user) {
    return {
      success: false,
      message: `未找到账号“${cleanName}”，请联系管理员在后台为您开通`,
    };
  }

  const isMatch = verifyPassword(inputPassword, user.passwordHash);
  if (!isMatch) {
    return { success: false, message: '密码错误，请核对后重试' };
  }

  return { success: true, user };
}

/**
 * 当前本地登录态持久化
 */
export function getCurrentSession(): UserAccount | null {
  try {
    const saved = localStorage.getItem(CURRENT_USER_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.username) {
        return parsed as UserAccount;
      }
    }
  } catch (e) {
    console.warn('[Auth] Failed to get session', e);
  }
  return null;
}

export function setCurrentSession(user: UserAccount | null): void {
  try {
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  } catch (e) {
    console.warn('[Auth] Failed to set session', e);
  }
}
