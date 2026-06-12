import { Users } from "../entities/Users";

// No sensitive columns on Users (Clerk owns credentials); kept as a stable
// mapping seam for future redaction of public-facing user fields.
export type PublicUser = Users;

export const toPublicUser = (user: Users): PublicUser => user;
