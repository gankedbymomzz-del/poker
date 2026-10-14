# ♠ Poker Nhà Số 7

Texas Hold'em No-Limit, thể thức Sit & Go cho 2–6 người. Chip ảo, chỉ để giải trí.

**Trạng thái: Bước 1/3 — Lõi luật chơi + bàn thử với máy.**

---

## Bước 1 (hiện tại): làm gì ngay

### 1. Đưa lên GitHub (repo MỚI, tách riêng với Săn Ma)

1. https://github.com/new → tên repo `poker-nha-so-7` → **Create repository**.
2. Bấm **uploading an existing file** → mở thư mục `poker`, **Ctrl + A** kéo thả toàn bộ bên trong → **Commit changes**.
3. Kiểm tra: repo thấy ngay `package.json`, `engine/`, `src/` ở cấp ngoài cùng.

### 2. Deploy lên Vercel

Vercel → **Add New → Project** → chọn `poker-nha-so-7` → **Deploy**. Vercel tự nhận Vite, không cần chỉnh gì.

### 3. Chơi thử và soát luật

Mở link trên điện thoại, chọn số bot, chọn blind "1 phút (thử nhanh)". Thử các tình huống sau:

| Tình huống | Kết quả đúng |
|---|---|
| Mọi người chỉ theo preflop | Big Blind vẫn được Nhường hoặc Tố |
| Có người tố lên 60 (blind 10/20) | Người sau muốn tố lại phải lên ít nhất 100 |
| Bạn all-in, nhiều người theo với số chip khác nhau | Có hũ chính và hũ phụ, ai ăn hũ nào hiện rõ |
| Hai người cùng bộ bài | Chia đôi hũ |
| Chỉ còn 2 người | Dealer đặt Small Blind và nói trước ở preflop |
| Để hết 30 giây không bấm | Tự Nhường nếu được, không thì tự Bỏ bài |
| Bấm **Diễn biến** | Thấy từng hành động của ván |

Thấy gì lạ thì chụp màn hình phần **Diễn biến** gửi mình.

### 4. (Tuỳ chọn) Chạy kiểm thử trên máy

Cài Node.js LTS (https://nodejs.org). Mở thư mục bằng VS Code → Terminal:

```bash
npm install
npm test
```

Đúng thì thấy `# pass 23` và `# fail 0`. Bộ kiểm thử gồm chấm bài, hũ phụ, từng luật cược, và **giả lập hơn 3.000 ván** kiểm tra tổng chip luôn bảo toàn.

### 5. Chuẩn bị cho Bước 2: tạo Supabase

1. https://supabase.com → **Start your project** → đăng nhập bằng GitHub.
2. **New project**: tên `poker-nha-so-7`, đặt mật khẩu database (lưu lại), Region **Southeast Asia (Singapore)**, gói **Free** → **Create**.
3. Đợi 1–2 phút. Vào **Project Settings → API**, ghi lại 3 thứ: **Project URL**, **anon public key**, **service_role key**.

⚠️ **service_role key** là chìa khoá toàn quyền: **không gửi vào chat, không đưa lên GitHub**. Bước 2 sẽ hướng dẫn dán vào Vercel.

---

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
└── src/                    # Bàn chơi thử với máy (React)
```

## Lộ trình

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 1 | Lõi luật + kiểm thử + bàn thử với máy | ✅ |
| 2 | Phòng nhiều người: máy chủ Vercel + Supabase Realtime, chọn ghế, chơi thật | Tiếp theo |
| 3 | Hoàn thiện: rớt mạng vào lại, bấm trước, lịch sử ván, chat, âm thanh | Sau đó |
