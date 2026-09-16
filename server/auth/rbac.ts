import { UserRole } from '../models/types';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  'admin': 100,
  'project-manager': 80,
  'product-manager': 80,
  'team-member': 50,
  'viewer': 10,
};

export function isKnownRole(role: unknown): role is UserRole {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY, role);
}

export function hasPermission(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  // Fail closed: an unrecognised caller role never satisfies a guard.
  if (!isKnownRole(userRole)) return false;
  if (userRole === 'admin') return true; // Admins bypass all role checks

  // Fail closed: unrecognised entries in the required list are discarded rather
  // than treated as level 0. Flooring them at 0 would drop the minimum required
  // level to 0 and silently grant every authenticated user (including viewers)
  // access to the endpoint.
  const knownRequiredRoles = (requiredRoles || []).filter(isKnownRole);
  if (knownRequiredRoles.length === 0) return false;

  if (knownRequiredRoles.includes(userRole)) return true;

  const userLevel = ROLE_HIERARCHY[userRole];
  const minRequiredLevel = Math.min(...knownRequiredRoles.map((r) => ROLE_HIERARCHY[r]));

  return userLevel >= minRequiredLevel;
}
