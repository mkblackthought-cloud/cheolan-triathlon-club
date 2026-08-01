# 철안철인클럽 운동기록 사이트

휴대폰/PC 브라우저에서 쓸 수 있는 단일 페이지 웹앱입니다. Supabase 무료 플랜을 사용하여 회원 로그인, 운동 기록, 이미지 첨부, 점수·팀 집계를 운영합니다.

## 처음 한 번 설정

1. [Supabase](https://supabase.com)에서 무료 프로젝트를 만듭니다.
2. **SQL Editor**에서 `supabase-schema.sql` 전체를 실행합니다.
3. **Authentication > Providers > Email**에서 이메일 로그인을 켜고, `Authentication > Users`에서 클럽 회원 30명의 계정을 만듭니다. 각 계정을 만든 뒤 SQL Editor에서 다음처럼 프로필을 추가합니다.

   ```sql
   insert into public.profiles (id, display_name, role)
   values ('인증-사용자-UUID', '홍길동', 'member');
   ```

   첫 관리자만 `role`을 `'admin'`으로 지정합니다. UUID는 Authentication > Users 목록에서 복사합니다.

4. 프로젝트의 **Settings > API**에서 Project URL과 anon public key를 복사해 `app.js` 상단의 `SUPABASE_URL`, `SUPABASE_ANON_KEY`에 붙여 넣습니다. anon key는 브라우저에 넣어도 되며, service_role key는 절대 넣지 마세요.

## 무료 배포 (URL 만들기)

가장 간단한 방법은 GitHub Pages입니다.

1. 이 폴더 파일을 GitHub의 새 **private repository**에 올립니다.
2. GitHub 저장소의 **Settings > Pages**에서 `Deploy from a branch`, `main / root`를 선택합니다.
3. 생성된 `https://사용자명.github.io/저장소명/` 주소를 회원에게 공유합니다.

또는 Cloudflare Pages의 무료 플랜에서 이 폴더를 배포해도 됩니다. 이 앱은 빌드 과정이 필요 없습니다.

## 운영 방식

- 운동별 관리 기준(사이클 km, 수영 m, 러닝 km, 보강 min)을 넘긴 기록은 1점으로 누적됩니다.
- 관리자는 **관리** 탭에서 기준값과 팀을 바꾸고 개인별·팀별 점수를 봅니다.
- 업로드 이미지는 Supabase Storage의 무료 저장공간을 사용합니다. 이미지가 많이 쌓이면 가끔 오래된 캡처를 정리해 주세요.
