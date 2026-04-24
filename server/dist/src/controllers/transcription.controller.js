"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeGenerateAudio = void 0;
const requestCancellation_1 = require("../lib/requestCancellation");
const transcription_1 = require("../ai/transcription");
const transcribeGenerateAudio = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    const cancellation = (0, requestCancellation_1.createRequestCancellation)(req, res);
    console.info('[transcription] request started', {
        userId: req.user.id,
        mimeType: req.body.mimeType,
        languageHint: req.body.languageHint ?? null,
        stage: req.body.stage ?? 'final',
        previousContextChars: req.body.previousContext?.length || 0,
        audioBase64Chars: req.body.audioBase64.length,
    });
    try {
        const result = await (0, transcription_1.transcribeAudioWithGroq)({
            audioBase64: req.body.audioBase64,
            mimeType: req.body.mimeType,
            languageHint: req.body.languageHint,
            previousContext: req.body.previousContext,
            stage: req.body.stage,
            signal: cancellation.signal,
        });
        return res.status(200).json({
            status: 'success',
            message: 'Audio transcribed successfully',
            data: result,
        });
    }
    catch (error) {
        if ((0, requestCancellation_1.isRequestCancelledError)(error)) {
            return;
        }
        console.error('[transcription] request failed', {
            userId: req.user.id,
            mimeType: req.body.mimeType,
            languageHint: req.body.languageHint ?? null,
            stage: req.body.stage ?? 'final',
            previousContextChars: req.body.previousContext?.length || 0,
            error: error instanceof Error ? error.message : String(error),
        });
        return res.status(502).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to transcribe audio',
        });
    }
    finally {
        console.info('[transcription] request finished', {
            userId: req.user.id,
            mimeType: req.body.mimeType,
        });
        cancellation.cleanup();
    }
};
exports.transcribeGenerateAudio = transcribeGenerateAudio;
