import { ref, computed } from 'vue';
import { WKSDK, Channel, ChannelTypeGroup } from 'wukongimjssdk';
import { bizClient } from '../services/bizClient';
import { authStore } from '../services/authStore';
import type { GroupInfo, GroupMember } from '../services/bizTypes';
import APIClient from '../services/APIClient';

export function useGroupManager() {
  const myGroups = ref<GroupInfo[]>([]);
  const currentGroup = ref<GroupInfo | null>(null);
  const memberNicknames = ref<Record<string, string>>({});
  const groupOwnerUid = ref<string>('');
  const loading = ref(false);
  const error = ref('');

  const isOwner = computed(() => groupOwnerUid.value === authStore.uid);

  async function fetchMyGroups() {
    try {
      myGroups.value = await bizClient.getUserGroups();
    } catch {
      myGroups.value = [];
    }
  }

  async function fetchGroupInfo(groupId: string) {
    try {
      const info = await bizClient.getGroup(groupId);
      currentGroup.value = info;
      groupOwnerUid.value = info.owner_uid;
      const nicknames: Record<string, string> = {};
      if (info.members) {
        for (const m of info.members) {
          if (m.nickname) nicknames[m.uid] = m.nickname;
        }
      }
      memberNicknames.value = nicknames;
      return info;
    } catch {
      currentGroup.value = null;
      return null;
    }
  }

  async function createGroup(name: string, nickname: string): Promise<{ group_id: string; room_number: string } | null> {
    loading.value = true;
    error.value = '';
    try {
      const result = await bizClient.createGroup(name, nickname);
      await fetchMyGroups();
      return result;
    } catch (e: any) {
      error.value = e?.response?.data?.error || e.message || '创建群失败';
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function joinGroup(groupId: string, nickname: string): Promise<boolean> {
    loading.value = true;
    error.value = '';
    try {
      await bizClient.joinGroup(groupId, nickname);
      APIClient.shared.joinChannel(groupId, ChannelTypeGroup, authStore.uid);
      await fetchMyGroups();
      return true;
    } catch (e: any) {
      error.value = e?.response?.data?.error || e.message || '加入群失败';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function leaveGroup(groupId: string): Promise<boolean> {
    try {
      await bizClient.leaveGroup(groupId);
      await fetchMyGroups();
      currentGroup.value = null;
      return true;
    } catch (e: any) {
      error.value = e?.response?.data?.error || e.message || '退出群失败';
      return false;
    }
  }

  async function renameGroup(groupId: string, newName: string): Promise<boolean> {
    try {
      await bizClient.updateGroup(groupId, newName);
      if (currentGroup.value) {
        currentGroup.value.name = newName;
      }
      return true;
    } catch (e: any) {
      error.value = e?.response?.data?.error || e.message || '修改群名失败';
      return false;
    }
  }

  async function setNickname(groupId: string, nickname: string): Promise<boolean> {
    try {
      await bizClient.setNickname(groupId, nickname);
      memberNicknames.value = { ...memberNicknames.value, [authStore.uid]: nickname };
      return true;
    } catch (e: any) {
      error.value = e?.response?.data?.error || e.message || '设置昵称失败';
      return false;
    }
  }

  async function kickMember(groupId: string, targetUid: string): Promise<boolean> {
    try {
      await bizClient.kickMember(groupId, targetUid);
      await fetchGroupInfo(groupId);
      return true;
    } catch (e: any) {
      error.value = e?.response?.data?.error || e.message || '踢人失败';
      return false;
    }
  }

  async function disbandGroup(groupId: string): Promise<boolean> {
    try {
      await bizClient.disbandGroup(groupId);
      currentGroup.value = null;
      await fetchMyGroups();
      return true;
    } catch (e: any) {
      error.value = e?.response?.data?.error || e.message || '解散群失败';
      return false;
    }
  }

  function getNickname(memberUid: string): string {
    return memberNicknames.value[memberUid] || memberUid;
  }

  return {
    myGroups, currentGroup, memberNicknames, groupOwnerUid, loading, error, isOwner,
    fetchMyGroups, fetchGroupInfo,
    createGroup, joinGroup, leaveGroup,
    renameGroup, setNickname, kickMember, disbandGroup,
    getNickname,
  };
}
