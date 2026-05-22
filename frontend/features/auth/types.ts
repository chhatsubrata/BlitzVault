export type PublicUser = {
  id: string;
  clerk_user_id: string;
  email: string;
  username: string;
  created_at: string;
  updated_at: string;
};

export type SyncUserResponse = {
  user: PublicUser;
};
