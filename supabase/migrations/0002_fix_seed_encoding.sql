-- Repair the em dashes that a CP437 clipboard hop corrupted when 0001 was applied.
-- This file is deliberately pure ASCII: chr(8212) builds the real em dash, and the
-- corrupted bytes are named in hex, so pasting it cannot re-break it.

update public.matches
   set title = 'EVW 17 ' || chr(8212) || ' Janis Amolins vs. Mindaugas Tarasaitis'
 where title like 'EVW 17 %Janis Amolins vs. Mindaugas Tarasaitis';

update public.annotations
   set note = 'Fidgeted, got 2nd foul ' || chr(8212) || ' lost the round on fouls'
 where note like 'Fidgeted, got 2nd foul%lost the round on fouls';

update public.annotations
   set note = 'Great mid-table vector change in strap ' || chr(8212) || ' Janis had no answer'
 where note like 'Great mid-table vector change in strap%Janis had no answer';

do $$
declare src text;
begin
  src := pg_get_functiondef('public.handle_new_user()'::regprocedure);
  src := replace(src, convert_from('\xce93c387c3b6'::bytea, 'UTF8'), chr(8212));
  execute src;
end;
$$;
