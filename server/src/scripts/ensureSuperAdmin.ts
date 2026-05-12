import { ensureConfiguredSuperAdminAccount } from '../lib/superAdmin';

const main = async () => {
  const result = await ensureConfiguredSuperAdminAccount();

  if (!result?.email) {
    console.log(
      'Super admin account was not ensured because Supabase admin credentials are not configured.'
    );
    return;
  }

  console.log(
    `Super admin account ensured for ${result.email}${result.userId ? ` (${result.userId})` : ''}.`
  );
};

void main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Failed to ensure the configured super admin account.'
  );
  process.exit(1);
});
