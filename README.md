# ♠ Poker Nhà Số 7

Texas Hold'em No-Limit, thể thức Sit & Go cho 2–6 người. Chip ảo, chỉ để giải trí.

**Trạng thái: Bước 2/3 — Bàn nhiều người chơi thật.**

---

## Bước 2 (hiện tại): làm gì ngay

### Điều kiện đã có (đã làm ở bước trước)

- Supabase đã chạy đoạn SQL tạo 3 bảng `poker_users`, `poker_rooms`, `poker_signals`.
- Vercel đã có 3 biến môi trường: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` (tick Production + Preview).

### 1. Cập nhật lên GitHub

Repo `poker-nha-so-7` → **Add file → Upload files** → kéo thả toàn bộ nội dung thư mục `poker` mới → **Commit changes**.
Thư mục mới `api/` phải nằm ngang hàng với `src/` và `engine/`.

Vercel tự deploy lại. Máy chủ được đặt ở **Tokyo** (`vercel.json`) cho cùng vùng với Supabase.

### 2. Kiểm tra máy chủ đã nhận cấu hình

Mở `https://<link-của-bạn>/api/poker?action=config`

| Thấy | Ý nghĩa |
|---|---|
| `{"url":"https://anazdqhjnbujaczoqwxy.supabase.co","publishableKey":"sb_publishable_…"}` | ✅ Đúng |
| `url` hoặc `publishableKey` rỗng | Thiếu biến trên Vercel, hoặc chưa Redeploy sau khi thêm biến |

### 3. Chơi thử với 2–3 người

1. Người thứ nhất: ghi danh → **Tạo bàn mới** → nhận mã 4 số.
2. Người khác: ghi danh → nhập mã → **Vào bàn**. Chạm ghế trống để đổi chỗ.
3. Chủ bàn bấm **Bắt đầu giải**.

Chấm tròn cạnh mã bàn: **xanh lá** = cập nhật tức thì qua Supabase Realtime. **Xám** = đang dùng chế độ dự phòng (hỏi máy chủ 2 giây/lần), vẫn chơi được nhưng chậm hơn.

### Khi gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| "Máy chủ chưa cấu hình Supabase" | Thiếu `SUPABASE_URL` hoặc `SUPABASE_SECRET_KEY` trên Vercel → thêm rồi Redeploy |
| "Invalid API key" / lỗi 401 khi ghi danh | Dán nhầm khoá: `SUPABASE_SECRET_KEY` phải là khoá `sb_secret_…` |
| Lỗi "relation poker_users does not exist" | Chưa chạy đoạn SQL tạo bảng |
| Chấm tròn luôn xám | Kiểm tra `SUPABASE_PUBLISHABLE_KEY`, và trong Supabase: Database → Publications → `supabase_realtime` có bảng `poker_signals` |

---

## Cách hệ thống hoạt động

```
Điện thoại  ──"tôi tố 200"──►  Vercel (Tokyo)  ──đọc/ghi──►  Supabase poker_rooms (bộ bài, bài tẩy: CHỈ máy chủ đọc được)
     ▲                              │
     │                              └──ghi số phiên bản──►  poker_signals ──Realtime──┐
     └──────── "bàn vừa đổi" ◄────────────────────────────────────────────────────────┘
     └── hỏi lại máy chủ → nhận ĐÚNG phần mình được xem (bài của mình + bài đã lật)
```

- Hai người bấm cùng lúc: máy chủ ghi có kiểm tra phiên bản, người sau tự thử lại, không mất hành động.
- Hết giờ 20 giây: điện thoại tự "đánh thức" máy chủ đúng lúc, máy chủ tự Nhường hoặc Bỏ bài.
- Tải lại trang giữa giải: tự vào lại đúng bàn, đúng ghế.
- Rời bàn giữa giải: chuyển sang "Tạm vắng", máy tự bỏ bài thay. Bấm **Quay lại bàn** để chơi tiếp.
- Bàn bỏ hoang quá 1 ngày tự được dọn.

## Luật chơi tóm tắt

- 1.500 chip mỗi người. Blind 10/20, tăng mỗi 6 phút: 15/30 → 25/50 → 50/100 → 75/150 → 100/200 …
- Mỗi người 2 lá tẩy + 5 lá chung, ghép 5 lá tốt nhất.
- 4 vòng cược: Preflop, Flop (3 lá), Turn (1 lá), River (1 lá), rồi lật bài.
- Tố tối thiểu = mức cược hiện tại + mức tố gần nhất. All-in thiếu không mở lại quyền tố cho người đã hành động.
- Hết chip là bị loại. Người cuối cùng còn chip vô địch.

## Cấu trúc

```
poker/
├── engine/                 # LÕI LUẬT — thuần JavaScript, bước 2 dùng nguyên ở máy chủ
│   ├── cards.js            # Bộ bài, trộn bài (có bản mật mã cho máy chủ)
│   ├── evaluate.js         # Chấm điểm bài, tên bài tiếng Việt
│   ├── pots.js             # Hũ chính, hũ phụ, chia chip lẻ
│   ├── game.js             # Máy cược No-Limit, lượt nói, loại người chơi, tăng blind
│   ├── bots.js             # Người chơi máy
│   └── tests/              # 23 kiểm thử + giả lập hàng nghìn ván
├── api/
│   ├── poker.js            # API bàn chơi: ghi danh, tạo/vào bàn, chọn ghế, hành động
│   └── _lib/db.js          # Kết nối Supabase (chỉ chạy ở máy chủ)
├── src/
│   ├── App.jsx             # Màn hình chính
│   ├── OnlineGame.jsx      # Chơi phòng: phòng chờ, bàn chơi, nghe tín hiệu
│   ├── BotGame.jsx         # Luyện tập với máy
│   └── Table.jsx           # Bàn chơi dùng chung cho cả 2 chế độ
└── vercel.json             # Đặt máy chủ ở Tokyo
```

## Lộ trình

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 1 | Lõi luật + kiểm thử + bàn thử với máy | ✅ |
| 2 | Phòng nhiều người: máy chủ Vercel + Supabase Realtime, chọn ghế, chơi thật | ✅ |
| 3 | Hoàn thiện: bấm trước, thời gian dự phòng, lịch sử ván, chat, âm thanh, hiệu ứng | Tiếp theo |
