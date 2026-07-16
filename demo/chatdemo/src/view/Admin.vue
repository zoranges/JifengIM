<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import { bizClient } from '../services/bizClient';
import { authStore } from '../services/authStore';
import type { UserProfile, Department } from '../services/bizTypes';
import CreateUserModal from '../components/admin/CreateUserModal.vue';
import EditUserModal from '../components/admin/EditUserModal.vue';
import DepartModal from '../components/admin/DepartModal.vue';
import ReinstateModal from '../components/admin/ReinstateModal.vue';

const router = useRouter();

// Navigation
const activeNav = ref<'users' | 'departments'>('users');

// Stats
const stats = ref({ total: 0, active: 0, departed: 0, admins: 0 });

// ===== Users =====
const users = ref<UserProfile[]>([]);
const userSearch = ref('');
const filterDept = ref('');
const filterRole = ref('');
const filterStatus = ref('');
const usersLoading = ref(true);
const sortBy = ref('created_at');
const sortDir = ref<'asc' | 'desc'>('desc');
const currentPage = ref(1);
const pageSize = ref(15);
const totalUsers = ref(0);

const totalPages = computed(() => Math.max(1, Math.ceil(totalUsers.value / pageSize.value)));

const showCreateUser = ref(false);
const showEditUser = ref(false);
const showDepart = ref(false);
const showReinstate = ref(false);
const editUser = ref<UserProfile | null>(null);
const departUser = ref<UserProfile | null>(null);
const reinstateUser = ref<UserProfile | null>(null);

// Debounce search
let searchTimer: ReturnType<typeof setTimeout> | null = null;
const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { currentPage.value = 1; loadUsers(); }, 300);
};

const toggleSort = (col: string) => {
  if (sortBy.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = col;
    sortDir.value = 'asc';
  }
  loadUsers();
};

const sortIcon = (col: string) => {
  if (sortBy.value !== col) return '↕';
  return sortDir.value === 'asc' ? '↑' : '↓';
};

const loadUsers = async () => {
  usersLoading.value = true;
  try {
    const params: Record<string, any> = {
      page: currentPage.value,
      page_size: pageSize.value,
      sort_by: sortBy.value,
      sort_dir: sortDir.value,
    };
    if (filterStatus.value) params.status = filterStatus.value;
    if (filterDept.value) params.department = filterDept.value;
    if (filterRole.value) params.role = filterRole.value;
    if (userSearch.value.trim()) params.search = userSearch.value.trim();
    const result = await bizClient.listUsers(params);
    users.value = result.rows;
    totalUsers.value = result.total;
  } catch { /* ignore */ }
  usersLoading.value = false;
};

const changePage = (page: number) => {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  loadUsers();
};

// ===== Departments =====
const departments = ref<Department[]>([]);
const deptName = ref('');
const editingDept = ref<Department | null>(null);
const editDeptName = ref('');
const deptViewMode = ref<'table' | 'cards'>('table');

const loadDepartments = async () => {
  try { departments.value = await bizClient.listDepartments(); } catch {}
};

const loadStats = async () => {
  try { stats.value = await bizClient.getStats(); } catch {}
};

onMounted(async () => {
  await Promise.all([loadUsers(), loadDepartments(), loadStats()]);
});

// Watch filters to reload
watch([filterStatus, filterDept, filterRole], () => {
  currentPage.value = 1;
  loadUsers();
});

const addDept = async () => {
  if (!deptName.value.trim()) return;
  try {
    await bizClient.createDepartment(deptName.value.trim());
    deptName.value = '';
    await loadDepartments();
  } catch (err: any) { alert(err.response?.data?.error || '创建失败'); }
};

const startEditDept = (d: Department) => {
  editingDept.value = d;
  editDeptName.value = d.name;
};

const saveDept = async () => {
  if (!editDeptName.value.trim() || !editingDept.value) return;
  try {
    await bizClient.updateDepartment(editingDept.value.id, editDeptName.value.trim());
    editingDept.value = null;
    await loadDepartments();
  } catch (err: any) { alert(err.response?.data?.error || '修改失败'); }
};

const deleteDept = async (d: Department) => {
  if (!confirm(`确定删除部门「${d.name}」？该部门人员将移至「未分配」。`)) return;
  try { await bizClient.deleteDepartment(d.id); await loadDepartments(); }
  catch (err: any) { alert(err.response?.data?.error || '删除失败'); }
};

const onReinstate = (u: UserProfile) => {
  reinstateUser.value = u;
  showReinstate.value = true;
};

const roleLabel = (r: string) => {
  const map: Record<string, string> = { super_admin: '超级管理员', admin: '管理员', project_lead: '项目负责人', employee: '员工' };
  return map[r] || r;
};

const goChat = () => router.push('/chat');

// Pagination range
const pageRange = computed(() => {
  const pages: number[] = [];
  const start = Math.max(1, currentPage.value - 2);
  const end = Math.min(totalPages.value, currentPage.value + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
});
</script>

<template>
  <div class="admin-page">
    <!-- Left Sidebar -->
    <nav class="admin-sidebar">
      <div class="sidebar-brand" @click="goChat">
        <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
          <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
          <path d="M9 16l5 5 9-10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>极速通</span>
      </div>

      <div class="nav-items">
        <button class="nav-item" :class="{ active: activeNav === 'users' }" @click="activeNav = 'users'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
          <span>用户管理</span>
        </button>
        <button class="nav-item" :class="{ active: activeNav === 'departments' }" @click="activeNav = 'departments'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span>部门管理</span>
        </button>
      </div>

      <div class="sidebar-footer">
        <button class="back-btn" @click="goChat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>返回聊天</span>
        </button>
      </div>
    </nav>

    <!-- Right Content -->
    <div class="admin-main">
      <!-- Header -->
      <header class="admin-header">
        <h1>{{ activeNav === 'users' ? '用户管理' : '部门管理' }}</h1>
        <span class="header-role">{{ roleLabel(authStore.role) }}</span>
      </header>

      <!-- Stats Cards -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">总用户</div>
        </div>
        <div class="stat-card stat-active">
          <div class="stat-value">{{ stats.active }}</div>
          <div class="stat-label">在职</div>
        </div>
        <div class="stat-card stat-departed">
          <div class="stat-value">{{ stats.departed }}</div>
          <div class="stat-label">离职</div>
        </div>
        <div class="stat-card stat-admin">
          <div class="stat-value">{{ stats.admins }}</div>
          <div class="stat-label">管理员</div>
        </div>
      </div>

      <!-- Users Tab -->
      <div class="content-panel" v-if="activeNav === 'users'">
        <div class="toolbar">
          <div class="toolbar-left">
            <div class="search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" class="search-icon">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="text" placeholder="搜索姓名或UID..." v-model="userSearch" @input="onSearchInput" />
            </div>
            <select v-model="filterDept">
              <option value="">全部部门</option>
              <option v-for="d in departments" :key="d.name" :value="d.name">{{ d.name }}</option>
            </select>
            <select v-model="filterRole">
              <option value="">全部角色</option>
              <option value="super_admin">超级管理员</option>
              <option value="admin">管理员</option>
              <option value="project_lead">项目负责人</option>
              <option value="employee">员工</option>
            </select>
            <select v-model="filterStatus">
              <option value="">全部状态</option>
              <option value="active">在职</option>
              <option value="departed">离职</option>
            </select>
          </div>
          <button class="btn-create" @click="showCreateUser = true">+ 新建用户</button>
        </div>

        <div class="table-wrap">
          <table class="user-table" v-if="!usersLoading">
            <thead>
              <tr>
                <th class="sortable" @click="toggleSort('name')">姓名 <span class="sort-icon">{{ sortIcon('name') }}</span></th>
                <th>UID</th>
                <th class="sortable" @click="toggleSort('department')">部门 <span class="sort-icon">{{ sortIcon('department') }}</span></th>
                <th>职位</th>
                <th class="sortable" @click="toggleSort('role')">角色 <span class="sort-icon">{{ sortIcon('role') }}</span></th>
                <th>状态</th>
                <th class="sortable" @click="toggleSort('created_at')">创建时间 <span class="sort-icon">{{ sortIcon('created_at') }}</span></th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.uid" :class="{ departed: u.status === 'departed' }">
                <td class="name-cell">{{ u.name }}</td>
                <td class="mono">{{ u.uid }}</td>
                <td>{{ u.department || '-' }}</td>
                <td>{{ u.position || '-' }}</td>
                <td><span class="role-tag" :class="'role-' + u.role">{{ roleLabel(u.role) }}</span></td>
                <td><span class="status-tag" :class="'status-' + u.status">{{ u.status === 'active' ? '在职' : '离职' }}</span></td>
                <td class="mono">{{ u.created_at?.slice(0, 10) }}</td>
                <td class="actions-cell">
                  <button class="action-btn" @click="editUser = u; showEditUser = true">编辑</button>
                  <button class="action-btn warn" v-if="u.status === 'active'" @click="departUser = u; showDepart = true">离职</button>
                  <button class="action-btn restore" v-if="u.status === 'departed'" @click="onReinstate(u)">恢复</button>
                </td>
              </tr>
              <tr v-if="users.length === 0"><td colspan="8" class="empty-row">暂无用户</td></tr>
            </tbody>
          </table>
          <div class="loading" v-else>加载中...</div>
        </div>

        <!-- Pagination -->
        <div class="pagination" v-if="totalPages > 1 && !usersLoading">
          <button class="page-btn" :disabled="currentPage === 1" @click="changePage(1)">«</button>
          <button class="page-btn" :disabled="currentPage === 1" @click="changePage(currentPage - 1)">‹</button>
          <button class="page-btn" v-for="p in pageRange" :key="p" :class="{ active: p === currentPage }" @click="changePage(p)">{{ p }}</button>
          <button class="page-btn" :disabled="currentPage === totalPages" @click="changePage(currentPage + 1)">›</button>
          <button class="page-btn" :disabled="currentPage === totalPages" @click="changePage(totalPages)">»</button>
          <span class="page-info">共 {{ totalUsers }} 条，第 {{ currentPage }}/{{ totalPages }} 页</span>
        </div>
      </div>

      <!-- Departments Tab -->
      <div class="content-panel" v-if="activeNav === 'departments'">
        <div class="dept-toolbar">
          <div class="dept-add-row">
            <input type="text" placeholder="输入新部门名称" v-model="deptName" @keyup.enter="addDept" />
            <button class="btn-create" @click="addDept">添加部门</button>
          </div>
          <div class="view-toggle">
            <button :class="{ active: deptViewMode === 'table' }" @click="deptViewMode = 'table'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </button>
            <button :class="{ active: deptViewMode === 'cards' }" @click="deptViewMode = 'cards'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Table view -->
        <table class="user-table" v-if="deptViewMode === 'table'">
          <thead>
            <tr><th>ID</th><th>部门名称</th><th>在职人数</th><th>创建时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in departments" :key="d.id">
              <td class="mono">{{ d.id }}</td>
              <td>
                <template v-if="editingDept?.id === d.id">
                  <input type="text" v-model="editDeptName" @keyup.enter="saveDept" class="inline-edit" />
                  <button class="action-btn" @click="saveDept">保存</button>
                  <button class="action-btn" @click="editingDept = null">取消</button>
                </template>
                <template v-else>{{ d.name }}</template>
              </td>
              <td><span class="count-badge">{{ (d as any).user_count ?? 0 }}</span></td>
              <td class="mono">{{ d.created_at?.slice(0, 10) }}</td>
              <td class="actions-cell" v-if="editingDept?.id !== d.id">
                <button class="action-btn" @click="startEditDept(d)">重命名</button>
                <button class="action-btn warn" @click="deleteDept(d)" v-if="d.name !== '未分配'">删除</button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Card view -->
        <div class="dept-cards" v-if="deptViewMode === 'cards'">
          <div class="dept-card" v-for="d in departments" :key="d.id">
            <div class="dept-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div class="dept-card-body">
              <template v-if="editingDept?.id === d.id">
                <input type="text" v-model="editDeptName" @keyup.enter="saveDept" class="inline-edit" />
                <div class="dept-card-actions">
                  <button class="action-btn" @click="saveDept">保存</button>
                  <button class="action-btn" @click="editingDept = null">取消</button>
                </div>
              </template>
              <template v-else>
                <div class="dept-card-name">{{ d.name }}</div>
                <div class="dept-card-meta">{{ (d as any).user_count ?? 0 }} 人在职 · 创建于 {{ d.created_at?.slice(0, 10) }}</div>
                <div class="dept-card-actions" v-if="d.name !== '未分配'">
                  <button class="action-btn" @click="startEditDept(d)">重命名</button>
                  <button class="action-btn warn" @click="deleteDept(d)">删除</button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <CreateUserModal v-if="showCreateUser" @close="showCreateUser = false" @created="showCreateUser = false; loadUsers(); loadStats()" />
    <EditUserModal v-if="showEditUser && editUser" :user="editUser" @close="showEditUser = false; editUser = null" @updated="showEditUser = false; editUser = null; loadUsers(); loadStats()" />
    <DepartModal v-if="showDepart && departUser" :user="departUser" @close="showDepart = false; departUser = null" @done="showDepart = false; departUser = null; loadUsers(); loadDepartments(); loadStats()" />
    <ReinstateModal v-if="showReinstate && reinstateUser" :user="reinstateUser" @close="showReinstate = false; reinstateUser = null" @done="showReinstate = false; reinstateUser = null; loadUsers(); loadStats()" />
  </div>
</template>

<style scoped>
.admin-page {
  width: 100%; height: 100vh; display: flex;
  background: #f2f4f7;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* ===== Sidebar ===== */
.admin-sidebar {
  width: 220px; flex-shrink: 0; background: #1a1d2e; color: #fff;
  display: flex; flex-direction: column;
}

.sidebar-brand {
  display: flex; align-items: center; gap: 10px; padding: 20px 18px;
  color: #fff; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.08);
}

.sidebar-brand span { font-size: 16px; font-weight: 700; letter-spacing: 1px; }

.nav-items { flex: 1; padding: 12px 10px; display: flex; flex-direction: column; gap: 4px; }

.nav-item {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px;
  border-radius: 8px; font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.6);
  background: transparent; border: none; cursor: pointer; transition: all 0.15s;
}

.nav-item:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.85); }
.nav-item.active { background: #2563eb; color: #fff; }

.sidebar-footer { padding: 12px 10px; border-top: 1px solid rgba(255,255,255,0.08); }

.back-btn {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 12px;
  border-radius: 8px; font-size: 13px; color: rgba(255,255,255,0.5);
  background: transparent; border: none; cursor: pointer; transition: all 0.15s;
}

.back-btn:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); }

/* ===== Main ===== */
.admin-main {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
}

.admin-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 28px 0;
}

.admin-header h1 { font-size: 20px; font-weight: 700; color: #1a1d2e; }
.header-role { font-size: 11px; color: #dc2626; background: #fef2f2; padding: 2px 8px; border-radius: 4px; }

/* ===== Stats ===== */
.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 20px 28px; }

.stat-card {
  background: #fff; border-radius: 10px; padding: 20px 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  border-left: 3px solid #e5e7ee;
}

.stat-value { font-size: 28px; font-weight: 700; color: #1a1d2e; line-height: 1.2; }
.stat-label { font-size: 13px; color: #9ca3af; margin-top: 4px; }

.stat-active { border-left-color: #22c55e; }
.stat-active .stat-value { color: #16a34a; }
.stat-departed { border-left-color: #ef4444; }
.stat-departed .stat-value { color: #dc2626; }
.stat-admin { border-left-color: #3b82f6; }
.stat-admin .stat-value { color: #2563eb; }

/* ===== Content Panel ===== */
.content-panel { flex: 1; overflow-y: auto; padding: 0 28px 24px; }

/* ===== Toolbar ===== */
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.search-wrap {
  position: relative; display: flex; align-items: center;
}

.search-icon { position: absolute; left: 10px; color: #9ca3af; pointer-events: none; }

.search-wrap input {
  height: 36px; padding: 0 12px 0 32px; border-radius: 8px; border: 1px solid #e5e7ee;
  background: #f7f8fa; color: #1a1d2e; font-size: 13px; outline: none; width: 200px;
}

.search-wrap input:focus { border-color: #3b82f6; background: #fff; }

.toolbar-left select {
  height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid #e5e7ee;
  background: #f7f8fa; color: #1a1d2e; font-size: 13px; outline: none; cursor: pointer;
}

.btn-create {
  padding: 0 18px; height: 36px; border-radius: 8px; background: #16a34a; color: #fff;
  border: none; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap;
  transition: background 0.15s;
}

.btn-create:hover { background: #15803d; }

/* ===== Table ===== */
.table-wrap { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }

.user-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.user-table th { text-align: left; padding: 12px 14px; border-bottom: 2px solid #e5e7ee; color: #6b7280; font-weight: 600; font-size: 12px; background: #fafbfc; white-space: nowrap; }
.user-table td { padding: 11px 14px; border-bottom: 1px solid #f3f4f6; color: #1a1d2e; }
.user-table tbody tr:hover { background: #f8fafc; }
tr.departed td { opacity: 0.45; }
tr.departed:hover td { opacity: 0.7; }

.sortable { cursor: pointer; user-select: none; }
.sortable:hover { color: #1a1d2e; }
.sort-icon { font-size: 11px; margin-left: 2px; color: #c4c8d0; }

.name-cell { font-weight: 500; }
.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }

.role-tag { font-size: 11px; padding: 2px 6px; border-radius: 3px; font-weight: 500; white-space: nowrap; }
.role-super_admin { background: #fef2f2; color: #dc2626; }
.role-admin { background: #eff6ff; color: #2563eb; }
.role-project_lead { background: #fefce8; color: #ca8a04; }
.role-employee { background: #f0fdf4; color: #16a34a; }

.status-tag { font-size: 11px; padding: 2px 6px; border-radius: 3px; white-space: nowrap; }
.status-active { background: #f0fdf4; color: #16a34a; }
.status-departed { background: #fef2f2; color: #dc2626; }

.actions-cell { display: flex; gap: 4px; align-items: center; }
.action-btn { padding: 4px 10px; font-size: 12px; border-radius: 5px; border: 1px solid #e5e7ee; background: #f7f8fa; color: #374151; cursor: pointer; white-space: nowrap; transition: all 0.15s; }
.action-btn:hover { background: #e5e7ee; }
.action-btn.warn { color: #dc2626; border-color: #fecaca; background: #fff5f5; }
.action-btn.warn:hover { background: #fef2f2; }
.action-btn.restore { color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }
.action-btn.restore:hover { background: #dbeafe; }

.inline-edit { width: 100px; height: 30px; padding: 0 8px; border-radius: 6px; border: 1px solid #3b82f6; font-size: 13px; outline: none; }

.empty-row { text-align: center; color: #9ca3af; padding: 40px !important; }
.loading { text-align: center; color: #9ca3af; padding: 40px; }

/* ===== Pagination ===== */
.pagination {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 16px 0; font-size: 13px;
}

.page-btn {
  min-width: 32px; height: 32px; padding: 0 8px; border-radius: 6px;
  border: 1px solid #e5e7ee; background: #fff; color: #374151;
  font-size: 13px; cursor: pointer; transition: all 0.15s;
}

.page-btn:hover:not(:disabled) { background: #f3f4f6; }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; }

.page-info { margin-left: 12px; color: #9ca3af; font-size: 12px; }

/* ===== Departments ===== */
.dept-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; }

.dept-add-row { display: flex; gap: 8px; flex: 1; }
.dept-add-row input {
  flex: 1; height: 36px; padding: 0 12px; border-radius: 8px; border: 1px solid #e5e7ee;
  background: #f7f8fa; color: #1a1d2e; font-size: 13px; outline: none; max-width: 300px;
}

.view-toggle { display: flex; gap: 2px; background: #f3f4f6; border-radius: 8px; padding: 3px; }
.view-toggle button {
  width: 32px; height: 30px; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; background: transparent; color: #6b7280; border: none; cursor: pointer;
}
.view-toggle button.active { background: #fff; color: #1a1d2e; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

.count-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 24px; height: 22px; padding: 0 6px; border-radius: 11px;
  background: #eff6ff; color: #2563eb; font-size: 12px; font-weight: 600;
}

/* ===== Dept Cards ===== */
.dept-cards {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px;
}

.dept-card {
  background: #fff; border-radius: 10px; padding: 18px; display: flex; gap: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: box-shadow 0.15s;
}

.dept-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }

.dept-card-icon {
  width: 44px; height: 44px; border-radius: 10px; background: #eff6ff;
  display: flex; align-items: center; justify-content: center; color: #2563eb; flex-shrink: 0;
}

.dept-card-body { flex: 1; }

.dept-card-name { font-size: 15px; font-weight: 600; color: #1a1d2e; margin-bottom: 4px; }
.dept-card-meta { font-size: 12px; color: #9ca3af; margin-bottom: 8px; }
.dept-card-actions { display: flex; gap: 4px; }

/* ===== Dark Mode ===== */
@media (prefers-color-scheme: dark) {
  .admin-page { background: #0f1119; }
  .admin-header h1 { color: #e8eaf0; }
  .stat-card { background: #1a1d2e; border-left-color: #2a2e42; }
  .stat-value { color: #e8eaf0; }
  .stat-active { border-left-color: #22c55e; }
  .stat-departed { border-left-color: #ef4444; }
  .stat-admin { border-left-color: #3b82f6; }
  .table-wrap { background: #1a1d2e; }
  .user-table th { background: #1f2237; border-color: #2a2e42; color: #9ca3af; }
  .user-table td { border-color: #222640; color: #e8eaf0; }
  .user-table tbody tr:hover { background: #222640; }
  .toolbar-left select, .search-wrap input, .dept-add-row input { background: #222640; border-color: #2a2e42; color: #e8eaf0; }
  .action-btn { background: #222640; border-color: #2a2e42; color: #9ca3af; }
  .action-btn:hover { background: #2a2e42; color: #e8eaf0; }
  .action-btn.warn { background: #3b1c1c; border-color: #5c2020; }
  .action-btn.warn:hover { background: #4c2828; }
  .action-btn.restore { background: #1c2d4a; border-color: #1e3a5f; }
  .action-btn.restore:hover { background: #243b5e; }
  .page-btn { background: #1a1d2e; border-color: #2a2e42; color: #9ca3af; }
  .page-btn.active { background: #2563eb; color: #fff; }
  .view-toggle { background: #222640; }
  .view-toggle button.active { background: #1a1d2e; color: #e8eaf0; }
  .dept-card { background: #1a1d2e; }
  .dept-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
  .dept-card-icon { background: #1c2d4a; }
  .dept-card-name { color: #e8eaf0; }
}
</style>
