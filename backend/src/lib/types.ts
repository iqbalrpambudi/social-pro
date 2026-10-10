export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export type AppVariables = {
  requestId: string;
  user: AuthenticatedUser;
};
