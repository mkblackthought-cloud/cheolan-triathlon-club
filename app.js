const SUPABASE_URL = 'https://szbgewudwfaiwzbajzzg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eHs5l0kOSduUNeszDrjPEA_rRvUT6VG';
// 외부 CDN 없이 Supabase REST API를 사용합니다. GitHub Pages에서도 안정적으로 실행됩니다.
const SESSION_KEY = 'cheolan_triathlon_session';
let authListener = null;
const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const setSession = (session) => { if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); authListener?.(); };
async function api(path, options = {}, useAuth = true) {
  const session = getSession();
  const headers = { apikey: SUPABASE_ANON_KEY, ...(options.headers || {}) };
  if (useAuth && session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  const text = await response.text(); let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) return { data: null, error: { message: body?.message || body?.msg || text || `요청 오류 (${response.status})` } };
  return { data: body, error: null };
}
class Query {
  constructor(table, method = 'GET', body = null) { this.table = table; this.method = method; this.body = body; this.params = new URLSearchParams(); this.wantSingle = false; }
  select(columns = '*') { this.params.set('select', columns); return this; }
  eq(column, value) { this.params.append(column, `eq.${value}`); return this; }
  order(column, options = {}) { this.params.set('order', `${column}.${options.ascending === false ? 'desc' : 'asc'}`); return this; }
  single() { this.wantSingle = true; return this.execute(); }
  async execute() { const query = this.params.toString(); const headers = { Accept: this.wantSingle ? 'application/vnd.pgrst.object+json' : 'application/json' }; if (this.method !== 'GET') headers['Content-Type'] = 'application/json'; if (this.method === 'POST' || this.method === 'PATCH') headers.Prefer = 'return=representation'; return api(`/rest/v1/${this.table}${query ? `?${query}` : ''}`, { method: this.method, headers, body: this.method === 'GET' ? undefined : JSON.stringify(this.body) }); }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
}
const supabase = {
  auth: {
    async signInWithPassword({ email, password }) { const result = await api('/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }, false); if (!result.error) setSession(result.data); return result; },
    async signUp({ email, password, options = {} }) { const result = await api('/auth/v1/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, data: options.data || {} }) }, false); if (!result.error && result.data?.access_token) setSession(result.data); return result; },
    async signOut() { setSession(null); return { error: null }; },
    async getSession() { return { data: { session: getSession() } }; },
    onAuthStateChange(callback) { authListener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
  },
  from(table) {
    return {
      select(columns = '*') { return new Query(table).select(columns); },
      insert(body) { return new Query(table, 'POST', body).execute(); },
      update(body) { return new Query(table, 'PATCH', body); },
      upsert(body) { return api(`/rest/v1/${table}?on_conflict=id`, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(body) }); },
    };
  },
  storage: { from(bucket) { return { upload: async (path, file) => { const result = await api(`/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file }); return { error: result.error }; }, getPublicUrl: (path) => ({ data: { publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` } }) }; } },
};
const $ = (selector) => document.querySelector(selector);
const main = $('#main-content');
const kinds = {
  cycle: ['🚴', '사이클', 'km'], swim: ['🏊', '수영', 'm'],
  run: ['🏃', '러닝', 'km'], strength: ['🏋️', '보강운동', 'min'],
};
let state = { user: null, profile: null, records: [], settings: {}, athletes: [], teams: [] };

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const n = (value) => Number(value || 0);
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200); }
function nav(active) {
  const items = [['record', '✚', '기록입력'], ['me', '◎', '내 점수'], ['team', '♜', '팀 점수']];
  if (state.profile?.role === 'admin') items.push(['admin', '⚙', '관리'], ['approvals', '✓', '가입승인']);
  $('#bottom-nav').innerHTML = items.map(([id, icon, label]) => `<a href="#${id}" class="${active === id ? 'active' : ''}"><span>${icon}</span>${label}</a>`).join('');
}
function accountEmail(id) { return id.includes('@') ? id : `${id.toLowerCase()}@cheonantri.club`; }
function topbar() {
  $('#user-area').innerHTML = `<div class="user-tools"><span class="email">${esc(state.profile?.display_name || state.user?.email)}</span><button class="btn outline small" id="logout">로그아웃</button></div>`;
  $('#logout').onclick = async () => { await supabase.auth.signOut(); location.hash = ''; };
}
function baseScore(record) { return n(record.amount) >= n(state.settings[`${record.exercise_type}_target`]) ? n(state.settings[`${record.exercise_type}_points`] ?? 1) : 0; }
function teamSizeBonus(size) { return size === 4 ? n(state.settings.team4_member_bonus) : size === 3 ? n(state.settings.team3_member_bonus) : 0; }
function completeBonus(size, together) {
  if (size === 4) return n(state.settings[together ? 'team4_group_workout_bonus' : 'team4_all_verified_bonus']);
  if (size === 3) return n(state.settings[together ? 'team3_group_workout_bonus' : 'team3_all_verified_bonus']);
  return 0;
}
function summaries() {
  const result = Object.fromEntries(state.athletes.map((p) => [p.id, { base: 0, member: 0, complete: 0, total: 0 }]));
  const members = {};
  state.athletes.forEach((p) => { if (p.team_id) (members[p.team_id] ||= []).push(p.id); });
  const qualifying = state.records.filter((r) => baseScore(r) > 0);
  qualifying.forEach((r) => {
    const profile = state.athletes.find((p) => p.id === r.user_id);
    const item = result[r.user_id] ||= { base: 0, member: 0, complete: 0, total: 0 };
    item.base += baseScore(r);
    item.member += teamSizeBonus((members[profile?.team_id] || []).length);
  });
  const byDay = {};
  qualifying.forEach((r) => {
    const profile = state.athletes.find((p) => p.id === r.user_id);
    if (profile?.team_id) (byDay[`${profile.team_id}|${r.performed_on}`] ||= []).push(r);
  });
  Object.entries(byDay).forEach(([key, records]) => {
    const ids = members[key.split('|')[0]] || [];
    if (![3, 4].includes(ids.length) || !ids.every((id) => records.some((r) => r.user_id === id))) return;
    const together = ids.every((id) => records.some((r) => r.user_id === id && r.is_team_workout));
    const bonus = completeBonus(ids.length, together);
    ids.forEach((id) => { result[id].complete += bonus; });
  });
  Object.values(result).forEach((item) => { item.total = item.base + item.member + item.complete; });
  return result;
}
function renderRecords(root, records) {
  if (!records.length) { $(root).innerHTML = '<div class="empty">아직 등록된 운동이 없습니다.</div>'; return; }
  $(root).innerHTML = records.map((r) => `<div class="record"><div class="record-icon">${kinds[r.exercise_type]?.[0] || '✓'}</div><div class="record-main"><b>${kinds[r.exercise_type]?.[1]} ${r.amount}${kinds[r.exercise_type]?.[2]}</b><small>${r.performed_on}${r.memo ? ` · ${esc(r.memo)}` : ''}</small></div><div class="record-score">+${baseScore(r)}점</div></div>`).join('');
}
function loginPage() {
  main.innerHTML = `<section class="login"><a class="brand" href="#"><span>TC</span><strong>철안철인클럽</strong></a><div class="card"><h2>운동기록 로그인</h2><form id="login-form"><div class="field"><label>아이디</label><input name="id" autocomplete="username" required></div><div class="field"><label>비밀번호</label><input name="password" type="password" autocomplete="current-password" required></div><button class="btn full">로그인</button></form><p class="hint">기존 이메일 계정도 그대로 로그인할 수 있습니다. 처음이신가요? <a href="#signup">회원가입</a></p></div></section>`;
  $('#login-form').onsubmit = async (e) => { e.preventDefault(); const d = new FormData(e.target); const { error } = await supabase.auth.signInWithPassword({ email: accountEmail(String(d.get('id')).trim()), password: d.get('password') }); if (error) toast('아이디 또는 비밀번호를 확인해 주세요.'); };
}
function signupPage() {
  main.innerHTML = `<section class="login"><a class="brand" href="#"><span>TC</span><strong>철안철인클럽</strong></a><div class="card"><h2>회원가입</h2><form id="signup-form"><div class="field"><label>이름</label><input name="name" required></div><div class="field"><label>아이디 (영문·숫자·_ 4~20자)</label><input name="id" pattern="[A-Za-z0-9_]{4,20}" autocomplete="username" required></div><div class="field"><label>비밀번호 (8자 이상)</label><input name="password" type="password" minlength="8" autocomplete="new-password" required></div><button class="btn orange full">가입 신청</button></form><p class="hint">가입 후 관리자의 승인 전까지는 기록을 입력할 수 없습니다.</p></div></section>`;
  $('#signup-form').onsubmit = async (e) => { e.preventDefault(); const d = new FormData(e.target); const username = String(d.get('id')).trim().toLowerCase(); const { error } = await supabase.auth.signUp({ email: accountEmail(username), password: d.get('password'), options: { data: { display_name: d.get('name'), username } } }); if (error) toast(`가입 실패: ${error.message}`); else toast('가입 신청이 완료되었습니다. 관리자 승인 후 이용할 수 있습니다.'); };
}
function recordPage() {
  nav('record');
  main.innerHTML = `<section class="page"><div class="hero"><h1>오늘의 운동</h1><p>${esc(state.profile.display_name)}님의 운동 기록을 남겨보세요.</p></div><div class="card"><h2>운동 기록 입력</h2><form id="record-form"><div class="grid"><div class="field"><label>운동 종류</label><select name="exercise_type">${Object.entries(kinds).map(([key, v]) => `<option value="${key}">${v[0]} ${v[1]}</option>`).join('')}</select></div><div class="field"><label>운동 날짜</label><input name="performed_on" type="date" value="${new Date().toISOString().slice(0, 10)}" required></div></div><div class="field"><label>운동량</label><div class="input-addon"><input name="amount" type="number" min="0" step="0.1" required><span id="unit">km</span></div><p id="target-hint" class="hint"></p></div><div class="field"><label><input name="is_team_workout" type="checkbox" style="width:auto"> 팀원들과 함께 만나 운동했어요</label><p class="hint">팀 전원이 같은 날짜에 기준을 달성하고 모두 체크하면 동반 운동 보너스가 적용됩니다.</p></div><div class="field"><label>메모 (선택)</label><textarea name="memo"></textarea></div><div class="field"><label>운동 캡처 첨부 (선택, 최대 10MB)</label><input name="attachment" type="file" accept="image/*"></div><button class="btn orange full">운동 기록 저장</button></form></div><div class="section-title"><h2>최근 운동</h2></div><div class="card" id="recent-records"></div></section>`;
  const form = $('#record-form');
  const refresh = () => { const [,, unit] = kinds[form.exercise_type.value]; $('#unit').textContent = unit; $('#target-hint').textContent = `점수 기준: ${n(state.settings[`${form.exercise_type.value}_target`])}${unit} 이상 = ${n(state.settings[`${form.exercise_type.value}_points`] ?? 1)}점`; };
  form.exercise_type.onchange = refresh; refresh(); renderRecords('#recent-records', state.records.filter((r) => r.user_id === state.user.id).slice(0, 5));
  form.onsubmit = saveRecord;
}
async function saveRecord(e) {
  e.preventDefault(); const form = new FormData(e.target); const file = form.get('attachment'); let attachment_url = null;
  if (file?.size) { if (file.size > 10 * 1024 * 1024) return toast('첨부 파일은 10MB 이하여야 합니다.'); const path = `${state.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`; const upload = await supabase.storage.from('workout-images').upload(path, file); if (upload.error) return toast(upload.error.message); attachment_url = supabase.storage.from('workout-images').getPublicUrl(path).data.publicUrl; }
  const { error } = await supabase.from('workout_records').insert({ user_id: state.user.id, exercise_type: form.get('exercise_type'), amount: n(form.get('amount')), performed_on: form.get('performed_on'), memo: form.get('memo'), attachment_url, is_team_workout: form.get('is_team_workout') === 'on' });
  if (error) return toast(error.message); toast('운동 기록을 저장했습니다.'); await loadData(); recordPage();
}
function mePage() { nav('me'); const score = summaries()[state.user.id] || { base: 0, member: 0, complete: 0, total: 0 }; main.innerHTML = `<section class="page"><div class="hero"><p>${esc(state.profile.display_name)}님의 누계 점수</p><h1>${score.total}점</h1><p>운동 ${score.base}점 · 팀 구성 ${score.member}점 · 전원 인증 ${score.complete}점</p></div><div class="card" id="my-records"></div></section>`; renderRecords('#my-records', state.records.filter((r) => r.user_id === state.user.id)); }
function teamPage() {
  nav('team'); const scores = summaries(); const rows = state.teams.map((team) => { const people = state.athletes.filter((p) => p.team_id === team.id); const leader = state.athletes.find((p) => p.id === team.leader_id); return { team, people, leader, total: people.reduce((sum, p) => sum + n(scores[p.id]?.total), 0) }; }).sort((a, b) => b.total - a.total); const mine = state.teams.find((t) => t.leader_id === state.user.id);
  main.innerHTML = `<section class="page"><div class="hero"><h1>팀 점수 현황</h1><p>3·4명 팀에만 팀 보너스가 적용됩니다.</p></div>${mine ? `<div class="card"><h2>내 팀 이름 변경</h2><form id="rename-form"><input name="name" value="${esc(mine.name)}" required maxlength="30"><button class="btn full">팀 이름 저장</button></form></div>` : ''}<div class="card"><div class="table-wrap"><table><thead><tr><th>순위</th><th>팀</th><th>인원 / 팀장</th><th>점수</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.team.name)}</td><td>${r.people.length}명${r.leader ? ` / ${esc(r.leader.display_name)}` : ''}</td><td><b>${r.total}점</b></td></tr>`).join('') || '<tr><td colspan="4">팀이 없습니다.</td></tr>'}</tbody></table></div></div></section>`;
  if (mine) $('#rename-form').onsubmit = async (e) => { e.preventDefault(); const { error } = await supabase.from('teams').update({ name: new FormData(e.target).get('name') }).eq('id', mine.id); if (error) return toast(error.message); await loadData(); teamPage(); };
}
function adminPage() {
  nav('admin'); const teamOptions = state.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join(''); const scores = summaries();
  main.innerHTML = `<section class="page"><div class="hero"><h1>관리자 화면</h1><p>운동·팀 점수와 팀 구성을 관리합니다.</p></div><div class="card"><h2>운동 기준 및 지급 점수</h2><form id="settings-form"><div class="grid">${Object.entries(kinds).map(([key, v]) => `<div class="field"><label>${v[1]} 기준 (${v[2]})</label><input name="${key}_target" type="number" step="0.1" value="${n(state.settings[`${key}_target`])}"></div><div class="field"><label>${v[1]} 지급 점수</label><input name="${key}_points" type="number" step="0.1" value="${n(state.settings[`${key}_points`] ?? 1)}"></div>`).join('')}</div><h2>팀 보너스 점수</h2><div class="grid"><div class="field"><label>4명 팀 · 개인별 인증</label><input name="team4_member_bonus" type="number" step="0.1" value="${state.settings.team4_member_bonus ?? .75}"></div><div class="field"><label>3명 팀 · 개인별 인증</label><input name="team3_member_bonus" type="number" step="0.1" value="${state.settings.team3_member_bonus ?? 1}"></div><div class="field"><label>4명 팀 · 전원 인증</label><input name="team4_all_verified_bonus" type="number" step="0.1" value="${state.settings.team4_all_verified_bonus ?? 2.5}"></div><div class="field"><label>3명 팀 · 전원 인증</label><input name="team3_all_verified_bonus" type="number" step="0.1" value="${state.settings.team3_all_verified_bonus ?? 2}"></div><div class="field"><label>4명 팀 · 전원 동반 운동</label><input name="team4_group_workout_bonus" type="number" step="0.1" value="${state.settings.team4_group_workout_bonus ?? 3.5}"></div><div class="field"><label>3명 팀 · 전원 동반 운동</label><input name="team3_group_workout_bonus" type="number" step="0.1" value="${state.settings.team3_group_workout_bonus ?? 3}"></div></div><button class="btn full">점수 설정 저장</button></form></div><div class="admin-grid"><div class="card"><h2>회원 팀 배정</h2><form id="team-form"><select name="user_id">${state.athletes.map((p) => `<option value="${p.id}">${esc(p.display_name)} (${esc(p.teams?.name || '미배정')})</option>`).join('')}</select><select name="team_id"><option value="">미배정</option>${teamOptions}</select><button class="btn full">팀 배정 저장</button></form><hr><form id="new-team-form"><input name="name" required maxlength="30" placeholder="새 팀 이름"><button class="btn outline full">팀 만들기</button></form></div><div class="card"><h2>팀장 지정</h2><form id="leader-form"><select name="team_id">${teamOptions}</select><select name="leader_id">${state.athletes.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}</select><button class="btn full">팀장 지정</button></form><p class="hint">팀장은 해당 팀에 배정된 회원이어야 합니다.</p></div></div></section>`;
  $('#settings-form').onsubmit = saveSettings; $('#team-form').onsubmit = assignTeam; $('#new-team-form').onsubmit = createTeam; $('#leader-form').onsubmit = setLeader;
}
async function saveSettings(e) { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target)); Object.keys(data).forEach((key) => { data[key] = n(data[key]); }); const { error } = await supabase.from('club_settings').upsert({ id: 1, ...data }); if (error) return toast(error.message); toast('점수 설정을 저장했습니다.'); await loadData(); adminPage(); }
async function assignTeam(e) { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target)); const { error } = await supabase.from('profiles').update({ team_id: data.team_id || null }).eq('id', data.user_id); if (error) return toast(error.message); await loadData(); adminPage(); }
async function createTeam(e) { e.preventDefault(); const { error } = await supabase.from('teams').insert({ name: new FormData(e.target).get('name') }); if (error) return toast(error.message); await loadData(); adminPage(); }
async function setLeader(e) { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target)); const { error } = await supabase.from('teams').update({ leader_id: data.leader_id }).eq('id', data.team_id); if (error) return toast(error.message); toast('팀장을 지정했습니다.'); await loadData(); adminPage(); }
function pendingPage() {
  $('#bottom-nav').innerHTML = '';
  main.innerHTML = `<section class="page"><div class="card"><h2>가입 승인 대기 중</h2><p>관리자가 가입을 승인하면 운동 기록과 점수 화면을 이용할 수 있습니다.</p><button class="btn outline full" id="logout">로그아웃</button></div></section>`;
  $('#logout').onclick = async () => { await supabase.auth.signOut(); };
}
function approvalsPage() {
  nav('approvals'); const pending = state.athletes.filter((p) => !p.is_approved);
  main.innerHTML = `<section class="page"><div class="hero"><h1>가입 승인</h1><p>신규 회원을 확인한 뒤 승인해 주세요.</p></div><div class="card"><div class="table-wrap"><table><thead><tr><th>이름</th><th>아이디</th><th>가입일</th><th></th></tr></thead><tbody>${pending.map((p) => `<tr><td>${esc(p.display_name)}</td><td>${esc(p.username || '-')}</td><td>${String(p.created_at || '').slice(0, 10)}</td><td><button class="btn small approve" data-id="${p.id}">승인</button></td></tr>`).join('') || '<tr><td colspan="4">승인 대기 중인 회원이 없습니다.</td></tr>'}</tbody></table></div></div></section>`;
  document.querySelectorAll('.approve').forEach((button) => { button.onclick = async () => { const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', button.dataset.id); if (error) return toast(error.message); toast('가입을 승인했습니다.'); await loadData(); approvalsPage(); }; });
}
async function loadData() {
  let profile = await supabase.from('profiles').select('*').eq('id', state.user.id).single();
  // Supabase 대시보드에서 직접 만든 로그인 계정에는 profiles 행이 없을 수 있습니다.
  // 첫 로그인 때 기본 회원 프로필을 만들어 기록 화면으로 바로 들어갈 수 있게 합니다.
  if (profile.error || !profile.data) {
    const fallbackName = state.user.user_metadata?.display_name || state.user.email?.split('@')[0] || '클럽 회원';
    const username = state.user.user_metadata?.username || null;
    const created = await supabase.from('profiles').insert({ id: state.user.id, display_name: fallbackName, username, is_approved: false });
    if (created.error && !/duplicate|unique/i.test(created.error.message || '')) {
      throw new Error(`회원 프로필을 만들지 못했습니다: ${created.error.message}`);
    }
    profile = await supabase.from('profiles').select('*').eq('id', state.user.id).single();
  }
  if (profile.error || !profile.data) throw new Error('회원 프로필을 불러오지 못했습니다. 다시 시도해 주세요.');
  state.profile = profile.data;
  const [records, settings, athletes, teams] = await Promise.all([supabase.from('workout_records').select('*').order('performed_on', { ascending: false }), supabase.from('club_settings').select('*').eq('id', 1).single(), supabase.from('profiles').select('*,teams(name)').order('display_name'), supabase.from('teams').select('*').order('name')]);
  state.records = records.data || []; state.settings = settings.data || {}; state.athletes = athletes.data || []; state.teams = teams.data || [];
}
async function route() {
  const { data: { session } } = await supabase.auth.getSession(); state.user = session?.user || null;
  if (!state.user) { $('#user-area').innerHTML = ''; $('#bottom-nav').innerHTML = ''; return location.hash === '#signup' ? signupPage() : loginPage(); }
  try { await loadData(); topbar(); if (state.profile.role !== 'admin' && !state.profile.is_approved) return pendingPage(); const page = location.hash.slice(1) || 'record'; if (['admin', 'approvals'].includes(page) && state.profile.role !== 'admin') return recordPage(); ({ record: recordPage, me: mePage, team: teamPage, admin: adminPage, approvals: approvalsPage }[page] || recordPage)(); } catch (error) { main.innerHTML = `<section class="page"><div class="card"><h2>접속 오류</h2><p>${esc(error.message)}</p><button class="btn full" id="retry">다시 시도</button></div></section>`; $('#retry').onclick = route; }
}
window.addEventListener('hashchange', route);
supabase.auth.onAuthStateChange(() => route());
route();
