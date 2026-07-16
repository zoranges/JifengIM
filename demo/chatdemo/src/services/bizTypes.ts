export interface GroupInfo {
  id: string;
  name: string;
  owner_uid: string;
  created_at: string;
  members?: GroupMember[];
  member_count?: number;
}

export interface GroupMember {
  uid: string;
  nickname: string;
  role: number; // 0=member, 1=owner
  joined_at: string;
}

export interface CreateGroupRequest {
  name: string;
  uid: string;
  nickname: string;
}

export interface JoinGroupRequest {
  group_id: string;
  uid: string;
  nickname: string;
}

export interface GroupWithMembers {
  group_id: string;
  group_name: string;
  owner_uid: string;
  my_nickname: string;
  my_role: number;
  members: GroupMember[];
}

export interface EnterpriseMember {
  uid: string;
  nickname: string;
  group_count: number;
  last_active: string;
  group_names: string;
}

export interface PinnedMessage {
  id: number;
  group_id: string;
  message_id: string;
  message_seq: number;
  client_msg_no: string;
  pinned_by_uid: string;
  pinned_by_nickname: string;
  content_preview: string;
  message_type: number;
  from_uid: string;
  created_at: string;
}

export interface UserInfo {
  uid: string;
  name: string;
  created_at?: string;
}

export interface AuthResponse {
  uid: string;
  name: string;
  token: string;
  im_token: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  department: string;
  position: string;
  role: string;
  status: string;
  preset_password: number;
  created_at: string;
}

export interface Department {
  id: number;
  name: string;
  created_at: string;
}

export interface BizError {
  error: string;
}
