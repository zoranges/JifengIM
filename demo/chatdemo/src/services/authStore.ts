import { reactive } from 'vue';

interface AuthState {
  uid: string;
  name: string;
  jwt: string;
  imToken: string;
  role: string;
  department: string;
  position: string;
  status: string;
}

const state = reactive<AuthState>({
  uid: localStorage.getItem('biz_uid') || '',
  name: localStorage.getItem('biz_name') || '',
  jwt: localStorage.getItem('biz_jwt') || '',
  imToken: localStorage.getItem('im_token') || '',
  role: localStorage.getItem('biz_role') || 'employee',
  department: localStorage.getItem('biz_department') || '',
  position: localStorage.getItem('biz_position') || '',
  status: localStorage.getItem('biz_status') || 'active',
});

export const authStore = {
  get uid() { return state.uid; },
  get name() { return state.name; },
  get jwt() { return state.jwt; },
  get imToken() { return state.imToken; },
  get role() { return state.role; },
  get department() { return state.department; },
  get position() { return state.position; },
  get status() { return state.status; },

  get isAuthenticated(): boolean {
    return !!state.jwt && !!state.uid;
  },

  get isAdmin(): boolean {
    return state.role === 'super_admin' || state.role === 'admin';
  },

  get isProjectLead(): boolean {
    return state.role === 'project_lead';
  },

  get authHeaders(): Record<string, string> {
    return state.jwt ? { Authorization: `Bearer ${state.jwt}` } : {};
  },

  login(uid: string, name: string, jwt: string, imToken: string) {
    state.uid = uid;
    state.name = name;
    state.jwt = jwt;
    state.imToken = imToken;
    localStorage.setItem('biz_uid', uid);
    localStorage.setItem('biz_name', name);
    localStorage.setItem('biz_jwt', jwt);
    localStorage.setItem('im_token', imToken);
  },

  setProfile(profile: { role?: string; department?: string; position?: string; status?: string; name?: string }) {
    if (profile.role !== undefined) { state.role = profile.role; localStorage.setItem('biz_role', profile.role); }
    if (profile.department !== undefined) { state.department = profile.department; localStorage.setItem('biz_department', profile.department); }
    if (profile.position !== undefined) { state.position = profile.position; localStorage.setItem('biz_position', profile.position); }
    if (profile.status !== undefined) { state.status = profile.status; localStorage.setItem('biz_status', profile.status); }
    if (profile.name !== undefined) { state.name = profile.name; localStorage.setItem('biz_name', profile.name); }
  },

  logout() {
    state.uid = '';
    state.name = '';
    state.jwt = '';
    state.imToken = '';
    state.role = 'employee';
    state.department = '';
    state.position = '';
    state.status = 'active';
    localStorage.removeItem('biz_uid');
    localStorage.removeItem('biz_name');
    localStorage.removeItem('biz_jwt');
    localStorage.removeItem('im_token');
    localStorage.removeItem('biz_role');
    localStorage.removeItem('biz_department');
    localStorage.removeItem('biz_position');
    localStorage.removeItem('biz_status');
  },

  updateName(name: string) {
    state.name = name;
    localStorage.setItem('biz_name', name);
  },
};
