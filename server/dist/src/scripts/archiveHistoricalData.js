"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const historicalArchive_service_1 = require("../services/historicalArchive.service");
void (0, historicalArchive_service_1.runHistoricalArchiveSweep)({ skipLease: true }).catch((error) => {
    console.error(`[archive] ${error instanceof Error ? error.message : 'Historical archive failed.'}`);
    process.exitCode = 1;
});
