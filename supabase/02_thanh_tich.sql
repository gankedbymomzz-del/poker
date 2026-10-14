-- ====== POKER NHÀ SỐ 7 · LƯU THÀNH TÍCH NGƯỜI CHƠI ======
-- Chạy 1 lần trong Supabase → SQL Editor → New query → Run

alter table public.poker_users
  add column if not exists games       integer not null default 0,  -- số giải đã chơi
  add column if not exists wins        integer not null default 0,  -- số lần vô địch
  add column if not exists top3        integer not null default 0,  -- số lần vào top 3
  add column if not exists best_place  integer,                     -- hạng cao nhất
  add column if not exists hands       integer not null default 0,  -- tổng số ván đã chơi
  add column if not exists last_played timestamptz;

-- Ghi kết quả 1 giải cho 1 người (cộng dồn an toàn, không sợ 2 máy ghi cùng lúc)
create or replace function public.poker_record_result(p_key text, p_place integer, p_hands integer)
returns void
language sql
security definer
set search_path = public
as $$
  update poker_users set
    games       = games + 1,
    wins        = wins + (case when p_place = 1 then 1 else 0 end),
    top3        = top3 + (case when p_place <= 3 then 1 else 0 end),
    best_place  = least(coalesce(best_place, p_place), p_place),
    hands       = hands + greatest(p_hands, 0),
    last_played = now()
  where name_key = p_key;
$$;

-- Chỉ máy chủ được gọi hàm này
revoke execute on function public.poker_record_result(text, integer, integer) from public, anon, authenticated;
grant  execute on function public.poker_record_result(text, integer, integer) to service_role;
