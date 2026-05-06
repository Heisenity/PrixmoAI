import { requireSupabaseAdmin } from '../db/supabase';

const parseArgument = (flag: string) => {
  const argument = process.argv.find((entry) => entry.startsWith(`${flag}=`));
  return argument ? argument.slice(flag.length + 1) : null;
};

const userId = parseArgument('--userId');
const taskType = parseArgument('--taskType');
const limit = Number.parseInt(parseArgument('--limit') ?? '200', 10);

const main = async () => {
  const admin = requireSupabaseAdmin();

  let generationLogsQuery = admin
    .from('brand_memory_generation_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Number.isFinite(limit) && limit > 0 ? limit : 200);

  let feedbackEventsQuery = admin
    .from('brand_memory_feedback_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Number.isFinite(limit) && limit > 0 ? limit : 200);

  if (userId) {
    generationLogsQuery = generationLogsQuery.eq('user_id', userId);
    feedbackEventsQuery = feedbackEventsQuery.eq('user_id', userId);
  }

  if (taskType) {
    generationLogsQuery = generationLogsQuery.eq('task_type', taskType);
  }

  const [{ data: generationLogs, error: generationLogsError }, { data: feedbackEvents, error: feedbackEventsError }] =
    await Promise.all([generationLogsQuery, feedbackEventsQuery]);

  if (generationLogsError) {
    throw new Error(
      generationLogsError.message || 'Failed to load brand memory generation logs'
    );
  }

  if (feedbackEventsError) {
    throw new Error(
      feedbackEventsError.message || 'Failed to load brand memory feedback events'
    );
  }

  const logs = generationLogs ?? [];
  const feedback = feedbackEvents ?? [];
  const providerCounts = new Map<string, number>();
  const rerankProviderCounts = new Map<string, number>();
  const taskCounts = new Map<string, number>();
  const feedbackCounts = new Map<string, number>();
  let fallbackCount = 0;
  let totalRetrieved = 0;
  let totalSelected = 0;

  logs.forEach((log) => {
    const provider =
      typeof log.provider === 'string' && log.provider.trim()
        ? log.provider.trim()
        : 'unknown';
    const rerankProvider =
      typeof log.rerank_provider === 'string' && log.rerank_provider.trim()
        ? log.rerank_provider.trim()
        : 'none';
    const task =
      typeof log.task_type === 'string' && log.task_type.trim()
        ? log.task_type.trim()
        : 'unknown';

    providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
    rerankProviderCounts.set(
      rerankProvider,
      (rerankProviderCounts.get(rerankProvider) ?? 0) + 1
    );
    taskCounts.set(task, (taskCounts.get(task) ?? 0) + 1);

    if (log.fallback_used === true) {
      fallbackCount += 1;
    }

    totalRetrieved += Array.isArray(log.retrieved_memories)
      ? log.retrieved_memories.length
      : 0;
    totalSelected += Array.isArray(log.selected_memories)
      ? log.selected_memories.length
      : 0;
  });

  feedback.forEach((event) => {
    const eventType =
      typeof event.event_type === 'string' && event.event_type.trim()
        ? event.event_type.trim()
        : 'unknown';
    feedbackCounts.set(eventType, (feedbackCounts.get(eventType) ?? 0) + 1);
  });

  const summarizeMap = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([key, value]) => ({ key, value }));

  console.info(
    JSON.stringify(
      {
        scope: {
          userId,
          taskType,
          limit,
        },
        generationLogs: {
          total: logs.length,
          fallbackRate:
            logs.length > 0 ? Number((fallbackCount / logs.length).toFixed(4)) : 0,
          averageRetrievedCount:
            logs.length > 0 ? Number((totalRetrieved / logs.length).toFixed(2)) : 0,
          averageSelectedCount:
            logs.length > 0 ? Number((totalSelected / logs.length).toFixed(2)) : 0,
          providers: summarizeMap(providerCounts),
          rerankProviders: summarizeMap(rerankProviderCounts),
          tasks: summarizeMap(taskCounts),
        },
        feedbackEvents: {
          total: feedback.length,
          breakdown: summarizeMap(feedbackCounts),
        },
      },
      null,
      2
    )
  );
};

void main().catch((error) => {
  console.error(
    '[brand-memory-eval] failed',
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
