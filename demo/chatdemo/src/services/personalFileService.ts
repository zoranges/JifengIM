/**
 * 个人文件 API 客户端
 */
import { authStore } from './authStore';

const BASE = '/api/biz/files';

export interface PersonalFile {
  id: string;
  name: string;
  size: number;
  sizeText: string;
  mimeType: string;
  fileType: 'image' | 'video' | 'audio' | 'doc';
  url: string;
  categoryId: string | null;
  uploaderUid: string;
  uploaderName: string;
  createdAt: string;
}

export interface FileCategory {
  id: string;
  name: string;
  sortOrder: number;
  fileCount: number;
  createdAt: string;
}

export interface FileListResult {
  files: PersonalFile[];
  total: number;
  page: number;
  limit: number;
}

export interface CategoryListResult {
  categories: FileCategory[];
  counts: {
    total: number;
    images: number;
    videos: number;
    audios: number;
    docs: number;
  };
}

interface UploadResult {
  ok: boolean;
  file: PersonalFile;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...authStore.authHeaders,
  };
  // Don't override Content-Type for FormData (upload)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || '请求失败');
  }
  return res.json();
}

// ─── 文件操作 ──────────────────────────────────────────────

/** 上传文件 */
export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<PersonalFile> {
  const formData = new FormData();
  formData.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE + '/upload');

    // 设置认证头
    const authHeaders = authStore.authHeaders;
    Object.entries(authHeaders).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const data: UploadResult = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
          resolve(data.file);
        } else {
          reject(new Error((data as any).error || '上传失败'));
        }
      } catch (e) {
        reject(new Error('响应解析失败'));
      }
    };

    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.send(formData);
  });
}

/** 获取文件列表 */
export async function listFiles(params: {
  search?: string;
  category_id?: string;
  sort?: string;
  order?: string;
  page?: number;
  limit?: number;
} = {}): Promise<FileListResult> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.category_id) qs.set('category_id', params.category_id);
  if (params.sort) qs.set('sort', params.sort);
  if (params.order) qs.set('order', params.order);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return request<FileListResult>(query ? `?${query}` : '');
}

/** 删除文件 */
export async function deleteFile(id: string): Promise<void> {
  await request(`/${id}`, { method: 'DELETE' });
}

/** 获取文件下载 URL（经后端代理，确保原名下载） */
export function getDownloadUrl(id: string): string {
  return `${BASE}/${id}/download`;
}

/** 重命名文件 */
export async function renameFile(id: string, name: string): Promise<PersonalFile> {
  const res = await request<{ ok: boolean; file: PersonalFile }>(`/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  return res.file;
}

/** 移动文件到分类 */
export async function moveFile(id: string, categoryId: string | null): Promise<PersonalFile> {
  const res = await request<{ ok: boolean; file: PersonalFile }>(`/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ category_id: categoryId }),
  });
  return res.file;
}

// ─── 分类操作 ──────────────────────────────────────────────

/** 获取分类列表 */
export async function listCategories(): Promise<CategoryListResult> {
  return request<CategoryListResult>('/categories');
}

/** 创建分类 */
export async function createCategory(name: string): Promise<FileCategory> {
  const res = await request<{ ok: boolean; category: FileCategory }>('/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return res.category;
}

/** 重命名分类 */
export async function renameCategory(id: string, name: string): Promise<void> {
  await request(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

/** 删除分类 */
export async function deleteCategory(id: string): Promise<void> {
  await request(`/categories/${id}`, { method: 'DELETE' });
}
