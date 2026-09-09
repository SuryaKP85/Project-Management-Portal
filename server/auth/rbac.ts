import { UserRole } from '../models/types';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  'admin': 100,
  'project-manager': 80,
  'product-manager': 80,
  'team-member': 50,
  'viewer': 10,
};

export function hasPermission(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  if (!userRole) return false;
  if (userRole === 'admin') return true; // Admins bypass all role checks
  if (requiredRoles.includes(userRole)) return true;

  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const minRequiredLevel = Math.min(...requiredRoles.map((r) => ROLE_HIERARCHY[r] || 0));

  return userLevel >= minRequiredLevel;
}
