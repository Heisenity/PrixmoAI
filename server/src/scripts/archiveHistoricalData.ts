import { runHistoricalArchiveSweep } from '../services/historicalArchive.service';

void runHistoricalArchiveSweep({ skipLease: true }).catch((error) => {
  console.error(
    `[archive] ${error instanceof Error ? error.message : 'Historical archive failed.'}`
  );
  process.exitCode = 1;
});
