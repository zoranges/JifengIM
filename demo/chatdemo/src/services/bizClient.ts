import axios from 'axios';
import type { GroupInfo, GroupMember, PinnedMessage, EnterpriseMember, GroupWithMembers, UserProfile, Department } from './bizTypes';
import { authStore } from './authStore';

const BIZ_BASE = '/api/biz';

const bizAxios = axios.create({ baseURL: BIZ_BASE });

bizAxios.interceptors.request.use((config) => {
  const headers = authStore.authHeaders;
  if (headers.Authorization) {
    config.headers.Authorization = headers.Authorization;
  }
  return config;
});

bizAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStore.logout();
      window.location.hash = '#/';
    }
    return Promise.reject(error);
  }
);

export const bizClient = {
  // ===== Groups =====
  async createGroup(name: string, nickname: string): Promise<{ group_id: string; name: string; room_number: string; owner_uid: string }> {
    const res = await bizAxios.post('/groups/create', { name, nickname });
    return res.data;
  },

  async joinGroup(groupId: string, nickname: string): Promise<{ group_id: string; name: string }> {
    const res = await bizAxios.post('/groups/join', { group_id: groupId, nickname });
    return res.data;
  },

  async leaveGroup(groupId: string): Promise<void> {
    await bizAxios.post('/groups/leave', { group_id: groupId });
  },

  async searchGroup(groupId: string): Promise<GroupInfo> {
    const res = await bizAxios.get('/groups/search', { params: { q: groupId } });
    return res.data;
  },

  async getGroup(groupId: string): Promise<GroupInfo> {
    const res = await bizAxios.get(`/groups/${groupId}`);
    return res.data;
  },

  async updateGroup(groupId: string, name: string): Promise<void> {
    await bizAxios.put(`/groups/${groupId}`, { name });
  },

  async disbandGroup(groupId: string): Promise<void> {
    await bizAxios.delete(`/groups/${groupId}`);
  },

  async getMembers(groupId: string): Promise<GroupMember[]> {
    const res = await bizAxios.get(`/groups/${groupId}/members`);
    return res.data;
  },

  async setNickname(groupId: string, nickname: string): Promise<void> {
    await bizAxios.put(`/groups/${groupId}/nickname`, { nickname });
  },

  async kickMember(groupId: string, targetUid: string): Promise<void> {
    await bizAxios.post(`/groups/${groupId}/kick`, { target_uid: targetUid });
  },

  async inviteMembers(groupId: string, uids: string[], nicknames?: string[]): Promise<{ invited: string[]; skipped: string[] }> {
    const res = await bizAxios.post(`/groups/${groupId}/invite`, { uids, nicknames });
    return res.data;
  },

  async pinMessage(groupId: string, params: {
    message_id: string; message_seq: number;
    client_msg_no: string; content_preview: string;
    message_type: number; from_uid: string;
  }): Promise<PinnedMessage> {
    const res = await bizAxios.post(`/groups/${groupId}/pin`, params);
    return res.data;
  },

  async unpinMessage(groupId: string, messageId: string): Promise<void> {
    await bizAxios.post(`/groups/${groupId}/unpin`, { message_id: messageId });
  },

  async getPinnedMessages(groupId: string): Promise<PinnedMessage[]> {
    const res = await bizAxios.get(`/groups/${groupId}/pins`);
    return res.data;
  },

  async getUserGroups(): Promise<GroupInfo[]> {
    const res = await bizAxios.get(`/users/${authStore.uid}/groups`);
    return res.data;
  },

  async getEnterpriseMembers(): Promise<EnterpriseMember[]> {
    const res = await bizAxios.get('/groups/members');
    return res.data;
  },

  async getGroupsWithMembers(): Promise<GroupWithMembers[]> {
    const res = await bizAxios.get('/groups/with-members');
    return res.data;
  },

  // ===== Member Directory =====
  async getMemberDirectory(department?: string): Promise<UserProfile[]> {
    const res = await bizAxios.get('/members/directory', { params: department ? { department } : {} });
    return res.data;
  },

  async getMemberDetail(uid: string): Promise<UserProfile> {
    const res = await bizAxios.get(`/members/directory/${uid}`);
    return res.data;
  },

  // ===== Admin =====
  async getStats(): Promise<{ total: number; active: number; departed: number; admins: number }> {
    const res = await bizAxios.get('/admin/stats');
    return res.data;
  },

  async createUser(name: string, password: string, department?: string, position?: string, role?: string): Promise<UserProfile> {
    const res = await bizAxios.post('/admin/users', { name, password, department, position, role });
    return res.data;
  },

  async listUsers(params?: { status?: string; department?: string; role?: string; search?: string; page?: number; page_size?: number; sort_by?: string; sort_dir?: string }): Promise<{ rows: UserProfile[]; total: number; page: number; page_size: number }> {
    const res = await bizAxios.get('/admin/users', { params });
    return res.data;
  },

  async getUser(uid: string): Promise<UserProfile> {
    const res = await bizAxios.get(`/admin/users/${uid}`);
    return res.data;
  },

  async updateUser(uid: string, data: { name?: string; department?: string; position?: string; role?: string }): Promise<UserProfile> {
    const res = await bizAxios.put(`/admin/users/${uid}`, data);
    return res.data;
  },

  async resetUserPassword(uid: string, newPassword: string): Promise<void> {
    await bizAxios.post(`/admin/users/${uid}/reset-password`, { new_password: newPassword });
  },

  async departUser(uid: string): Promise<{ ok: boolean; transfer_log: any[] }> {
    const res = await bizAxios.post(`/admin/users/${uid}/depart`);
    return res.data;
  },

  async reinstateUser(uid: string, newPassword: string): Promise<void> {
    await bizAxios.post(`/admin/users/${uid}/reinstate`, { new_password: newPassword });
  },

  async listDepartments(): Promise<Department[]> {
    const res = await bizAxios.get('/admin/departments');
    return res.data;
  },

  async createDepartment(name: string): Promise<Department> {
    const res = await bizAxios.post('/admin/departments', { name });
    return res.data;
  },

  async updateDepartment(id: number, name: string): Promise<void> {
    await bizAxios.put(`/admin/departments/${id}`, { name });
  },

  async deleteDepartment(id: number): Promise<void> {
    await bizAxios.delete(`/admin/departments/${id}`);
  },
};
