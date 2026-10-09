-- Separate enum migration: PostgreSQL requires the new enum value to commit first.
alter type public.analytics_event_type add value if not exists 'page_view';
