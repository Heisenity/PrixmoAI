"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeAudioWithGroq = void 0;
const node_crypto_1 = require("node:crypto");
const constants_1 = require("../config/constants");
const requestCancellation_1 = require("../lib/requestCancellation");
const SUPPORTED_TRANSCRIPTION_LANGUAGES = new Set([
    'bn',
    'hi',
    'ur',
    'ta',
    'te',
    'ml',
    'kn',
    'pa',
    'en',
]);
const TRANSCRIPTION_PROVIDER_PROMPT_MAX_CHARS = 360;
const TRANSCRIPTION_PROMPT_MAX_BYTES = 760;
const TRANSCRIPTION_CONTEXT_MAX_BYTES = 96;
const TRANSCRIPTION_VOCABULARY_MAX_BYTES = 64;
const TRANSCRIPTION_CACHE_TTL_MS = 10 * 60000;
const TRANSCRIPTION_CACHE_MAX_ENTRIES = 60;
const TRANSCRIPTION_SCRIPT_NORMALIZATION_TIMEOUT_MS = 15000;
const TRANSCRIPTION_CLEANUP_MIN_TOKEN_RATIO = 0.65;
const TRANSCRIPTION_CLEANUP_MAX_TOKEN_RATIO = 1.6;
const TRANSCRIPTION_CONSERVATIVE_CLEANUP_RETRY_RATIO = 0.35;
const TRANSCRIPTION_BENGALI_CONSERVATIVE_CLEANUP_RETRY_RATIO = 0.18;
const CONSERVATIVE_FINAL_CLEANUP_LANGUAGES = new Set([
    'ur',
    'ta',
    'te',
    'ml',
    'kn',
    'pa',
]);
const transcriptionResponseCache = new Map();
const MIME_EXTENSION_MAP = {
    'audio/webm': 'webm',
    'audio/webm;codecs=opus': 'webm',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/ogg': 'ogg',
    'audio/ogg;codecs=opus': 'ogg',
};
const LANGUAGE_TRANSCRIPTION_GUIDES = {
    bn: {
        languageName: 'Bengali',
        prompt: 'বাংলা speech-to-text। বাংলা লিখো। YouTube, Facebook, Instagram, API, Node.js-এর মতো spoken English শব্দ ইংরেজিতেই রাখো। অনুবাদ নয়। না/খালি/শুধু/বাদ/remove/only/without নির্দেশ ঠিক রাখো।',
        cleanupPrompt: 'বাংলা ASR টেক্সট। শুধু স্পষ্ট বানান, spacing, খুব দরকারি ন্যূনতম punctuation, আর clear overlap repetition ঠিক করো। একই শব্দ, একই অর্থ, একই order রাখো। YouTube, Facebook, Instagram, API, Node.js-এর মতো spoken English শব্দ ইংরেজিতেই রাখো। unsure হলে original শব্দ রাখো।',
        contextLabel: 'সাম্প্রতিক প্রসঙ্গ',
        vocabularyLabel: 'সাম্প্রতিক শব্দ',
        cleanupSystemPrompt: 'তুমি বাংলা verbatim transcript normalizer। শুধু obvious spelling, spacing, minimal punctuation, আর overlap repeat ঠিক করো। meaning, word order, negation, include/exclude instruction বদলাবে না। code-mixed English platform বা technical শব্দকে জোর করে বাংলা করো না। unsure হলে original শব্দ রাখো।',
    },
    hi: {
        languageName: 'Hindi',
        prompt: 'हिंदी बोलचाल। देवनागरी में लिखो। अनुवाद या रोमन मत दो। नाम और ब्रांड जैसे बोले गए हैं वैसे रखो।',
        cleanupPrompt: 'हिंदी ASR पाठ। देवनागरी, वर्तनी, शब्द-विराम, विराम-चिह्न, ध्वन्यात्मक ASR गलतियाँ और overlap repetition ठीक करो। अर्थ, वाक्य-क्रम या शब्द मत बदलो। रोमन हिंदी हो तो देवनागरी में दो। code-mixed brand/platform/technical शब्दों का सबसे स्वाभाविक लिखित रूप रखो।',
        contextLabel: 'हाल का संदर्भ',
        vocabularyLabel: 'हाल के शब्द',
        cleanupSystemPrompt: 'तुम हिंदी speech-to-text normalizer हो। केवल ASR की स्पष्ट वर्तनी, लिपि, spacing, punctuation और overlap duplication ठीक करो। अर्थ, intent, sentence order या wording मत बदलो। अनुवाद, सारांश, paraphrase या नए शब्द मत जोड़ो।',
    },
    ur: {
        languageName: 'Urdu',
        prompt: 'اردو گفتگو۔ صرف اردو رسم الخط میں لکھو۔ ترجمہ یا رومن مت دو۔ نام اور برانڈ جیسے بولے گئے ہیں ویسے رکھو۔',
        cleanupPrompt: 'اردو ASR متن۔ صرف املا، فاصلہ، رموزِ اوقاف، رسم الخط، واضح صوتی ASR غلطیاں اور overlap repetition درست کرو۔ مطلب، جملے کی ترتیب یا الفاظ نہ بدلو۔ انگریزی یا رومن ہو تو اردو رسم الخط میں دو۔ code-mixed brand/platform/technical الفاظ کی فطری تحریری شکل برقرار رکھو۔',
        contextLabel: 'حالیہ سیاق',
        vocabularyLabel: 'حالیہ الفاظ',
        cleanupSystemPrompt: 'تم اردو speech-to-text normalizer ہو۔ صرف واضح ASR املا، رسم الخط، spacing، punctuation اور overlap duplication درست کرو۔ مطلب، intent، sentence order یا لفظی مواد نہ بدلو۔ ترجمہ، خلاصہ، paraphrase یا نئے الفاظ مت شامل کرو۔',
    },
    ta: {
        languageName: 'Tamil',
        prompt: 'தமிழ் பேச்சு. தமிழில் மட்டும் எழுது. மொழிபெயர்ப்பு அல்லது Roman எழுத்து வேண்டாம். பெயர், பிராண்ட் எப்படி சொன்னார்களோ அப்படியே வை.',
        cleanupPrompt: 'தமிழ் ASR உரை. தமிழ் எழுத்து, எழுத்துப்பிழை, இடைவெளி, குறியீட்டுப் பிழை, தெளிவான ஒலிப்பிழை ASR தவறுகள் மற்றும் overlap repetition மட்டும் சரி செய். அர்த்தம், வாக்கிய வரிசை அல்லது சொற்களை மாற்றாதே. Roman அல்லது English இருந்தால் தமிழில் கொடு. code-mixed brand/platform/technical சொற்களுக்கு இயல்பான எழுத்து வடிவத்தை வைத்திரு.',
        contextLabel: 'சமீபப் பின்னணி',
        vocabularyLabel: 'சமீபச் சொற்கள்',
        cleanupSystemPrompt: 'நீ தமிழ் speech-to-text normalizer. தெளிவான ASR எழுத்துப்பிழை, லிபி, spacing, punctuation மற்றும் overlap duplication மட்டும் சரி செய். அர்த்தம், நோக்கம், சொல் வரிசை அல்லது உள்ளடக்கச் சொற்களை மாற்றாதே. மொழிபெயர்ப்பு, சுருக்கம், paraphrase அல்லது புதிய சொற்கள் சேர்க்காதே.',
    },
    te: {
        languageName: 'Telugu',
        prompt: 'తెలుగు మాట. తెలుగులోనే రాయండి. అనువాదం లేదా రోమనైజేషన్ వద్దు. పేర్లు, బ్రాండ్‌లు ఎలా వినిపించాయో అలా ఉంచండి.',
        cleanupPrompt: 'తెలుగు ASR పాఠ్యం. తెలుగు లిపి, వర్ణదోషం, ఖాళీలు, విరామచిహ్నాలు, స్పష్టమైన ధ్వన్యాత్మక ASR తప్పులు మరియు overlap repetition మాత్రమే సరిచేయండి. అర్థం, వాక్య క్రమం లేదా పదాలను మార్చవద్దు. English లేదా Roman ఉంటే తెలుగులోకి మార్చండి. code-mixed brand/platform/technical పదాలకు సహజమైన లిఖిత రూపాన్ని ఉంచండి.',
        contextLabel: 'ఇటీవలి సందర్భం',
        vocabularyLabel: 'ఇటీవలి పదాలు',
        cleanupSystemPrompt: 'మీరు తెలుగు speech-to-text normalizer. స్పష్టమైన ASR వర్ణదోషం, లిపి, spacing, punctuation మరియు overlap duplication మాత్రమే సరిచేయండి. అర్థం, ఉద్దేశ్యం, పదక్రమం లేదా ముఖ్య పదాలను మార్చవద్దు. అనువాదం, సారాంశం, paraphrase లేదా కొత్త పదాలు జోడించవద్దు.',
    },
    ml: {
        languageName: 'Malayalam',
        prompt: 'മലയാളം സംസാരമാണ്. മലയാളത്തിൽ മാത്രം എഴുതുക. വിവർത്തനമോ റോമൻ ലിപിയോ വേണ്ട. പേര്, ബ്രാൻഡ് കേട്ടതുപോലെ തന്നെ നിലനിർത്തുക.',
        cleanupPrompt: 'മലയാളം ASR വാചകം. മലയാള ലിപി, അക്ഷരപ്പിശക്, ഇടവേള, പങ്ക്ചുവേഷൻ, വ്യക്തമായ ശബ്ദാധിഷ്ഠിത ASR പിശകുകൾ, overlap repetition എന്നിവ മാത്രം ശരിയാക്കുക. അർത്ഥം, വാക്യക്രമം അല്ലെങ്കിൽ വാക്കുകൾ മാറ്റരുത്. English അല്ലെങ്കിൽ Roman ഉണ്ടെങ്കിൽ മലയാളത്തിലാക്കുക. code-mixed brand/platform/technical വാക്കുകളുടെ സ്വാഭാവിക എഴുത്തുരൂപം നിലനിർത്തുക.',
        contextLabel: 'സമീപകാല പ്രസംഗം',
        vocabularyLabel: 'സമീപകാല പദങ്ങൾ',
        cleanupSystemPrompt: 'നീ മലയാളം speech-to-text normalizer ആണ്. വ്യക്തമായ ASR അക്ഷരപ്പിശക്, ലിപി, spacing, punctuation, overlap duplication എന്നിവ മാത്രം ശരിയാക്കുക. അർത്ഥം, ഉദ്ദേശ്യം, വാക്കുകളുടെ ക്രമം അല്ലെങ്കിൽ ഉള്ളടക്ക വാക്കുകൾ മാറ്റരുത്. വിവർത്തനം, ചുരുക്കം, paraphrase, പുതിയ വാക്കുകൾ എന്നിവ ചേർക്കരുത്.',
    },
    kn: {
        languageName: 'Kannada',
        prompt: 'ಕನ್ನಡ ಮಾತು. ಕನ್ನಡದಲ್ಲೇ ಬರೆಯಿರಿ. ಅನುವಾದ ಅಥವಾ ರೋಮನ ಲಿಪಿ ಬೇಡ. ಹೆಸರು, ಬ್ರ್ಯಾಂಡ್ ಕೇಳಿದ ಹಾಗೆಯೇ ಇಡಿ.',
        cleanupPrompt: 'ಕನ್ನಡ ASR ಪಠ್ಯ. ಕನ್ನಡ ಲಿಪಿ, ಸ್ಪಷ್ಟ ಉಚ್ಚಾರಣಾಧಾರಿತ ASR ಅಕ್ಷರ ದೋಷ, ಖಾಲಿ ಜಾಗ, ವಿರಾಮ ಚಿಹ್ನೆ ಮತ್ತು overlap repetition ಮಾತ್ರ ಸರಿಪಡಿಸಿ. ಅರ್ಥ, ವಾಕ್ಯ ಕ್ರಮ ಅಥವಾ ಪದಗಳನ್ನು ಬದಲಿಸಬೇಡಿ. English ಅಥವಾ Roman ಇದ್ದರೆ ಕನ್ನಡಕ್ಕೆ ಬದಲಿಸಿ. code-mixed brand/platform/technical ಪದಗಳ ಸ್ವಾಭಾವಿಕ ಲಿಖಿತ ರೂಪವನ್ನು ಉಳಿಸಿ.',
        contextLabel: 'ಇತ್ತೀಚಿನ ಸಂದರ್ಭ',
        vocabularyLabel: 'ಇತ್ತೀಚಿನ ಪದಗಳು',
        cleanupSystemPrompt: 'ನೀವು ಕನ್ನಡ speech-to-text normalizer. ಸ್ಪಷ್ಟ ASR ಅಕ್ಷರದೋಷ, ಲಿಪಿ, spacing, punctuation ಮತ್ತು overlap duplication ಮಾತ್ರ ಸರಿಪಡಿಸಿ. ಅರ್ಥ, ಉದ್ದೇಶ, ಪದಕ್ರಮ ಅಥವಾ ವಿಷಯಪದಗಳನ್ನು ಬದಲಿಸಬೇಡಿ. ಅನುವಾದ, ಸಂಕ್ಷೇಪ, paraphrase ಅಥವಾ ಹೊಸ ಪದಗಳನ್ನು ಸೇರಿಸಬೇಡಿ.',
    },
    pa: {
        languageName: 'Punjabi',
        prompt: 'ਪੰਜਾਬੀ ਗੱਲਬਾਤ। ਗੁਰਮੁਖੀ ਵਿੱਚ ਹੀ ਲਿਖੋ। ਅਨੁਵਾਦ ਜਾਂ ਰੋਮਨ ਨਾ ਦਿਓ। ਨਾਮ ਅਤੇ ਬ੍ਰਾਂਡ ਜਿਵੇਂ ਬੋਲੇ ਗਏ ਹਨ ਤਿਵੇਂ ਰੱਖੋ।',
        cleanupPrompt: 'ਪੰਜਾਬੀ ASR ਲਿਖਤ। ਸਿਰਫ ਗੁਰਮੁਖੀ, ਵਰਤਨੀ, ਖਾਲੀ ਥਾਂ, ਵਿਸ਼ਰਾਮ-ਚਿੰਨ੍ਹ, ਸਪੱਸ਼ਟ ਧੁਨੀ-ਅਧਾਰਿਤ ASR ਗਲਤੀਆਂ ਅਤੇ overlap repetition ਠੀਕ ਕਰੋ। ਅਰਥ, ਵਾਕ ਕ੍ਰਮ ਜਾਂ ਸ਼ਬਦ ਨਾ ਬਦਲੋ। English ਜਾਂ Roman ਹੋਵੇ ਤਾਂ ਗੁਰਮੁਖੀ ਵਿੱਚ ਦਿਓ। code-mixed brand/platform/technical ਸ਼ਬਦਾਂ ਦੀ ਕੁਦਰਤੀ ਲਿਖਤ ਰੱਖੋ।',
        contextLabel: 'ਹਾਲੀਆ ਸੰਦਰਭ',
        vocabularyLabel: 'ਹਾਲੀਆ ਸ਼ਬਦ',
        cleanupSystemPrompt: 'ਤੂੰ ਪੰਜਾਬੀ speech-to-text normalizer ਹੈਂ। ਸਿਰਫ ਸਪੱਸ਼ਟ ASR ਵਰਤਨੀ, ਲਿਪੀ, spacing, punctuation ਅਤੇ overlap duplication ਠੀਕ ਕਰ। ਅਰਥ, intent, sentence order ਜਾਂ content words ਨਾ ਬਦਲ। ਅਨੁਵਾਦ, ਸਾਰ, paraphrase ਜਾਂ ਨਵੇਂ ਸ਼ਬਦ ਨਾ ਜੋੜ।',
    },
    en: {
        languageName: 'English',
        prompt: 'Spoken English. Write in English only. No translation. Keep names, brands, and technical terms as spoken.',
        cleanupPrompt: 'English ASR text. Fix only obvious spelling, spacing, punctuation, casing, and chunk-overlap repetition. Preserve exact meaning and wording.',
        contextLabel: 'Recent context',
        vocabularyLabel: 'Recent terms',
    },
};
const LANGUAGE_SCRIPT_GUIDES = {
    bn: {
        name: 'Bengali script',
        charPattern: /[\u0980-\u09FF]/gu,
    },
    hi: {
        name: 'Devanagari',
        charPattern: /[\u0900-\u097F]/gu,
    },
    ur: {
        name: 'Urdu script',
        charPattern: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/gu,
    },
    ta: {
        name: 'Tamil script',
        charPattern: /[\u0B80-\u0BFF]/gu,
    },
    te: {
        name: 'Telugu script',
        charPattern: /[\u0C00-\u0C7F]/gu,
    },
    ml: {
        name: 'Malayalam script',
        charPattern: /[\u0D00-\u0D7F]/gu,
    },
    kn: {
        name: 'Kannada script',
        charPattern: /[\u0C80-\u0CFF]/gu,
    },
    pa: {
        name: 'Gurmukhi script',
        charPattern: /[\u0A00-\u0A7F]/gu,
    },
    en: {
        name: 'English',
        charPattern: /[A-Za-z]/gu,
    },
};
const dedupeImmediateRepeatedPhrases = (value) => {
    const normalized = normalizeTranscriptText(value);
    if (!normalized) {
        return normalized;
    }
    const tokens = normalized.split(/\s+/);
    if (tokens.length < 6) {
        return normalized;
    }
    const dedupedTokens = [];
    let index = 0;
    while (index < tokens.length) {
        let consumedOverlap = false;
        const maxPhraseLength = Math.min(12, Math.floor((tokens.length - index) / 2));
        for (let phraseLength = maxPhraseLength; phraseLength >= 3; phraseLength -= 1) {
            const firstPhrase = tokens.slice(index, index + phraseLength).join(' ');
            const secondPhrase = tokens
                .slice(index + phraseLength, index + phraseLength * 2)
                .join(' ');
            if (firstPhrase && firstPhrase === secondPhrase) {
                dedupedTokens.push(...tokens.slice(index, index + phraseLength));
                index += phraseLength * 2;
                consumedOverlap = true;
                break;
            }
        }
        if (!consumedOverlap) {
            dedupedTokens.push(tokens[index] ?? '');
            index += 1;
        }
    }
    return normalizeTranscriptText(dedupedTokens.join(' '));
};
const collapseRepeatedTrailingSpan = (value) => {
    const normalized = normalizeTranscriptText(value);
    if (!normalized) {
        return normalized;
    }
    const tokens = normalized.split(/\s+/);
    if (tokens.length < 8) {
        return normalized;
    }
    const maxSpan = Math.min(16, Math.floor(tokens.length / 2));
    for (let spanLength = maxSpan; spanLength >= 3; spanLength -= 1) {
        const leading = tokens.slice(0, tokens.length - spanLength);
        const trailing = tokens.slice(tokens.length - spanLength);
        for (let startIndex = Math.max(0, leading.length - spanLength - 4); startIndex < leading.length; startIndex += 1) {
            const candidate = leading.slice(startIndex, startIndex + spanLength);
            if (candidate.length !== trailing.length) {
                continue;
            }
            const matches = candidate.every((token, index) => token === trailing[index]);
            if (matches) {
                return normalizeTranscriptText(tokens.slice(0, tokens.length - spanLength).join(' '));
            }
        }
    }
    return normalized;
};
const normalizeTranscriptText = (value) => value
    .normalize('NFC')
    .replace(/�+/gu, '')
    .replace(/\u200B|\u200C|\u200D|\uFEFF/gu, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
const DEV_TRANSCRIPTION_PREVIEW_MAX_CHARS = 180;
const DEV_CLEANUP_DRIFT_MIN_RATIO = 0.12;
const summarizeForDebug = (value) => {
    const normalized = normalizeTranscriptText(value);
    if (normalized.length <= DEV_TRANSCRIPTION_PREVIEW_MAX_CHARS) {
        return normalized;
    }
    return `${normalized.slice(0, DEV_TRANSCRIPTION_PREVIEW_MAX_CHARS - 1)}…`;
};
const buildTranscriptDiffHint = (rawTranscript, cleanedTranscript) => {
    const rawTokens = normalizeTranscriptText(rawTranscript).split(/\s+/).filter(Boolean);
    const cleanedTokens = normalizeTranscriptText(cleanedTranscript)
        .split(/\s+/)
        .filter(Boolean);
    const maxScan = Math.min(rawTokens.length, cleanedTokens.length);
    let firstDiffIndex = -1;
    for (let index = 0; index < maxScan; index += 1) {
        if (rawTokens[index] !== cleanedTokens[index]) {
            firstDiffIndex = index;
            break;
        }
    }
    if (firstDiffIndex === -1 && rawTokens.length !== cleanedTokens.length) {
        firstDiffIndex = maxScan;
    }
    if (firstDiffIndex === -1) {
        return null;
    }
    const windowStart = Math.max(0, firstDiffIndex - 3);
    const windowEnd = firstDiffIndex + 4;
    const rawSlice = rawTokens.slice(windowStart, windowEnd).join(' ');
    const cleanedSlice = cleanedTokens.slice(windowStart, windowEnd).join(' ');
    return {
        firstDiffIndex,
        rawSnippet: summarizeForDebug(rawSlice),
        cleanedSnippet: summarizeForDebug(cleanedSlice),
    };
};
const estimateTranscriptChangeRatio = (rawTranscript, cleanedTranscript) => {
    const rawTokens = normalizeTranscriptText(rawTranscript).split(/\s+/).filter(Boolean);
    const cleanedTokens = normalizeTranscriptText(cleanedTranscript)
        .split(/\s+/)
        .filter(Boolean);
    const totalTokens = Math.max(rawTokens.length, cleanedTokens.length, 1);
    const maxScan = Math.max(rawTokens.length, cleanedTokens.length);
    let changedTokens = Math.abs(rawTokens.length - cleanedTokens.length);
    for (let index = 0; index < maxScan; index += 1) {
        if ((rawTokens[index] ?? '') !== (cleanedTokens[index] ?? '')) {
            changedTokens += 1;
        }
    }
    return Math.min(1, changedTokens / totalTokens);
};
const toTranscriptionErrorMessage = (payload, fallback) => payload?.error?.message?.trim() || fallback;
const withTimeout = async (timeoutMs, runner, requestSignal) => {
    (0, requestCancellation_1.throwIfRequestCancelled)(requestSignal, 'Transcription cancelled by user.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const handleAbort = () => controller.abort();
    requestSignal?.addEventListener('abort', handleAbort);
    try {
        return await runner(controller.signal);
    }
    catch (error) {
        if (error instanceof requestCancellation_1.RequestCancelledError) {
            throw error;
        }
        if (requestSignal?.aborted) {
            throw new requestCancellation_1.RequestCancelledError('Transcription cancelled by user.');
        }
        if ((0, requestCancellation_1.isAbortError)(error)) {
            throw new Error(`Voice transcription timed out after ${Math.round(timeoutMs / 1000)}s`);
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
        requestSignal?.removeEventListener('abort', handleAbort);
    }
};
const inferAudioExtension = (mimeType) => MIME_EXTENSION_MAP[mimeType.trim().toLowerCase()] ?? 'webm';
const summarizeBinaryHeader = (binary) => binary.subarray(0, 16).toString('hex');
const normalizeAudioMimeType = (mimeType) => mimeType.split(';')[0]?.trim().toLowerCase() || 'audio/webm';
const trimToBudget = (value, maxBytes) => {
    if (Buffer.byteLength(value, 'utf8') <= maxBytes) {
        return { text: value, truncated: false };
    }
    let endIndex = value.length;
    while (endIndex > 0) {
        const candidate = value.slice(0, endIndex).trimEnd();
        if (Buffer.byteLength(candidate, 'utf8') <= maxBytes) {
            return {
                text: candidate,
                truncated: true,
            };
        }
        endIndex -= 1;
    }
    return {
        text: '',
        truncated: true,
    };
};
const trimTailToBudget = (value, maxBytes) => {
    if (Buffer.byteLength(value, 'utf8') <= maxBytes) {
        return { text: value, truncated: false };
    }
    let startIndex = 0;
    while (startIndex < value.length) {
        const candidate = value.slice(startIndex).trimStart();
        if (Buffer.byteLength(candidate, 'utf8') <= maxBytes) {
            return {
                text: candidate,
                truncated: true,
            };
        }
        startIndex += 1;
    }
    return {
        text: '',
        truncated: true,
    };
};
const trimToCharacterBudget = (value, maxChars) => {
    if (value.length <= maxChars) {
        return { text: value, truncated: false };
    }
    return {
        text: value.slice(0, Math.max(0, maxChars)).trimEnd(),
        truncated: true,
    };
};
const clampPromptToProviderLimits = (value) => {
    const byteTrimmed = trimToBudget(value, TRANSCRIPTION_PROMPT_MAX_BYTES);
    const charTrimmed = trimToCharacterBudget(byteTrimmed.text, TRANSCRIPTION_PROVIDER_PROMPT_MAX_CHARS);
    return {
        text: charTrimmed.text.trim(),
        truncated: byteTrimmed.truncated || charTrimmed.truncated,
    };
};
const resolveLanguageHint = (languageHint) => {
    const normalized = languageHint?.trim().toLowerCase();
    return normalized && SUPPORTED_TRANSCRIPTION_LANGUAGES.has(normalized)
        ? normalized
        : 'en';
};
const buildBinaryHash = (value) => (0, node_crypto_1.createHash)('sha1').update(value).digest('hex');
const buildCacheKey = (audioHash, mimeType, languageHint, promptHash, stage) => (0, node_crypto_1.createHash)('sha1')
    .update(audioHash)
    .update('\u0000')
    .update(mimeType)
    .update('\u0000')
    .update(languageHint)
    .update('\u0000')
    .update(promptHash)
    .update('\u0000')
    .update(stage)
    .digest('hex');
const readCachedTranscription = (key) => {
    const entry = transcriptionResponseCache.get(key);
    if (!entry) {
        return null;
    }
    if (Date.now() - entry.cachedAt > TRANSCRIPTION_CACHE_TTL_MS) {
        transcriptionResponseCache.delete(key);
        return null;
    }
    transcriptionResponseCache.delete(key);
    transcriptionResponseCache.set(key, entry);
    return entry.result;
};
const writeCachedTranscription = (key, result) => {
    if (transcriptionResponseCache.has(key)) {
        transcriptionResponseCache.delete(key);
    }
    transcriptionResponseCache.set(key, {
        cachedAt: Date.now(),
        result,
    });
    while (transcriptionResponseCache.size > TRANSCRIPTION_CACHE_MAX_ENTRIES) {
        const oldestKey = transcriptionResponseCache.keys().next().value;
        if (!oldestKey) {
            break;
        }
        transcriptionResponseCache.delete(oldestKey);
    }
};
const buildVocabularyHints = (previousContext, language) => {
    if (!previousContext) {
        return '';
    }
    const normalizedContext = normalizeTranscriptText(previousContext);
    if (!normalizedContext) {
        return '';
    }
    const matches = language === 'bn'
        ? normalizedContext.match(/[A-Za-z][A-Za-z0-9.+#/_-]{1,}/g) ?? []
        : normalizedContext.match(/[\p{L}\p{N}][\p{L}\p{N}\-_.]{2,}/gu) ?? [];
    const uniqueTokens = new Set();
    for (const match of matches) {
        const cleanedToken = match.trim();
        if (!cleanedToken) {
            continue;
        }
        uniqueTokens.add(cleanedToken);
        if (uniqueTokens.size >= 3) {
            break;
        }
    }
    return trimToBudget(Array.from(uniqueTokens).join(', '), TRANSCRIPTION_VOCABULARY_MAX_BYTES).text;
};
const buildContextHints = (previousContext, language) => {
    if (!previousContext || !TRANSCRIPTION_CONTEXT_MAX_BYTES) {
        return {
            text: '',
            truncated: false,
        };
    }
    const normalizedContext = normalizeTranscriptText(previousContext);
    if (!normalizedContext) {
        return {
            text: '',
            truncated: false,
        };
    }
    if (language === 'bn') {
        const bengaliTokens = normalizedContext.match(/[\u0980-\u09FFA-Za-z0-9][\u0980-\u09FFA-Za-z0-9\-_.]*/gu) ??
            [];
        const contextSeed = bengaliTokens.slice(-10).join(' ').trim();
        if (!contextSeed) {
            return {
                text: '',
                truncated: false,
            };
        }
        return trimTailToBudget(contextSeed, TRANSCRIPTION_CONTEXT_MAX_BYTES);
    }
    return {
        text: '',
        truncated: false,
    };
};
const countMatches = (value, pattern) => {
    pattern.lastIndex = 0;
    return value.match(pattern)?.length ?? 0;
};
const shouldNormalizeScript = (value, language) => {
    if (!value.trim() || language === 'en') {
        return false;
    }
    const scriptGuide = LANGUAGE_SCRIPT_GUIDES[language];
    if (!scriptGuide) {
        return false;
    }
    const targetScriptChars = countMatches(value, scriptGuide.charPattern);
    const latinChars = countMatches(value, /[A-Za-z]/gu);
    const letterLikeChars = countMatches(value, /[\p{L}]/gu);
    if (!letterLikeChars) {
        return false;
    }
    const targetScriptRatio = targetScriptChars / letterLikeChars;
    const latinRatio = latinChars / letterLikeChars;
    return targetScriptRatio < 0.55 && latinRatio > 0.2;
};
const buildCleanupPrompt = (language, transcript) => {
    const guide = LANGUAGE_TRANSCRIPTION_GUIDES[language];
    const scriptGuide = LANGUAGE_SCRIPT_GUIDES[language];
    if (!guide || !scriptGuide) {
        return null;
    }
    return [
        guide.cleanupPrompt,
        language === 'en' ? null : `Only ${scriptGuide.name}.`,
        'Preserve meaning, wording, and word order exactly.',
        'Fix only obvious spelling, script, spacing, duplicate overlap, and very minimal punctuation.',
        'Do not replace words, paraphrase, reorder, beautify, or improve grammar.',
        'Keep natural code-mixed names, brands, products, platforms, and technical terms in their standard spoken/written form.',
        'If uncertain, keep the original wording.',
        'Raw transcript:',
        normalizeTranscriptText(transcript),
        'Return only the cleaned transcript.',
    ]
        .filter(Boolean)
        .join('\n')
        .trim();
};
const buildConservativeCleanupPrompt = (language, transcript) => {
    const guide = LANGUAGE_TRANSCRIPTION_GUIDES[language];
    const scriptGuide = LANGUAGE_SCRIPT_GUIDES[language];
    if (!guide || !scriptGuide) {
        return null;
    }
    return [
        guide.cleanupPrompt,
        language === 'en' ? null : `Only ${scriptGuide.name}.`,
        'Preserve meaning, clause order, and content words exactly.',
        'Correct only obvious spelling, script, spacing, duplicate overlap, and only minimal punctuation if clearly needed.',
        language === 'bn'
            ? 'Do not rewrite Bengali words that are already understandable. Keep punctuation minimal.'
            : null,
        'If a content word is uncertain, keep the original word instead of replacing it.',
        'Do not reinterpret unclear words. Do not make the sentence more formal.',
        'Do not translate, summarize, paraphrase, or invent words.',
        'Raw transcript:',
        normalizeTranscriptText(transcript),
        'Return only the cleaned transcript.',
    ]
        .filter(Boolean)
        .join('\n')
        .trim();
};
const countTranscriptTokens = (value) => normalizeTranscriptText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;
const tokenizeTranscript = (value) => normalizeTranscriptText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
const levenshteinDistance = (source, target) => {
    if (source === target) {
        return 0;
    }
    if (!source.length) {
        return target.length;
    }
    if (!target.length) {
        return source.length;
    }
    const previous = Array.from({ length: target.length + 1 }, (_, index) => index);
    const current = new Array(target.length + 1).fill(0);
    for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
        current[0] = sourceIndex;
        for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
            const substitutionCost = source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1;
            current[targetIndex] = Math.min(previous[targetIndex] + 1, current[targetIndex - 1] + 1, previous[targetIndex - 1] + substitutionCost);
        }
        for (let targetIndex = 0; targetIndex < previous.length; targetIndex += 1) {
            previous[targetIndex] = current[targetIndex] ?? 0;
        }
    }
    return previous[target.length] ?? 0;
};
const canonicalizeComparisonToken = (value) => value
    .normalize('NFC')
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
    .trim();
const getComparableTokens = (value) => tokenizeTranscript(value)
    .map((token) => canonicalizeComparisonToken(token).toLowerCase())
    .filter(Boolean);
const estimateComparableTokenOverlap = (source, target) => {
    const sourceTokens = getComparableTokens(source);
    const targetTokens = getComparableTokens(target);
    if (!sourceTokens.length || !targetTokens.length) {
        return 0;
    }
    const targetCounts = new Map();
    for (const token of targetTokens) {
        targetCounts.set(token, (targetCounts.get(token) ?? 0) + 1);
    }
    let overlapCount = 0;
    for (const token of sourceTokens) {
        const count = targetCounts.get(token) ?? 0;
        if (count <= 0) {
            continue;
        }
        overlapCount += 1;
        targetCounts.set(token, count - 1);
    }
    return overlapCount / Math.max(1, Math.min(sourceTokens.length, targetTokens.length));
};
const hasRepeatedTokenRun = (value, minRunLength = 3) => {
    const comparableTokens = getComparableTokens(value);
    let previousToken = '';
    let currentRun = 0;
    for (const token of comparableTokens) {
        if (token && token === previousToken) {
            currentRun += 1;
        }
        else {
            previousToken = token;
            currentRun = token ? 1 : 0;
        }
        if (token && currentRun >= minRunLength) {
            return true;
        }
    }
    return false;
};
const hasSuspiciousNumericWordAttachment = (value) => /(?:[\u09E6-\u09EF0-9][\u09E6-\u09EF0-9]+[\p{L}]+|[\p{L}]+[\u09E6-\u09EF0-9]{2,})/u.test(normalizeTranscriptText(value));
const normalizeBengaliBrands = (value) => value
    .replace(/ইন্স্টা(?:গ্রাম|গরাম)|ইন্স্টারাম|ইনস্টাগ্রাম|ইন্স্টাগরাম/giu, 'Instagram')
    .replace(/ফেস্বুক|ফেসবুক|ফেইসবুক|ফেজবুক/giu, 'Facebook')
    .replace(/যূটুপে?|যূটুবে?|ইউটিউব|ইউটুপ|ইউটুব|যুটুব|যুটুবে?/giu, 'YouTube')
    .replace(/আইফন|আইফোন/giu, 'iPhone');
const splitBengaliClauses = (value) => normalizeTranscriptText(value)
    .split(/[,.!?;:।\n]+/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
const removeSemanticRepetition = (value) => {
    const clauses = splitBengaliClauses(value);
    if (clauses.length < 2) {
        return normalizeTranscriptText(value);
    }
    const keptClauses = [];
    for (const clause of clauses) {
        const previousClause = keptClauses[keptClauses.length - 1];
        if (!previousClause) {
            keptClauses.push(clause);
            continue;
        }
        const overlapRatio = estimateComparableTokenOverlap(clause, previousClause);
        if (overlapRatio > 0.6) {
            continue;
        }
        keptClauses.push(clause);
    }
    return normalizeTranscriptText(keptClauses.join(', '));
};
const buildBengaliVerifierPrompt = (rawTranscript, cleanedTranscript, previousContext) => [
    'তুমি বাংলা final transcript verifier।',
    'Raw ASR-কে source of truth ধরে কেবল স্পষ্ট spelling, spacing, repeated overlap, number-word corruption, এবং obvious ASR noise ঠিক করো।',
    'Meaning, word order, intent, এবং content words বদলাবে না।',
    'Repeated same-token spam বা clear gibberish tail থাকলে remove করতে পারো।',
    'YouTube, Facebook, Instagram, API, Node.js-এর মতো spoken English শব্দ ইংরেজিতেই রাখতে পারো।',
    'If unsure, keep the original wording from raw ASR.',
    previousContext
        ? ['Preview context for continuity:', normalizeTranscriptText(previousContext)].join('\n')
        : null,
    'Raw ASR:',
    normalizeTranscriptText(rawTranscript),
    'Current cleaned transcript:',
    normalizeTranscriptText(cleanedTranscript),
    'Return only the verified Bengali transcript.',
]
    .filter(Boolean)
    .join('\n');
const shouldRejectHindiCleanupDrift = (rawTranscript, cleanedTranscript, needsScriptRecovery) => {
    if (needsScriptRecovery) {
        return false;
    }
    const rawTokens = tokenizeTranscript(rawTranscript).map(canonicalizeComparisonToken);
    const cleanedTokens = tokenizeTranscript(cleanedTranscript).map(canonicalizeComparisonToken);
    if (!rawTokens.length || !cleanedTokens.length) {
        return false;
    }
    if (rawTokens.length !== cleanedTokens.length) {
        return true;
    }
    let changedTokenCount = 0;
    for (let index = 0; index < rawTokens.length; index += 1) {
        const rawToken = rawTokens[index] ?? '';
        const cleanedToken = cleanedTokens[index] ?? '';
        if (!rawToken || !cleanedToken || rawToken === cleanedToken) {
            continue;
        }
        changedTokenCount += 1;
        const distance = levenshteinDistance(rawToken, cleanedToken);
        const maxLength = Math.max(rawToken.length, cleanedToken.length, 1);
        const distanceRatio = distance / maxLength;
        if (distanceRatio > 0.45) {
            return true;
        }
    }
    return changedTokenCount / Math.max(1, rawTokens.length) > 0.3;
};
const shouldRejectBengaliCleanupDrift = (rawTranscript, cleanedTranscript, needsScriptRecovery) => {
    if (needsScriptRecovery) {
        return false;
    }
    const rawTokens = tokenizeTranscript(rawTranscript);
    const cleanedTokens = tokenizeTranscript(cleanedTranscript);
    if (!rawTokens.length || !cleanedTokens.length) {
        return false;
    }
    const normalizedRawTokens = rawTokens.map(canonicalizeComparisonToken);
    const normalizedCleanedTokens = cleanedTokens.map(canonicalizeComparisonToken);
    let changedTokenCount = Math.abs(normalizedRawTokens.length - normalizedCleanedTokens.length);
    for (let index = 0; index < Math.min(normalizedRawTokens.length, normalizedCleanedTokens.length); index += 1) {
        const rawToken = normalizedRawTokens[index] ?? '';
        const cleanedToken = normalizedCleanedTokens[index] ?? '';
        if (!rawToken || !cleanedToken || rawToken === cleanedToken) {
            continue;
        }
        changedTokenCount += 1;
        const distance = levenshteinDistance(rawToken, cleanedToken);
        const maxLength = Math.max(rawToken.length, cleanedToken.length, 1);
        const distanceRatio = distance / maxLength;
        if (distanceRatio > 0.42) {
            return true;
        }
    }
    return changedTokenCount / Math.max(1, normalizedRawTokens.length) > 0.22;
};
const shouldRejectConservativeCleanupDrift = (rawTranscript, cleanedTranscript, language, needsScriptRecovery) => {
    if (!CONSERVATIVE_FINAL_CLEANUP_LANGUAGES.has(language) || needsScriptRecovery) {
        return false;
    }
    const rawTokens = tokenizeTranscript(rawTranscript).map(canonicalizeComparisonToken);
    const cleanedTokens = tokenizeTranscript(cleanedTranscript).map(canonicalizeComparisonToken);
    if (!rawTokens.length || !cleanedTokens.length) {
        return false;
    }
    if (rawTokens.length !== cleanedTokens.length) {
        return true;
    }
    let changedTokenCount = 0;
    for (let index = 0; index < rawTokens.length; index += 1) {
        const rawToken = rawTokens[index] ?? '';
        const cleanedToken = cleanedTokens[index] ?? '';
        if (!rawToken || !cleanedToken || rawToken === cleanedToken) {
            continue;
        }
        changedTokenCount += 1;
        const distance = levenshteinDistance(rawToken, cleanedToken);
        const maxLength = Math.max(rawToken.length, cleanedToken.length, 1);
        const distanceRatio = distance / maxLength;
        if (distanceRatio > 0.45) {
            return true;
        }
    }
    return changedTokenCount / Math.max(1, rawTokens.length) > 0.3;
};
const shouldAcceptCleanupOutput = (rawTranscript, cleanedTranscript, language, needsScriptRecovery) => {
    const normalizedRaw = normalizeTranscriptText(rawTranscript);
    const normalizedCleaned = normalizeTranscriptText(cleanedTranscript);
    if (!normalizedRaw || !normalizedCleaned) {
        return false;
    }
    if (normalizedRaw === normalizedCleaned) {
        return true;
    }
    const rawTokenCount = countTranscriptTokens(normalizedRaw);
    const cleanedTokenCount = countTranscriptTokens(normalizedCleaned);
    if (!rawTokenCount || !cleanedTokenCount) {
        return false;
    }
    const tokenRatio = cleanedTokenCount / rawTokenCount;
    if (tokenRatio < TRANSCRIPTION_CLEANUP_MIN_TOKEN_RATIO ||
        tokenRatio > TRANSCRIPTION_CLEANUP_MAX_TOKEN_RATIO) {
        return false;
    }
    if (needsScriptRecovery &&
        language !== 'en' &&
        shouldNormalizeScript(normalizedCleaned, language)) {
        return false;
    }
    if (language === 'bn' &&
        shouldRejectBengaliCleanupDrift(normalizedRaw, normalizedCleaned, needsScriptRecovery)) {
        return false;
    }
    if (language === 'hi' &&
        shouldRejectHindiCleanupDrift(normalizedRaw, normalizedCleaned, needsScriptRecovery)) {
        return false;
    }
    if (shouldRejectConservativeCleanupDrift(normalizedRaw, normalizedCleaned, language, needsScriptRecovery)) {
        return false;
    }
    return true;
};
const cleanupTranscriptOrthography = async (transcript, language, apiKey, previousContext, requestSignal) => {
    const normalizedTranscript = normalizeTranscriptText(transcript);
    const needsScriptRecovery = language !== 'en' && shouldNormalizeScript(normalizedTranscript, language);
    if (!normalizedTranscript) {
        return {
            text: normalizedTranscript,
            emergencyApplied: false,
        };
    }
    const guide = LANGUAGE_TRANSCRIPTION_GUIDES[language];
    const cleanupSystemPrompt = guide?.cleanupSystemPrompt ||
        `You are a high-precision ${guide?.languageName ?? 'multilingual'} speech transcript normalizer. Fix only obvious ASR spelling, script, spacing, punctuation, and overlap duplication errors. Preserve exact meaning, intent, and clause order. Never summarize, paraphrase, translate, soften, improve, or remove words. Return only the cleaned transcript.`;
    const runCleanupWithProvider = async (provider, prompt) => {
        const timeoutMs = provider === 'gemini'
            ? Math.min(constants_1.GEMINI_GENERATION_TIMEOUT_MS, TRANSCRIPTION_SCRIPT_NORMALIZATION_TIMEOUT_MS)
            : Math.min(constants_1.GROQ_TRANSCRIPTION_TIMEOUT_MS, TRANSCRIPTION_SCRIPT_NORMALIZATION_TIMEOUT_MS);
        const payload = await withTimeout(timeoutMs, async (signal) => {
            if (provider === 'groq') {
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: constants_1.DEFAULT_GROQ_MODEL,
                        temperature: 0,
                        messages: [
                            {
                                role: 'system',
                                content: cleanupSystemPrompt,
                            },
                            {
                                role: 'user',
                                content: prompt,
                            },
                        ],
                    }),
                    signal,
                });
                const rawPayload = (await response.json().catch(() => null));
                if (!response.ok) {
                    throw new Error(rawPayload?.error?.message?.trim() ||
                        `Transcript script normalization failed with status ${response.status}`);
                }
                return rawPayload?.choices?.[0]?.message?.content?.trim() || transcript;
            }
            const geminiApiKey = process.env.GEMINI_API_KEY;
            if (!geminiApiKey) {
                throw new Error('GEMINI_API_KEY is not configured');
            }
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${constants_1.DEFAULT_GEMINI_MODEL}:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [
                            {
                                text: cleanupSystemPrompt,
                            },
                        ],
                    },
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt,
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        temperature: 0,
                    },
                }),
                signal,
            });
            const rawPayload = (await response.json().catch(() => null));
            if (!response.ok) {
                throw new Error(rawPayload?.error?.message?.trim() ||
                    `Gemini cleanup failed with status ${response.status}`);
            }
            return (rawPayload?.candidates?.[0]?.content?.parts
                ?.map((part) => part.text ?? '')
                .join('\n')
                .trim() || transcript);
        }, requestSignal);
        return normalizeTranscriptText(payload);
    };
    const runCleanup = async (prompt) => {
        if (language !== 'bn') {
            return runCleanupWithProvider('groq', prompt);
        }
        try {
            return await runCleanupWithProvider('groq', prompt);
        }
        catch (groqError) {
            console.warn('[transcription] Bengali cleanup falling back to Gemini', {
                error: groqError instanceof Error ? groqError.message : 'unknown cleanup error',
            });
            try {
                return await runCleanupWithProvider('gemini', prompt);
            }
            catch (geminiError) {
                console.warn('[transcription] Bengali cleanup fallback failed; preserving raw transcript', {
                    error: geminiError instanceof Error ? geminiError.message : 'unknown Gemini cleanup error',
                });
                return normalizedTranscript;
            }
        }
    };
    const prompt = buildCleanupPrompt(language, normalizedTranscript);
    if (!prompt) {
        return {
            text: normalizedTranscript,
            emergencyApplied: false,
            usedModelCleanup: false,
        };
    }
    let cleanedTranscript = await runCleanup(prompt);
    if (language === 'bn' &&
        (hasRepeatedTokenRun(cleanedTranscript) ||
            hasSuspiciousNumericWordAttachment(cleanedTranscript) ||
            (previousContext &&
                countTranscriptTokens(previousContext) >= 4 &&
                estimateComparableTokenOverlap(cleanedTranscript, previousContext) < 0.35))) {
        const verifierPrompt = buildBengaliVerifierPrompt(normalizedTranscript, cleanedTranscript, previousContext);
        const verifiedTranscript = await runCleanup(verifierPrompt);
        if (shouldAcceptCleanupOutput(normalizedTranscript, verifiedTranscript, language, needsScriptRecovery)) {
            const currentOverlap = previousContext
                ? estimateComparableTokenOverlap(cleanedTranscript, previousContext)
                : 0;
            const verifiedOverlap = previousContext
                ? estimateComparableTokenOverlap(verifiedTranscript, previousContext)
                : 0;
            const currentSuspiciousScore = Number(hasRepeatedTokenRun(cleanedTranscript)) +
                Number(hasSuspiciousNumericWordAttachment(cleanedTranscript));
            const verifiedSuspiciousScore = Number(hasRepeatedTokenRun(verifiedTranscript)) +
                Number(hasSuspiciousNumericWordAttachment(verifiedTranscript));
            if (verifiedSuspiciousScore < currentSuspiciousScore ||
                verifiedOverlap > currentOverlap) {
                cleanedTranscript = verifiedTranscript;
            }
        }
    }
    if (!shouldAcceptCleanupOutput(normalizedTranscript, cleanedTranscript, language, needsScriptRecovery)) {
        return {
            text: normalizedTranscript,
            emergencyApplied: false,
            usedModelCleanup: false,
        };
    }
    if (language !== 'en' &&
        shouldNormalizeScript(cleanedTranscript, language)) {
        const emergencyPrompt = [
            LANGUAGE_TRANSCRIPTION_GUIDES[language]?.cleanupPrompt,
            `Use only ${LANGUAGE_SCRIPT_GUIDES[language]?.name}.`,
            'If the text is a Latin-script rendering of the same utterance, convert it to the target script only.',
            'Do not translate, summarize, or paraphrase.',
            cleanedTranscript,
            'Return only the cleaned transcript.',
        ].join('\n');
        return {
            text: await runCleanup(emergencyPrompt),
            emergencyApplied: true,
            usedModelCleanup: true,
        };
    }
    return {
        text: cleanedTranscript,
        emergencyApplied: false,
        usedModelCleanup: true,
    };
};
const summarizeSegmentQuality = (payload) => {
    const segments = Array.isArray(payload?.segments) ? payload.segments : [];
    const avgLogprobValues = segments
        .map((segment) => segment.avg_logprob)
        .filter((value) => typeof value === 'number' && Number.isFinite(value));
    const noSpeechValues = segments
        .map((segment) => segment.no_speech_prob)
        .filter((value) => typeof value === 'number' && Number.isFinite(value));
    const compressionValues = segments
        .map((segment) => segment.compression_ratio)
        .filter((value) => typeof value === 'number' && Number.isFinite(value));
    return {
        segmentCount: segments.length,
        minAvgLogprob: avgLogprobValues.length ? Math.min(...avgLogprobValues) : null,
        maxNoSpeechProb: noSpeechValues.length ? Math.max(...noSpeechValues) : null,
        maxCompressionRatio: compressionValues.length ? Math.max(...compressionValues) : null,
        lowConfidenceSegments: segments.filter((segment) => (typeof segment.avg_logprob === 'number' && segment.avg_logprob < -1) ||
            (typeof segment.no_speech_prob === 'number' && segment.no_speech_prob > 0.6) ||
            (typeof segment.compression_ratio === 'number' && segment.compression_ratio > 2.4)).length,
    };
};
const shouldUseModelCleanup = ({ stage, language, transcript, previousContext, scriptMismatch, qualitySummary, }) => {
    if (stage !== 'final') {
        return false;
    }
    if (!normalizeTranscriptText(transcript)) {
        return false;
    }
    if (language === 'bn') {
        return Boolean(normalizeTranscriptText(transcript) &&
            (hasRepeatedTokenRun(transcript) ||
                hasSuspiciousNumericWordAttachment(transcript) ||
                scriptMismatch ||
                (previousContext &&
                    countTranscriptTokens(previousContext) >= 4 &&
                    estimateComparableTokenOverlap(transcript, previousContext) < 0.35)));
    }
    if (scriptMismatch) {
        return true;
    }
    if (qualitySummary.lowConfidenceSegments > 0) {
        return true;
    }
    if (typeof qualitySummary.minAvgLogprob === 'number' &&
        qualitySummary.minAvgLogprob < (language === 'bn' ? -0.8 : -0.55)) {
        return true;
    }
    if (typeof qualitySummary.maxNoSpeechProb === 'number' &&
        qualitySummary.maxNoSpeechProb > (language === 'bn' ? 0.35 : 0.22)) {
        return true;
    }
    if (typeof qualitySummary.maxCompressionRatio === 'number' &&
        qualitySummary.maxCompressionRatio > (language === 'bn' ? 2.1 : 1.9)) {
        return true;
    }
    return false;
};
const buildTranscriptionPrompt = (languageHint, previousContext) => {
    const normalizedLanguage = resolveLanguageHint(languageHint);
    const guide = LANGUAGE_TRANSCRIPTION_GUIDES[normalizedLanguage];
    const basePrompt = guide?.prompt
        ?? 'Transcribe exactly as spoken in the original language and script. No translation or transliteration. Keep names, brands, and technical terms as spoken.';
    const trimmedContext = buildContextHints(previousContext, normalizedLanguage);
    const vocabularyHints = buildVocabularyHints(previousContext, normalizedLanguage);
    const promptSections = [
        basePrompt,
        trimmedContext.text
            ? `${guide?.contextLabel ?? 'Recent context'}: ${trimmedContext.text}`
            : null,
        vocabularyHints
            ? `${guide?.vocabularyLabel ?? 'Recent terms'}: ${vocabularyHints}`
            : null,
    ].filter(Boolean);
    const clampedPrompt = clampPromptToProviderLimits(promptSections.join('\n'));
    const prompt = clampedPrompt.text.trim();
    return {
        prompt,
        promptLength: prompt.length,
        promptBytes: Buffer.byteLength(prompt, 'utf8'),
        contextChars: trimmedContext.text.length,
        contextBytes: Buffer.byteLength(trimmedContext.text, 'utf8'),
        vocabularyChars: vocabularyHints.length,
        vocabularyBytes: Buffer.byteLength(vocabularyHints, 'utf8'),
        truncatedContext: trimmedContext.truncated,
        truncatedPrompt: clampedPrompt.truncated,
    };
};
const normalizeScriptConfusables = (value, language) => {
    if (!value) {
        return value;
    }
    if (language === 'bn') {
        return value
            // Rare Bengali "va" glyphs are almost never intended in modern dictation UX
            // and show up as visual noise in common words like ভাইরাল / ব্যাপার.
            .replace(/\u09B5/gu, 'ভ');
    }
    return value;
};
const applyLanguageCorrections = (value, language) => {
    const baseline = normalizeScriptConfusables(normalizeTranscriptText(value), language);
    const dedupedImmediate = dedupeImmediateRepeatedPhrases(baseline);
    const trailingCollapsed = collapseRepeatedTrailingSpan(dedupedImmediate);
    const semanticallyDeduped = language === 'bn'
        ? removeSemanticRepetition(trailingCollapsed)
        : trailingCollapsed;
    const brandNormalized = language === 'bn'
        ? normalizeBengaliBrands(semanticallyDeduped)
        : semanticallyDeduped;
    const normalized = brandNormalized;
    const appliedRuleIds = [];
    if (baseline !== normalizeTranscriptText(value)) {
        appliedRuleIds.push('normalize-script-confusables');
    }
    if (dedupedImmediate !== baseline) {
        appliedRuleIds.push('dedupe-immediate-repeat');
    }
    if (trailingCollapsed !== dedupedImmediate) {
        appliedRuleIds.push('dedupe-trailing-repeat');
    }
    if (language === 'bn' && semanticallyDeduped !== trailingCollapsed) {
        appliedRuleIds.push('dedupe-semantic-repeat');
    }
    if (language === 'bn' && brandNormalized !== semanticallyDeduped) {
        appliedRuleIds.push('normalize-brands');
    }
    return {
        text: normalizeTranscriptText(normalized),
        appliedRuleIds: Array.from(new Set(appliedRuleIds)),
    };
};
const transcribeAudioWithGroq = async (input) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('GROQ_API_KEY is not configured');
    }
    const binary = Buffer.from(input.audioBase64, 'base64');
    if (!binary.byteLength) {
        throw new Error('Audio payload was empty');
    }
    if (binary.byteLength > constants_1.TRANSCRIPTION_MAX_AUDIO_BYTES) {
        const maxMb = Math.round((constants_1.TRANSCRIPTION_MAX_AUDIO_BYTES / (1024 * 1024)) * 10) / 10;
        throw new Error(`That recording is a little too chunky right now. Keep it under ${maxMb}MB and try again.`);
    }
    const authoritativeLanguageHint = resolveLanguageHint(input.languageHint);
    const stage = input.stage === 'stream' ? 'stream' : 'final';
    const normalizedMimeType = normalizeAudioMimeType(input.mimeType);
    const extension = inferAudioExtension(input.mimeType);
    const builtPrompt = buildTranscriptionPrompt(authoritativeLanguageHint, input.previousContext);
    const audioHash = buildBinaryHash(binary);
    const promptHash = buildBinaryHash(builtPrompt.prompt);
    const cacheKey = buildCacheKey(audioHash, normalizedMimeType, authoritativeLanguageHint, promptHash, stage);
    const cachedResult = readCachedTranscription(cacheKey);
    if (cachedResult) {
        console.info('[transcription] cache hit', {
            mimeType: normalizedMimeType,
            extension,
            bytes: binary.byteLength,
            languageHint: authoritativeLanguageHint,
            promptLength: builtPrompt.promptLength,
            promptBytes: builtPrompt.promptBytes,
        });
        return cachedResult;
    }
    const file = new Blob([binary], { type: normalizedMimeType });
    const formData = new FormData();
    console.info('[transcription] forwarding audio to Groq', {
        mimeType: normalizedMimeType,
        extension,
        bytes: binary.byteLength,
        languageHint: authoritativeLanguageHint,
        stage,
        previousContextChars: input.previousContext?.trim().length || 0,
        promptLength: builtPrompt.promptLength,
        promptBytes: builtPrompt.promptBytes,
        promptTrimmed: builtPrompt.truncatedPrompt,
        promptContextChars: builtPrompt.contextChars,
        promptContextBytes: builtPrompt.contextBytes,
        promptVocabularyChars: builtPrompt.vocabularyChars,
        promptVocabularyBytes: builtPrompt.vocabularyBytes,
        promptContextTrimmed: builtPrompt.truncatedContext,
        headerHex: summarizeBinaryHeader(binary),
    });
    formData.append('file', file, `prixmoai-dictation.${extension}`);
    formData.append('model', constants_1.GROQ_TRANSCRIPTION_MODEL);
    formData.append('temperature', '0');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');
    formData.append('prompt', builtPrompt.prompt);
    formData.append('language', authoritativeLanguageHint);
    const payload = await withTimeout(constants_1.GROQ_TRANSCRIPTION_TIMEOUT_MS, async (signal) => {
        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            body: formData,
            signal,
        });
        const rawPayload = (await response.json().catch(() => null));
        if (!response.ok) {
            console.error('[transcription] Groq transcription failed', {
                status: response.status,
                mimeType: normalizedMimeType,
                extension,
                bytes: binary.byteLength,
                groqMessage: rawPayload?.error?.message || null,
            });
            throw new Error(toTranscriptionErrorMessage(rawPayload, `Groq transcription failed with status ${response.status}`));
        }
        return rawPayload;
    }, input.signal);
    const qualitySummary = summarizeSegmentQuality(payload);
    const effectiveDetectedLanguage = authoritativeLanguageHint;
    const rawTranscript = normalizeTranscriptText(payload?.text ?? '');
    const deterministicCorrection = applyLanguageCorrections(rawTranscript, effectiveDetectedLanguage);
    const deterministicTranscript = deterministicCorrection.text;
    const scriptMismatchDetected = shouldNormalizeScript(deterministicTranscript, effectiveDetectedLanguage);
    const shouldRunModelCleanup = shouldUseModelCleanup({
        stage,
        language: effectiveDetectedLanguage,
        transcript: deterministicTranscript,
        previousContext: input.previousContext,
        scriptMismatch: scriptMismatchDetected,
        qualitySummary,
    });
    const cleanupResult = shouldRunModelCleanup
        ? await cleanupTranscriptOrthography(deterministicTranscript, effectiveDetectedLanguage, apiKey, input.previousContext, input.signal)
        : {
            text: deterministicTranscript,
            emergencyApplied: false,
            usedModelCleanup: false,
        };
    const transcriptCorrection = applyLanguageCorrections(cleanupResult.text || deterministicTranscript, effectiveDetectedLanguage);
    const cleanupChangedTranscript = normalizeTranscriptText(deterministicTranscript) !==
        normalizeTranscriptText(cleanupResult.text || deterministicTranscript);
    const result = {
        transcript: transcriptCorrection.text,
        detectedLanguage: effectiveDetectedLanguage,
        durationSeconds: typeof payload?.duration === 'number' && Number.isFinite(payload.duration)
            ? payload.duration
            : null,
        segments: Array.isArray(payload?.segments)
            ? payload.segments
                .map((segment) => {
                const segmentCorrection = applyLanguageCorrections(segment.text ?? '', effectiveDetectedLanguage);
                return {
                    start: typeof segment.start === 'number' && Number.isFinite(segment.start)
                        ? segment.start
                        : null,
                    end: typeof segment.end === 'number' && Number.isFinite(segment.end)
                        ? segment.end
                        : null,
                    text: segmentCorrection.text,
                };
            })
                .filter((segment) => segment.text)
            : [],
    };
    const finalChangedTranscript = normalizeTranscriptText(rawTranscript) !==
        normalizeTranscriptText(result.transcript);
    if (constants_1.NODE_ENV !== 'production') {
        console.info('[transcription] dev transcript debug', {
            selectedLanguage: authoritativeLanguageHint,
            stage,
            rawTranscriptPreview: summarizeForDebug(rawTranscript),
            cleanedTranscriptPreview: summarizeForDebug(cleanupResult.text || rawTranscript),
            finalTranscriptPreview: summarizeForDebug(result.transcript),
            rawTranscriptChars: rawTranscript.length,
            cleanedTranscriptChars: (cleanupResult.text || rawTranscript).length,
            finalTranscriptChars: result.transcript.length,
            cleanupChangedTranscript,
            finalChangedTranscript,
            cleanupDiffHint: buildTranscriptDiffHint(rawTranscript, cleanupResult.text || rawTranscript),
            finalDiffHint: buildTranscriptDiffHint(rawTranscript, result.transcript),
        });
        const cleanedTranscript = cleanupResult.text || rawTranscript;
        const cleanupChangeRatio = estimateTranscriptChangeRatio(rawTranscript, cleanedTranscript);
        if (stage === 'final' &&
            (authoritativeLanguageHint === 'bn' || authoritativeLanguageHint === 'hi') &&
            cleanupChangedTranscript &&
            cleanupChangeRatio >= DEV_CLEANUP_DRIFT_MIN_RATIO) {
            console.info('[transcription] dev cleanup raw->cleaned', {
                selectedLanguage: authoritativeLanguageHint,
                cleanupChangeRatio,
                rawTranscriptPreview: summarizeForDebug(rawTranscript),
                cleanedTranscriptPreview: summarizeForDebug(cleanedTranscript),
                diffHint: buildTranscriptDiffHint(rawTranscript, cleanedTranscript),
            });
        }
    }
    console.info('[transcription] Groq transcription succeeded', {
        model: constants_1.GROQ_TRANSCRIPTION_MODEL,
        mimeType: normalizedMimeType,
        extension,
        bytes: binary.byteLength,
        selectedLanguage: authoritativeLanguageHint,
        stage,
        providerDetectedLanguage: payload?.language?.trim() || null,
        rawTranscriptChars: rawTranscript.length,
        transcriptChars: result.transcript.length,
        segmentCount: qualitySummary.segmentCount,
        minAvgLogprob: qualitySummary.minAvgLogprob,
        maxNoSpeechProb: qualitySummary.maxNoSpeechProb,
        maxCompressionRatio: qualitySummary.maxCompressionRatio,
        lowConfidenceSegments: qualitySummary.lowConfidenceSegments,
        usedModelCleanup: shouldRunModelCleanup && cleanupResult.usedModelCleanup,
        scriptMismatchDetected,
        cleanupPassApplied: cleanupResult.usedModelCleanup,
        cleanupEmergencyApplied: cleanupResult.emergencyApplied,
        transcriptCorrectionsApplied: transcriptCorrection.appliedRuleIds,
    });
    writeCachedTranscription(cacheKey, result);
    return result;
};
exports.transcribeAudioWithGroq = transcribeAudioWithGroq;
