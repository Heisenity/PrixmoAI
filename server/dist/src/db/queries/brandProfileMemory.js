"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertUsernameRecommendationLog = exports.insertBrandDescriptionSuggestionLog = exports.insertIndustrySuggestionLog = exports.insertBrandProfileMemoryEvent = void 0;
const insertBrandProfileMemoryEvent = async (client, input) => {
    const { error } = await client.from('brand_profile_memory_events').insert({
        user_id: input.userId,
        brand_profile_id: input.brandProfileId ?? null,
        save_context: input.saveContext,
        event_type: input.eventType,
        changed_fields: input.changedFields,
        previous_snapshot: input.previousSnapshot ?? null,
        current_snapshot: input.currentSnapshot,
        field_changes: input.fieldChanges,
    });
    if (error) {
        throw new Error(error.message || 'Failed to store brand profile memory event');
    }
};
exports.insertBrandProfileMemoryEvent = insertBrandProfileMemoryEvent;
const insertIndustrySuggestionLog = async (client, input) => {
    const { error } = await client.from('industry_suggestion_logs').insert({
        user_id: input.userId,
        brand_profile_id: input.brandProfileId ?? null,
        request_context: input.requestContext,
        status: input.status,
        provider: input.provider ?? null,
        request_payload: input.requestPayload,
        response_payload: input.responsePayload ?? null,
        error_message: input.errorMessage ?? null,
    });
    if (error) {
        throw new Error(error.message || 'Failed to store industry suggestion log');
    }
};
exports.insertIndustrySuggestionLog = insertIndustrySuggestionLog;
const insertBrandDescriptionSuggestionLog = async (client, input) => {
    const { error } = await client.from('brand_description_suggestion_logs').insert({
        user_id: input.userId,
        brand_profile_id: input.brandProfileId ?? null,
        request_context: input.requestContext,
        status: input.status,
        provider: input.provider ?? null,
        request_payload: input.requestPayload,
        response_payload: input.responsePayload ?? null,
        error_message: input.errorMessage ?? null,
    });
    if (error) {
        throw new Error(error.message || 'Failed to store brand description suggestion log');
    }
};
exports.insertBrandDescriptionSuggestionLog = insertBrandDescriptionSuggestionLog;
const insertUsernameRecommendationLog = async (client, input) => {
    const { error } = await client.from('username_recommendation_logs').insert({
        user_id: input.userId,
        brand_profile_id: input.brandProfileId ?? null,
        request_context: input.requestContext,
        status: input.status,
        desired_username: input.desiredUsername,
        normalized_username: input.normalizedUsername,
        is_available: input.isAvailable,
        provider: input.provider ?? null,
        request_payload: input.requestPayload,
        response_payload: input.responsePayload ?? null,
        error_message: input.errorMessage ?? null,
    });
    if (error) {
        throw new Error(error.message || 'Failed to store username recommendation log');
    }
};
exports.insertUsernameRecommendationLog = insertUsernameRecommendationLog;
