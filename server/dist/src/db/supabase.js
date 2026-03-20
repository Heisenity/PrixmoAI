"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSupabaseAdmin = exports.requireUserClient = exports.createUserClient = exports.supabaseAdmin = exports.supabaseAuth = exports.isSupabaseAdminConfigured = exports.isSupabaseAuthConfigured = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const clientOptions = {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
};
exports.isSupabaseAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);
exports.isSupabaseAdminConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);
if (!exports.isSupabaseAuthConfigured) {
    console.warn('Supabase auth client is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env.');
}
if (!exports.isSupabaseAdminConfigured) {
    console.warn('Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY in server/.env for server-side queries and webhooks.');
}
exports.supabaseAuth = exports.isSupabaseAuthConfigured && supabaseUrl && supabaseAnonKey
    ? (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, clientOptions)
    : null;
exports.supabaseAdmin = exports.isSupabaseAdminConfigured && supabaseUrl && supabaseServiceRoleKey
    ? (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey, clientOptions)
    : null;
const createUserClient = (accessToken) => {
    if (!exports.isSupabaseAuthConfigured || !supabaseUrl || !supabaseAnonKey || !accessToken) {
        return null;
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
        ...clientOptions,
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    });
};
exports.createUserClient = createUserClient;
const requireUserClient = (accessToken) => {
    const client = accessToken ? (0, exports.createUserClient)(accessToken) : null;
    if (!client) {
        throw new Error('Supabase user client is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and send a valid bearer token.');
    }
    return client;
};
exports.requireUserClient = requireUserClient;
const requireSupabaseAdmin = () => {
    if (!exports.supabaseAdmin) {
        throw new Error('Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY in server/.env.');
    }
    return exports.supabaseAdmin;
};
exports.requireSupabaseAdmin = requireSupabaseAdmin;
