export type AppRole = 'admin' | 'merchant' | 'driver';

export function dashboardPathForRole(role: AppRole): '/admin' | '/merchant' | '/driver' {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'merchant':
      return '/merchant';
    case 'driver':
      return '/driver';
  }
}
