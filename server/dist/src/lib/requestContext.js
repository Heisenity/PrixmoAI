"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentRequestContext = exports.getCurrentRequestContextSnapshot = exports.getCurrentRequestSuperAdminTestPlan = exports.isCurrentRequestSuperAdmin = exports.getAuthenticatedRequestUserId = exports.setAuthenticatedRequestContext = exports.runWithRequestContext = void 0;
const node_async_hooks_1 = require("node:async_hooks");
const requestContextStorage = new node_async_hooks_1.AsyncLocalStorage();
const runWithRequestContext = (context, callback) => requestContextStorage.run(context, callback);
exports.runWithRequestContext = runWithRequestContext;
const getCurrentRequestContext = () => requestContextStorage.getStore() ?? null;
exports.getCurrentRequestContext = getCurrentRequestContext;
const setAuthenticatedRequestContext = (options) => {
    const context = getCurrentRequestContext();
    if (!context) {
        return;
    }
    context.authenticatedUserId = options.authenticatedUserId;
    context.isSuperAdminRequest = options.isSuperAdminRequest;
    context.superAdminTestPlan = options.superAdminTestPlan;
};
exports.setAuthenticatedRequestContext = setAuthenticatedRequestContext;
const getAuthenticatedRequestUserId = () => getCurrentRequestContext()?.authenticatedUserId ?? null;
exports.getAuthenticatedRequestUserId = getAuthenticatedRequestUserId;
const isCurrentRequestSuperAdmin = () => getCurrentRequestContext()?.isSuperAdminRequest === true;
exports.isCurrentRequestSuperAdmin = isCurrentRequestSuperAdmin;
const getCurrentRequestSuperAdminTestPlan = () => getCurrentRequestContext()?.superAdminTestPlan ?? null;
exports.getCurrentRequestSuperAdminTestPlan = getCurrentRequestSuperAdminTestPlan;
const getCurrentRequestContextSnapshot = () => getCurrentRequestContext();
exports.getCurrentRequestContextSnapshot = getCurrentRequestContextSnapshot;
