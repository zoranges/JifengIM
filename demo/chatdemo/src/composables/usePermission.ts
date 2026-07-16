import { computed } from 'vue';
import { authStore } from '../services/authStore';

export function usePermission() {
  const isAdmin = computed(() => authStore.isAdmin);
  const canCreateGroup = computed(() => authStore.isAdmin || authStore.role === 'project_lead');
  const canManageGroup = (ownerUid: string) => computed(() => isAdmin.value || authStore.uid === ownerUid);
  return { isAdmin, canCreateGroup, canManageGroup };
}
