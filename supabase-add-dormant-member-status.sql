-- 휴면 회원 상태: 이번 달 개인 기본점수를 한 번도 얻지 못한 승인 회원을 휴면 처리합니다.
-- 이 스크립트는 휴면 해제를 수행하지 않습니다.
alter table public.profiles add column if not exists is_dormant boolean not null default false;

with qualifying_days as (
  select distinct on (wr.user_id, wr.performed_on) wr.user_id, wr.performed_on
  from public.workout_records wr
  cross join public.club_settings cs
  where wr.performed_on >= date_trunc('month', timezone('Asia/Seoul', now()))::date
    and wr.performed_on < (date_trunc('month', timezone('Asia/Seoul', now())) + interval '1 month')::date
    and wr.amount >= case wr.exercise_type
      when 'swim' then cs.swim_target
      when 'cycle' then cs.cycle_target
      when 'run' then cs.run_target
      when 'strength' then cs.strength_target
      else null
    end
  order by wr.user_id, wr.performed_on, wr.created_at asc nulls last
), scoreless_members as (
  select p.id
  from public.profiles p
  left join qualifying_days q on q.user_id = p.id
  where p.role <> 'admin'
    and p.is_approved is true
  group by p.id
  having count(q.performed_on) = 0
)
update public.profiles p
set is_dormant = true
from scoreless_members s
where p.id = s.id
  and p.is_dormant is false;
