-- 열람 이력은 한 달 단위로만 보관합니다.
-- pg_cron은 UTC 기준이므로 매일 15:00 UTC(한국 시간 00:00)에 실행하고,
-- 한국 날짜가 매월 1일인 경우에만 이전 달 로그를 제거합니다.
create extension if not exists pg_cron;

select cron.schedule(
  'purge_member_view_logs_monthly_kst',
  '0 15 * * *',
  $$
    delete from public.member_view_logs
    where extract(day from timezone('Asia/Seoul', now())) = 1
      and occurred_at < date_trunc('month', timezone('Asia/Seoul', now())) at time zone 'Asia/Seoul';
  $$
);
