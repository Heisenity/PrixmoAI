alter table public.brand_memory_feedback_events
  add column if not exists accepted_feedback_event_id uuid references public.brand_memory_feedback_events(id) on delete set null,
  add column if not exists used_for_scheduler boolean,
  add column if not exists used_same_caption_for_scheduler boolean;

create index if not exists brand_memory_feedback_events_accepted_feedback_event_id_idx
  on public.brand_memory_feedback_events (accepted_feedback_event_id, created_at desc)
  where accepted_feedback_event_id is not null;
