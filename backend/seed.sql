-- Reference data for a Kenyan school. Idempotent: safe to run after schema.sql on any install.
-- Editing a subject name here is a single UPDATE; marks follow the subject id, not the name.

insert into classes (name, group_code, sort_order) select * from (values
  ('PP1','pre',1),('PP2','pre',2),
  ('Grade 1','lower',3),('Grade 2','lower',4),('Grade 3','lower',5),
  ('Grade 4','upper',6),('Grade 5','upper',7),('Grade 6','upper',8),
  ('Grade 7','junior',9),('Grade 8','junior',10),('Grade 9','junior',11),
  ('Grade 10','senior',12),('Grade 11','senior',13),('Grade 12','senior',14),
  ('Form 3','form',15),('Form 4','form',16)
) v(name, group_code, sort_order)
on conflict (name) do nothing;

insert into subjects (group_code, name, position) select * from (values
  ('pre','Language Activities',1),('pre','Mathematical Activities',2),('pre','Environmental Activities',3),
  ('pre','Psychomotor and Creative Activities',4),('pre','Religious Activities',5),

  ('lower','English',1),('lower','Kiswahili',2),('lower','Indigenous Language',3),('lower','Mathematics',4),
  ('lower','Environmental Activities',5),('lower','Religious Education',6),('lower','Creative Activities',7),

  ('upper','English',1),('upper','Kiswahili',2),('upper','Mathematics',3),('upper','Science and Technology',4),
  ('upper','Social Studies',5),('upper','Agriculture and Nutrition',6),('upper','Religious Education',7),('upper','Creative Arts',8),

  ('junior','English',1),('junior','Kiswahili',2),('junior','Mathematics',3),('junior','Integrated Science',4),
  ('junior','Social Studies',5),('junior','Agriculture and Nutrition',6),('junior','Pre-Technical Studies',7),
  ('junior','Religious Education',8),('junior','Creative Arts and Sports',9),

  ('senior','English',1),('senior','Kiswahili',2),('senior','Mathematics',3),('senior','Community Service Learning',4),
  ('senior','Physical Education',5),('senior','ICT',6),('senior','Elective 1',7),('senior','Elective 2',8),('senior','Elective 3',9),

  ('form','English',1),('form','Kiswahili',2),('form','Mathematics',3),('form','Biology',4),('form','Chemistry',5),
  ('form','Physics',6),('form','History',7),('form','Geography',8),('form','CRE',9),('form','Business Studies',10)
) v(group_code, name, position)
on conflict (group_code, name) do update set position = excluded.position;

-- CBC levels apply to every group except the 8-4-4 forms, which use KCSE grades.
insert into grade_bands (group_code, min_score, grade, points)
select g.group_code, b.min_score, b.grade, b.points
  from (values ('pre'),('lower'),('upper'),('junior'),('senior')) g(group_code)
 cross join (values (90,'EE1',8),(75,'EE2',7),(58,'ME1',6),(41,'ME2',5),(31,'AE1',4),(21,'AE2',3),(11,'BE1',2),(0,'BE2',1))
   b(min_score, grade, points)
union all
select 'form', b.min_score, b.grade, b.points
  from (values (80,'A',12),(75,'A-',11),(70,'B+',10),(65,'B',9),(60,'B-',8),(55,'C+',7),
               (50,'C',6),(45,'C-',5),(40,'D+',4),(35,'D',3),(30,'D-',2),(0,'E',1)) b(min_score, grade, points)
on conflict (group_code, grade) do update set min_score = excluded.min_score, points = excluded.points;

-- Terms follow the calendar windows the browser build used. Replace these dates with the
-- real gazetted calendar once the school supplies them.
with yr as (select extract(year from current_date)::int as year),
     win (number, first_month, last_month) as (values (1,1,4),(2,5,8),(3,9,12))
insert into terms (year, number, starts_on, ends_on)
select yr.year, win.number,
       make_date(yr.year, win.first_month, 1),
       make_date(yr.year + (win.last_month = 12)::int, (win.last_month % 12) + 1, 1) - 1
  from yr, win
on conflict (year, number) do nothing;

update settings set current_term_id = (
  select t.id from terms t
   where current_date between t.starts_on and t.ends_on
   order by t.year desc, t.number desc limit 1
) where settings.id = 1 and settings.current_term_id is null;
