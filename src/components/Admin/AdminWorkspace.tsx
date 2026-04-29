import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Save, X, AlertCircle } from 'lucide-react';
import type { ActivationWorkspaceId } from '../../types';
import { fetchUserList, updateUserPermissions, deleteUser, type UserListItem } from '../../services/apiService';
import { getWorkspaceLabel } from '../../../lib/workspaces.js';

interface PermissionEditorProps {
  user: UserListItem;
  availableWorkspaces: ActivationWorkspaceId[];
  onSave: (allowedWorkspaces: ActivationWorkspaceId[]) => void;
  onCancel: () => void;
}

function PermissionEditor({ user, availableWorkspaces, onSave, onCancel }: PermissionEditorProps) {
  const [selected, setSelected] = useState<ActivationWorkspaceId[]>([...user.allowedWorkspaces]);

  const toggleWorkspace = (workspaceId: ActivationWorkspaceId) => {
    setSelected((prev) =>
      prev.includes(workspaceId)
        ? prev.filter((id) => id !== workspaceId)
        : [...prev, workspaceId]
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 text-sm font-semibold text-slate-900">编辑权限：{user.email}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {availableWorkspaces.map((workspaceId) => (
          <label
            key={workspaceId}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 transition-all hover:border-slate-300"
          >
            <input
              type="checkbox"
              checked={selected.includes(workspaceId)}
              onChange={() => toggleWorkspace(workspaceId)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">{getWorkspaceLabel(workspaceId)}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <X size={14} />
          取消
        </button>
        <button
          onClick={() => onSave(selected)}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Save size={14} />
          保存
        </button>
      </div>
    </div>
  );
}

export default function AdminWorkspace() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [availableWorkspaces, setAvailableWorkspaces] = useState<ActivationWorkspaceId[]>([]);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchUserList();
      setUsers(data.users);
      setAvailableWorkspaces(data.availableWorkspaces);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSavePermissions = async (email: string, allowedWorkspaces: ActivationWorkspaceId[]) => {
    try {
      setError(null);
      await updateUserPermissions(email, allowedWorkspaces);
      setEditingEmail(null);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失败');
    }
  };

  const handleDeleteUser = async (email: string) => {
    try {
      setError(null);
      await deleteUser(email);
      closeDeleteConfirm();
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  const openDeleteConfirm = (email: string) => {
    setDeleteAcknowledged(false);
    setConfirmDelete(email);
  };

  const closeDeleteConfirm = () => {
    setDeleteAcknowledged(false);
    setConfirmDelete(null);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#111111]">用户与权限管理</h1>
          <p className="mt-2 text-[15px] text-[#6E6E73]">管理系统用户的工作区访问权限</p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="mt-0.5 shrink-0 text-red-500" size={20} />
            <div>
              <div className="text-sm font-semibold text-red-900">操作失败</div>
              <div className="mt-1 text-sm text-red-700">{error}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-slate-500">加载中...</div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[190px]" />
                  <col />
                  <col className="w-[120px]" />
                  <col className="w-[166px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 sm:px-6">
                      用户
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 sm:px-6">
                      权限
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 sm:px-6">
                      最近登录
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 sm:px-6">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.email} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-5 align-top sm:px-6">
                        <div>
                          <div className="truncate text-sm font-semibold text-slate-900">{user.displayName}</div>
                          <div className="mt-1 truncate text-sm text-slate-500">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-4 py-5 align-top sm:px-6">
                        {editingEmail === user.email ? (
                          <PermissionEditor
                            user={user}
                            availableWorkspaces={availableWorkspaces}
                            onSave={(allowed) => handleSavePermissions(user.email, allowed)}
                            onCancel={() => setEditingEmail(null)}
                          />
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {user.allowedWorkspaces.map((workspaceId) => (
                              <span
                                key={workspaceId}
                                className="inline-flex max-w-full items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium leading-5 text-slate-700"
                              >
                                <span className="truncate">{getWorkspaceLabel(workspaceId)}</span>
                              </span>
                            ))}
                            {user.allowedWorkspaces.length === 0 && (
                              <span className="text-xs text-slate-400">无权限</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-5 align-top text-sm leading-6 text-slate-500 sm:px-6">
                        {formatDate(user.lastLoginAt)}
                      </td>
                      <td className="px-3 py-5 align-top sm:px-4">
                        {editingEmail !== user.email && (
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            <button
                              onClick={() => setEditingEmail(user.email)}
                              className="inline-flex items-center justify-center rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium leading-4 text-blue-700 hover:bg-blue-100"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => openDeleteConfirm(user.email)}
                              className="inline-flex items-center justify-center gap-1 rounded-md border border-red-100 bg-red-50 px-2 py-1 text-xs font-medium leading-4 text-red-700 hover:bg-red-100"
                            >
                              <Trash2 size={12} />
                              删除
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {users.length === 0 && (
              <div className="flex h-64 items-center justify-center text-slate-500">
                暂无用户数据
              </div>
            )}
          </div>
        )}

        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="mb-4 text-lg font-semibold text-slate-900">确认删除用户</div>
              <p className="text-sm text-slate-600">
                确定要删除用户 <span className="font-semibold text-slate-900">{confirmDelete}</span> 吗？删除后该用户将无法登录系统。
              </p>
              <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <input
                  type="checkbox"
                  checked={deleteAcknowledged}
                  onChange={(event) => setDeleteAcknowledged(event.target.checked)}
                  className="h-4 w-4 rounded border-red-200 text-red-600 focus:ring-red-500"
                />
                <span>我确认删除该用户</span>
              </label>
              <div className="flex justify-end gap-3">
                <button
                  onClick={closeDeleteConfirm}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  disabled={!deleteAcknowledged}
                  onClick={() => handleDeleteUser(confirmDelete)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
