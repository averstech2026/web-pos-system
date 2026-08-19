/**
 * Browser-console helpers. Loaded lazily so the seed chunk is not in the
 * initial bundle until someone actually runs `await seedStaffAuth()`.
 */
export function installSeedStaffAuthHelper() {
  if (typeof window === 'undefined' || typeof window.seedStaffAuth === 'function') return;

  window.seedStaffAuth = async (password) => {
    const { seedStaffAuth } = await import('./seed.js');
    window.seedStaffAuth = seedStaffAuth;
    return seedStaffAuth(password);
  };
}
