# ♠ Poker Nhà Số 7

Texas Hold'em No-Limit, thể thức Sit & Go cho 2–6 người. Chip ảo, chỉ để giải trí.

**Trạng thái: Sòng bài 5 game — Poker, Bài cào 3 lá, Xì dách, Tiến lên miền Nam, Mậu binh.**

---

## Cập nhật: mật khẩu quản trị, đăng nhập tên + PIN, tự huỷ bàn

### Cài đặt 1 lần (bắt buộc)

Vercel → project → **Settings → Environment Variables**:

| Tên | Giá trị |
|---|---|
| `ADMIN_PASSWORD` | Mật khẩu để mở bàn, **nên dài từ 8 ký tự**, ví dụ `NhaSo7@2026` |

Xoá biến `ADMIN_NAMES` cũ nếu có (không dùng nữa). Save → **Deployments → Redeploy**.

### Đăng nhập

- Lần đầu: đặt **tên + mã PIN** (4–8 số).
- Lần sau, ở **máy nào cũng được**, nhập đúng tên + PIN là vào.
- Tài khoản tạo trước bản này: nhập tên cũ + PIN mới là nhận lại được (kèm thành tích).

### Mở bàn và mời

Bấm **Mở bàn mới** → nhập mật khẩu quản trị (có thể tick "Ghi nhớ trên máy này") → ở phòng chờ bấm **Sao chép link mời** gửi mọi người. Người khác vào bàn bằng link mời; đoán mã 4 số mà không có link thì không vào được.

### Bàn tự huỷ

| Trường hợp | Kết quả |
|---|---|
| Một người rời giữa ván | Bàn vẫn chạy, máy tự bỏ bài thay người đó |
| **Người cuối cùng rời bàn** | Bàn huỷ ngay, không chạy ẩn |
| Không có hoạt động quá 30 phút (mọi người tắt máy mà không bấm Rời bàn) | Tự dọn |

## Cập nhật: chat, ném icon, vay chip

Không cần chạy SQL. Upload thư mục mới lên GitHub là xong.

| Tính năng | Cách dùng |
|---|---|
| **Chat** | Nút 💬 trên thanh trên (có số tin chưa đọc). Biểu cảm, câu nói nhanh, tin nhắn hiện thành bong bóng cạnh ghế |
| **Ném icon** | **Chạm vào ghế người khác** → chọn 🍅 🌹 🥚 💣 🍺 💋 👏 💩, icon bay ngang bàn |
| **Vay chip** | Nút 💰 (Poker, Bài cào, Xì dách) → chọn người, số chip → người kia bấm Cho vay / Từ chối |
| **Trả nợ** | 💰 → Sổ nợ → Trả hết |

Luật vay: chip chỉ chuyển **khi hết ván** (không chuyển giữa ván để không phá luật cược). Người cho vay và người trả luôn giữ lại ít nhất 1 chip. Hết chip mà được vay thì **vào chơi lại**. Lời hỏi vay tự hết hạn sau 90 giây. Sổ nợ xoá khi mở giải mới.

Chống phá: 0,7 giây/tin chat, 1,2 giây/lần ném icon, tự che từ thô tục.

## Cập nhật: 5 game bài

Không cần chạy thêm SQL. Chỉ cần upload thư mục mới lên GitHub.

**Cách chơi:** tạo bàn như cũ → ở phòng chờ, **chủ bàn chọn game và số ván** → Bắt đầu. Hết giải, chủ bàn có thể đổi sang game khác cho ván sau.

| Game | Số người | Thể thức | Tính |
|---|---|---|---|
| Poker Texas Hold'em | 2–6 | Sit & Go, loại trực tiếp | Chip |
| Bài cào 3 lá | 2–6 | Nhà cái xoay vòng, đặt cược ×1–×3, nặn bài | Chip |
| Xì dách | 2–6 | Nhà cái xoay vòng, rút/dằn | Chip |
| Tiến lên miền Nam | 2–4 | 13 lá, chặt heo, tới trắng | Điểm |
| Mậu binh | 2–4 | Xếp 3 chi, so chi, sập hầm, binh lủng | Điểm (chi) |

Mỗi bàn có nút **Luật chơi** giải thích chi tiết luật đang dùng. Luyện tập với máy có đủ 5 game.

### Luật đã chọn (có thể chỉnh trong `engine/games/<tên game>.js`)

- **Bài cào:** điểm = tổng nút lấy hàng đơn vị, 3 Tây lớn nhất và ăn gấp đôi, bằng điểm thì hoà.
- **Xì dách:** Xì bàng > Xì dách > Ngũ linh > điểm. Con dưới 16 không được dằn, nhà cái dưới 15 phải rút. Quắc gặp quắc thì hoà. Xì bàng, Xì dách, Ngũ linh ăn gấp đôi.
- **Tiến lên:** 3 đôi thông/tứ quý chặt 1 heo; tứ quý/4 đôi thông chặt đôi heo. Heo đen 1 điểm, heo đỏ 2 điểm. Tới trắng: tứ quý heo, sảnh rồng, 6 đôi, 5 đôi thông. Điểm 4 người: +3, +1, −1, −3.
- **Mậu binh:** binh lủng thua 6 chi mỗi người. Sập hầm nhân đôi. Thưởng chi: chi đầu sám ×3; chi giữa cù lũ ×2, tứ quý ×8, thùng phá sảnh ×10; chi cuối tứ quý ×4, thùng phá sảnh ×5. Tới trắng: sảnh rồng, 6 đôi.

### Kiểm thử

`npm test` chạy 39 kiểm thử: luật từng game, chặt heo, binh lủng, sập hầm, Át trong xì dách, và giả lập 60 giải đấu mỗi game giữa các bot để kiểm tra chip/điểm luôn bảo toàn.

---

## Cập nhật mới nhất: làm gì ngay

### 1. Chạy thêm 1 file SQL (bật lưu thành tích)

Supabase → **SQL Editor** → **New query** → mở file `supabase/02_thanh_tich.sql` trong thư mục này, copy toàn bộ, dán vào → **Run**.

Chưa chạy file này game vẫn chơi bình thường, chỉ là chưa lưu thành tích và Bảng vàng sẽ báo chưa bật.

### 2. Cập nhật GitHub

Upload toàn bộ thư mục `poker` mới như mọi lần. Vercel tự deploy.

### Có gì mới

| Phần | Chi tiết |
|---|---|
| **Thành tích** | Lưu số giải, số lần vô địch, top 3, hạng tốt nhất, tổng số ván. Hiện ở màn hình chính |
| **Bảng vàng** | Top 20 người chơi theo số lần vô địch |
| **Chia bài** | Bộ bài đặt giữa bàn, từng lá bay tới từng ghế theo đúng thứ tự từ trái nút Dealer |
| **Lật bài** | Bài của bạn úp, viền nhấp nháy, **chạm từng lá để lật**. Bài chung và bài đối thủ lật 3D |
| **Âm thanh** | Chia bài, lật bài, chip, gõ bàn khi nhường, báo tới lượt, nhạc thắng |
| **Cài đặt** (nút ⚙) | Bật/tắt âm thanh, bật "Tự lật bài" nếu không thích chạm |
| **Giao diện** | Bàn viền gỗ, nỉ có vân, lá bài có góc chỉ số, chip, nhãn "Tới lượt bạn", màn kết quả có cúp |

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
│   ├── games/              # Khuôn chung + luật Bài cào, Xì dách, Tiến lên, Mậu binh
│   ├── bots.js             # Người chơi máy
│   └── tests/              # 23 kiểm thử + giả lập hàng nghìn ván
├── api/
│   ├── poker.js            # API bàn chơi: ghi danh, tạo/vào bàn, chọn ghế, hành động
│   └── _lib/db.js          # Kết nối Supabase (chỉ chạy ở máy chủ)
├── src/
│   ├── App.jsx             # Màn hình chính
│   ├── OnlineGame.jsx      # Chơi phòng: phòng chờ, bàn chơi, nghe tín hiệu
│   ├── PracticeGame.jsx    # Luyện tập với máy (cả 5 game)
│   ├── games/              # Bàn chơi từng game: DealerTable, TienLenTable, MauBinhTable
│   └── Table.jsx           # Bàn chơi dùng chung cho cả 2 chế độ
└── vercel.json             # Đặt máy chủ ở Tokyo
```

## Lộ trình

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 1 | Lõi luật + kiểm thử + bàn thử với máy | ✅ |
| 2 | Phòng nhiều người: máy chủ Vercel + Supabase Realtime, chọn ghế, chơi thật | ✅ |
| 3 | Hoàn thiện: bấm trước, thời gian dự phòng, lịch sử ván, chat, âm thanh, hiệu ứng | Tiếp theo |
