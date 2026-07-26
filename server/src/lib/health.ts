export const getHealthPayload = () => ({
  status: 'healthy',
  service: 'prixmoai-backend',
  timestamp: new Date().toISOString(),
});
