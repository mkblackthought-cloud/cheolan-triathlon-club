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

-- 운영자는 관리 기능을 사용하지만, 역할 변경(운영 권한 부여·회수)은 admin만 가능합니다.
create or replace function public.prevent_non_admin_role_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role
     and not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Only the admin account can change member roles';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_non_admin_role_changes() from public;
drop trigger if exists profiles_admin_only_role_change on public.profiles;
create trigger profiles_admin_only_role_change
before update of role on public.profiles
for each row execute function public.prevent_non_admin_role_changes();
