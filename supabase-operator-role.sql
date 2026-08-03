-- 배포 승인 시 Supabase SQL Editor에서 한 번 실행합니다.
-- 운영자(manager)는 관리자 화면 권한과 자신의 운동 기록 입력 권한을 함께 가집니다.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('member', 'manager', 'admin'));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'manager')
  )
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
