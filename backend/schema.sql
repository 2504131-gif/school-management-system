-- Schoolhouse schema. One school per install. PostgreSQL 13+.
-- Structural equivalents of the frontend fixes:
--   marks point at subject ids, so renaming a subject can never orphan marks
--   every payment belongs to a term row, and its date must fall inside that term
--   fees are billed per learner per term, so a mid-year change does not rewrite history
--   payments are voided, never deleted, and a learner with payments cannot be deleted

create table if not exists terms (
  id bigserial primary key,
  year int not null,
  number int not null check (number between 1 and 3),
  starts_on date not null,
  ends_on date not null,
  check (ends_on > starts_on),
  unique (year, number)
);

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  school_name text not null,
  current_term_id bigint references terms(id) on delete restrict
);
insert into settings (id, school_name) values (1, 'Sunrise Academy') on conflict (id) do nothing;

create table if not exists classes (
  id bigserial primary key,
  name text not null unique,
  group_code text not null check (group_code in ('pre','lower','upper','junior','senior','form')),
  sort_order int not null default 0
);

create table if not exists subjects (
  id bigserial primary key,
  group_code text not null check (group_code in ('pre','lower','upper','junior','senior','form')),
  name text not null,
  position int not null,
  retired_at timestamptz,
  unique (group_code, name)
);
create index if not exists subjects_order on subjects (group_code, position) where retired_at is null;

create table if not exists grade_bands (
  group_code text not null check (group_code in ('pre','lower','upper','junior','senior','form')),
  min_score numeric(5,1) not null,
  grade text not null,
  points int not null check (points >= 0),
  primary key (group_code, grade)
);

create table if not exists users (
  id bigserial primary key,
  role text not null check (role in ('admin','teacher','student')),
  username text not null,
  password_hash text not null,
  first_name text not null check (first_name ~ '\S'),
  last_name text not null check (last_name ~ '\S'),
  phone text,
  approved boolean not null default false,
  archived_at timestamptz,
  joined_on date not null default current_date,
  created_at timestamptz not null default now(),
  class_id bigint references classes(id) on delete restrict,
  admission_no text,
  gender text check (gender in ('Female','Male')),
  guardian_name text,
  monthly_salary_ksh bigint check (monthly_salary_ksh >= 0),
  tsc_number text,
  check (username ~ '^[A-Za-z0-9._-]{3,20}$'),
  check (phone is null or phone ~ '^0[0-9]{3} [0-9]{3} [0-9]{3}$'),
  check (role <> 'student' or (class_id is not null and admission_no is not null and guardian_name is not null and gender is not null)),
  check (role = 'student' or class_id is null),
  check (role <> 'teacher' or monthly_salary_ksh is not null),
  check (role = 'student' or admission_no is null),
  check (role = 'teacher' or tsc_number is null)
);
create unique index if not exists users_username on users (lower(username));
create unique index if not exists students_admission on users (admission_no) where role = 'student';
create index if not exists students_class on users (class_id) where role = 'student' and archived_at is null;
create index if not exists people_role on users (role, approved, archived_at);

create table if not exists teacher_assignments (
  id bigserial primary key,
  teacher_id bigint not null references users(id) on delete cascade,
  class_id bigint not null references classes(id) on delete cascade,
  subject_id bigint references subjects(id) on delete cascade
);
create unique index if not exists ta_whole_class on teacher_assignments (teacher_id, class_id) where subject_id is null;
create unique index if not exists ta_single_subject on teacher_assignments (teacher_id, class_id, subject_id) where subject_id is not null;

-- Cross-table rules cannot live in a CHECK, so the teacher role is enforced here.
create or replace function check_assignment_roles() returns trigger language plpgsql as $fn$
begin
  if not exists (select 1 from users u where u.id = new.teacher_id and u.role = 'teacher' and u.approved and u.archived_at is null) then
    raise exception 'teacher % is not an approved active teacher', new.teacher_id;
  end if;
  if not exists (select 1 from users s where s.id = new.class_id) then
    raise exception 'class % does not exist', new.class_id;
  end if;
  return new;
end $fn$;

drop trigger if exists assignments_roles on teacher_assignments;
create trigger assignments_roles before insert or update on teacher_assignments
  for each row execute function check_assignment_roles();

create table if not exists fee_amounts (
  id bigserial primary key,
  student_id bigint not null references users(id) on delete cascade,
  term_id bigint not null references terms(id) on delete restrict,
  amount_ksh bigint not null check (amount_ksh >= 0),
  unique (student_id, term_id)
);

create table if not exists marks (
  id bigserial primary key,
  student_id bigint not null references users(id) on delete cascade,
  subject_id bigint not null references subjects(id) on delete restrict,
  term_id bigint not null references terms(id) on delete restrict,
  exam text not null check (exam in ('Opener','Mid-term','End-term')),
  score numeric(5,1) check (score >= 0 and score <= 100),
  absent boolean not null default false,
  entered_by bigint references users(id) on delete set null,
  entered_at timestamptz not null default now(),
  unique (student_id, subject_id, term_id, exam),
  check ((absent and score is null) or (not absent and score is not null))
);
create index if not exists marks_lookup on marks (term_id, exam, student_id);

create table if not exists attendance (
  id bigserial primary key,
  student_id bigint not null references users(id) on delete cascade,
  taken_on date not null,
  status text not null check (status in ('Present','Absent')),
  taken_by bigint references users(id) on delete set null,
  taken_at timestamptz not null default now(),
  unique (student_id, taken_on)
);
create index if not exists attendance_day on attendance (taken_on);

create sequence if not exists receipt_seq start 1;

create table if not exists payments (
  id bigserial primary key,
  student_id bigint not null references users(id) on delete restrict,
  term_id bigint not null references terms(id) on delete restrict,
  amount_ksh bigint not null check (amount_ksh > 0),
  paid_on date not null,
  method text not null check (method in ('M-Pesa','Cash','Bank deposit','Cheque')),
  reference text not null default '',
  receipt_no text not null unique default ('RCT-' || lpad(nextval('receipt_seq')::text, 4, '0')),
  recorded_by bigint references users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by bigint references users(id) on delete set null,
  void_reason text,
  check (method <> 'M-Pesa' or reference ~ '^[A-Z0-9]{10}$'),
  check (voided_at is null or void_reason is not null)
);
create index if not exists payments_student on payments (student_id, term_id) where voided_at is null;

create table if not exists notices (
  id bigserial primary key,
  body text not null check (length(trim(body)) between 1 and 500),
  posted_on date not null default current_date,
  author_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists contact_messages (
  id bigserial primary key,
  sender_name text not null check (length(sender_name) <= 60),
  sender_email text not null check (sender_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  body text not null check (length(body) <= 500),
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create table if not exists sessions (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists sessions_user on sessions (user_id);

create table if not exists audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id bigint references users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb
);
create index if not exists audit_entity on audit (entity, entity_id);

-- A payment must land inside the term it is posted to, that learner must be billed for
-- that term, and the term may not be over-paid. This is what stops the wrong-term bug
-- that the browser build had.
create or replace function check_payment_terms() returns trigger language plpgsql as $fn$
declare
  t terms%rowtype;
  billed bigint;
  already bigint;
begin
  if new.voided_at is not null then return new; end if;
  select * into strict t from terms where id = new.term_id;
  if new.paid_on < t.starts_on or new.paid_on > t.ends_on then
    raise exception 'payment dated % falls outside Term % of % (% to %)',
      new.paid_on, t.number, t.year, t.starts_on, t.ends_on;
  end if;
  select amount_ksh into billed from fee_amounts where student_id = new.student_id and term_id = new.term_id;
  if not found then
    raise exception 'learner % is not billed for term %', new.student_id, new.term_id;
  end if;
  select coalesce(sum(amount_ksh), 0) into already from payments
   where student_id = new.student_id and term_id = new.term_id and voided_at is null and id is distinct from new.id;
  if already + new.amount_ksh > billed then
    raise exception 'term % of % for learner % would be over-paid: billed %, already %, adding %',
      t.number, t.year, new.student_id, billed, already, new.amount_ksh;
  end if;
  return new;
end $fn$;

drop trigger if exists payments_terms on payments;
create trigger payments_terms before insert or update on payments
  for each row execute function check_payment_terms();

-- A learner who has ever paid cannot be deleted, only archived.
create or replace function protect_paid_learners() returns trigger language plpgsql as $fn$
begin
  if exists (select 1 from payments where student_id = old.id) then
    raise exception 'learner % has payment records; archive them instead of deleting', old.id;
  end if;
  return old;
end $fn$;

drop trigger if exists users_protect on users;
create trigger users_protect before delete on users
  for each row execute function protect_paid_learners();

create or replace function grade_for(p_group text, p_score numeric)
returns table (grade text, points int) language sql stable as $fn$
  select gb.grade, gb.points from grade_bands gb
   where gb.group_code = p_group and p_score >= gb.min_score
   order by gb.min_score desc limit 1;
$fn$;

-- Papers sat, papers expected, mean over papers sat, and whether the sitting is complete.
create or replace view v_exam_results as
with papers as (
  select m.student_id, m.term_id, m.exam,
         count(*) filter (where not m.absent) as sat,
         count(*) filter (where m.absent) as absent,
         coalesce(sum(m.score) filter (where not m.absent), 0) as total
    from marks m group by m.student_id, m.term_id, m.exam
), offered as (
  select c.id as class_id, count(*) as papers
    from classes c join subjects s on s.group_code = c.group_code and s.retired_at is null
   group by c.id
)
select u.id as student_id, u.class_id, u.first_name, u.last_name, u.admission_no,
       p.term_id, t.year, t.number as term, p.exam,
       o.papers as offered, p.sat, p.absent, (o.papers - p.absent) as expected,
       p.total, case when p.sat > 0 then round(p.total / p.sat, 2) end as mean,
       (p.sat > 0 and p.sat = o.papers - p.absent) as complete,
       c.group_code
  from papers p
  join users u on u.id = p.student_id
  join classes c on c.id = u.class_id
  join offered o on o.class_id = u.class_id
  join terms t on t.id = p.term_id;

-- Position only ranks learners who sat every paper they were expected to sit.
-- rank() gives competition ranking, so equal totals share a position.
create or replace view v_exam_positions as
select r.*, rank() over (partition by r.class_id, r.term_id, r.exam order by r.total desc) as position,
       count(*) over (partition by r.class_id, r.term_id, r.exam) as ranked_count
  from v_exam_results r where r.complete;

create or replace view v_student_balances as
select fa.student_id, fa.term_id, t.year, t.number as term, t.starts_on, t.ends_on,
       fa.amount_ksh as billed,
       coalesce(sum(p.amount_ksh) filter (where p.voided_at is null), 0) as paid,
       greatest(fa.amount_ksh - coalesce(sum(p.amount_ksh) filter (where p.voided_at is null), 0), 0) as balance,
       coalesce(sum(p.amount_ksh) filter (where p.voided_at is not null), 0) as voided
  from fee_amounts fa
  join terms t on t.id = fa.term_id
  left join payments p on p.student_id = fa.student_id and p.term_id = fa.term_id
 group by fa.student_id, fa.term_id, fa.amount_ksh, t.year, t.number, t.starts_on, t.ends_on;

-- Daily register for a class, derived from the learner's class rather than a stored copy.
create or replace view v_registers as
select a.taken_on, u.class_id, c.name as class_name,
       count(*) as taken,
       count(*) filter (where a.status = 'Present') as present,
       count(*) filter (where a.status = 'Absent') as absent
  from attendance a join users u on u.id = a.student_id join classes c on c.id = u.class_id
 group by a.taken_on, u.class_id, c.name;
