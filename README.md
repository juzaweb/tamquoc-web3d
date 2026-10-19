# Tam Quốc Online — Web 3D MMORPG (MVP)

Game MMORPG 3D nhiều người chơi chạy trên trình duyệt. Server Node.js quản lý tài khoản, nhân vật, hành trang, nhiệm vụ, chiến đấu và đồng bộ trạng thái thế giới theo thời gian thực tới toàn bộ client.

## Tính năng

- **Tài khoản**: đăng ký, đăng nhập bằng JWT, mật khẩu hash bcrypt, lưu phiên ở `localStorage`.
- **Kết nối**: tự động kết nối lại khi mất mạng, giữ nguyên nhân vật và trạng thái thế giới.
- **Nhân vật**: tối đa 4 nhân vật/tài khoản; chọn môn phái, phe phái, giới tính, màu y phục và màu tóc.
- **Môn phái**: Thiếu Lâm (chưởng), Võ Đang (kiếm), Nga My (nữ, kiếm), Ngũ Độc (chảo).
- **Phe phái**: Hán, Thục, Ngụy.
- **Chỉ số**: sức mạnh, tốc độ, trí tuệ, sinh lực, nội lực, công, thủ; tăng theo cấp và trang bị.
- **Thế giới 3D**: 3 thành phe Hán/Thục/Ngụy, mỗi thành có 4 cổng, chiến trường trung tâm, rừng, hồ, núi, đèn lồng và thế giới nhiều người chơi đồng bộ 10 Hz.
- **Bản đồ theo cấp**: mỗi thành có 3 bãi farm riêng ở 3 cổng phụ, mỗi bãi một loại quái; cổng chính chỉ dẫn ra chiến trường PvP và không có quái. Cấp nhân vật tối đa 100.
- **Thành & thương nhân**: mỗi thành có tường thành rộng, khu trung tâm và NPC thương nhân bán Hồi Huyết Đan / Hồi Khí Đan.
- **Chiến đấu**: đòn thường, tuyệt kỹ riêng từng môn phái, chí mạng, hồi máu, độc, hồi sinh sau khi gục ngã.
- **Quái vật**: Sói Hoang, Yêu Xà, Sơn Tặc với AI tuần tra, đuổi theo và tấn công; hồi sinh theo thời gian.
- **World boss**: Hắc Long Vương xuất hiện định kỳ tại chiến trường trung tâm, thông báo toàn server, rơi trang bị hiếm.
- **PvP**: bật/tắt PvP, không thể giao chiến trong khu vực an toàn của 3 thành và không thể tấn công người cùng phe. Đi qua cổng chính ra chiến trường sẽ **tự động bật PK** với 2 phe còn lại; chiến trường trung tâm là nơi các phe đối đầu.
- **Hành trang & trang bị**: vũ khí, áo giáp, phụ kiện, vật phẩm tiêu hao, nguyên liệu; trang bị làm thay đổi chỉ số.
- **Nhiệm vụ**: nhận nhiệm vụ, tiến độ hạ gục quái, báo công nhận XP/vàng/vật phẩm.
- **Chat**: kênh thế giới và kênh phe (chỉ người cùng phe nhận được).
- **Lưu trữ**: nhân vật, vị trí, chỉ số, trang bị, nhiệm vụ được lưu vào SQLite.

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Server | Node.js, TypeScript, Fastify 5 |
| Realtime | Socket.IO |
| Database | SQLite + Prisma ORM |
| Client | TypeScript, Three.js, Vite |
| Xác thực | JWT + bcryptjs |
| Kiểm tra dữ liệu | Zod |

## Cấu trúc dự án

```
prisma/schema.prisma       # User, Character, Item
server/src/
  index.ts                 # Fastify + Socket.IO bootstrap
  routes.ts                # REST API
  socket.ts                # Realtime event handlers
  game/content.ts          # Môn phái, phe, vật phẩm, quái, nhiệm vụ
  game/world.ts            # Game loop, AI, combat, chat, loot, boss
  game/stats.ts            # Công thức chỉ số và sát thương
  game/persistence.ts      # Load/save nhân vật, hành trang
client/src/
  main.ts                  # Luồng UI, input, kết nối mạng
  game.ts                  # Entity, camera, chọn mục tiêu, hiệu ứng
  environment.ts           # Dựng thành, chiến trường, địa hình, ánh sáng
  net.ts                   # Socket.IO client
  style.css                # Giao diện
server/src/game/movement.ts # Va chạm tường thành và cổng
server/test/
  stats.test.ts            # Chỉ số, XP, sát thương, biên bản đồ
  movement.test.ts         # Va chạm tường thành, cổng
  content.test.ts          # Tính nhất quán dữ liệu game
```

## Chạy dự án

Yêu cầu: Node.js 20+ và npm.

```bash
npm install
cp .env.example .env
npm run db:push
npm run dev
```

Mở `http://localhost:5173`. Người chơi mới sẽ xuất hiện tại cổng chính của thành thuộc phe đã chọn.

- Client dev server: `5173` (proxy `/api` và `/socket.io` sang server).
- Game server: `3001`.
- Database SQLite: `prisma/dev.db`.

### Chạy bản production

```bash
npm run build
npm start
```

Mở `http://localhost:3001`. Server tự phục vụ thư mục `dist/client`.

### Kiểm thử

```bash
npm test          # unit tests cho stats và content
npm run typecheck # server, client và test
npm run build     # build production
```

### Biến môi trường

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me-in-production"
PORT=3001
```

> Bắt buộc đổi `JWT_SECRET` khi chạy `NODE_ENV=production`; server sẽ từ chối khởi động nếu vẫn dùng secret mặc định.

## Điều khiển

| Phím / thao tác | Chức năng |
| --- | --- |
| `W A S D` / phím mũi tên | Di chuyển theo hướng camera |
| Kéo chuột trái | Xoay camera |
| Lăn chuột | Thu phóng |
| Click quái / người chơi | Chọn mục tiêu |
| `Tab` | Chọn mục tiêu kế tiếp |
| `1` | Đòn thường |
| `2` | Tuyệt kỹ môn phái |
| `3` | Dùng Hồi Huyết Đan |
| `F` | Mở cửa hàng khi đứng gần thương nhân |
| `I` | Mở hành trang |
| `J` | Mở nhiệm vụ |
| `Enter` | Mở ô chat |

## Bản đồ và tiến trình

- **Hán Thành** ở phía nam, **Thục Thành** ở phía tây, **Ngụy Thành** ở phía đông. Người chơi mới xuất hiện bên trong cổng chính của thành phe mình, hướng ra chiến trường.
- Mỗi thành có 4 cổng: cổng chính hướng về **Chiến Trường Trung Nguyên** (đi qua cổng chính tự động bật PK với 2 phe còn lại), 3 cổng còn lại dẫn ra các bãi farm và khu vực ngoại thành.
- Tường thành chặn di chuyển; chỉ có thể ra vào qua 4 cổng. Khu vực quanh thành là vùng an toàn, không thể PvP.
- Quái vật được chia tầng theo cấp: Sói Hoang/Yêu Xà (1–5), Sơn Tặc (8), Mãnh Hổ (15), U Minh Sứ Giả (30), Chiến Tướng Ma Giới (50), Hắc Long Vương (80).
- Người chơi đạt cấp tối đa **100**; XP sau cấp 100 không còn tích lũy.

## Môn phái

| Môn phái | Vũ khí | Giới tính | Tuyệt kỹ | Đặc điểm |
| --- | --- | --- | --- | --- |
| Thiếu Lâm | Chưởng | Nam | La Hán Chưởng (AoE cận chiến) | Sức mạnh cao, chịu đòn tốt |
| Võ Đang | Kiếm | Nam/Nữ | Thái Cực Kiếm Khí (đánh xa) | Cân bằng công thủ |
| Nga My | Kiếm | Nữ | Nga Mi Phật Quang (sát thương + hồi máu) | Trí tuệ cao, hồi phục |
| Ngũ Độc | Chảo | Nam/Nữ | Độc Chưởng (độc theo thời gian) | Tốc độ và trí tuệ cao |

Công thức chính:

```
maxHp  = 80 + strength*7 + level*14 + trang bị
maxMp  = 40 + intelligence*5 + level*6 + trang bị
attack = 6 + strength*1.7 + vũ khí
defense= strength*0.25 + level*0.7 + giáp
```

## REST API

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| GET | `/api/health` | Kiểm tra server |
| GET | `/api/content` | Dữ liệu môn phái, phe, vật phẩm, quái, nhiệm vụ |
| POST | `/api/auth/register` | Đăng ký tài khoản |
| POST | `/api/auth/login` | Đăng nhập |
| GET | `/api/auth/me` | Thông tin tài khoản hiện tại |
| GET | `/api/characters` | Danh sách nhân vật |
| POST | `/api/characters` | Tạo nhân vật |
| GET | `/api/characters/:id` | Chi tiết nhân vật |

Các endpoint nhân vật yêu cầu header `Authorization: Bearer <token>`.

## Socket.IO events

Client gửi:

- `world:enter` — `{ characterId }`
- `player:move` — `{ x, z, rotation }`
- `combat:attack` — `{ targetId, targetType: "monster" | "player" }`
- `combat:skill` — `{ targetId, targetType }`
- `chat:send` — `{ channel: "global" | "faction", message }`
- `inventory:equip` / `inventory:unequip` / `inventory:use`
- `quest:accept` / `quest:complete`
- `pvp:toggle` — `{ enabled }`

Server gửi:

- `world:init`, `world:state`
- `self:update`
- `combat:event`
- `loot`, `notification`, `level:up`, `player:died`
- `chat:message`, `boss:spawn`, `error:game`

Xác thực socket qua `handshake.auth.token`.

## Thiết kế server

- **Server-authoritative combat**: client chỉ gửi ý định đánh; server kiểm tra khoảng cách, hồi chiêu, nội lực, PvP, khu vực an toàn rồi tính sát thương và loot.
- **Movement validation**: server giới hạn quãng đường theo thời gian giữa hai gói tin và biên thế giới.
- **Game loop 10 Hz**: cập nhật AI quái, hồi phục ngoài chiến đấu, hồi sinh và phát snapshot thế giới.
- **Persistence**: lưu định kỳ 10 giây khi có thay đổi, khi rời thế giới và khi tắt server; hành trang và trang bị được ghi ngay khi thay đổi.
- **Bảo vệ cơ bản**: rate limit đăng nhập/đăng ký theo IP, cooldown chat, chặn phiên điều khiển trùng nhân vật, CSP và security headers; mọi input REST/socket đều qua Zod.
- **Quest state**: lưu dạng JSON trên nhân vật; tiến độ tăng khi hạ gục đúng loại quái.
- **Khu vực an toàn**: server kiểm tra khoảng cách tới 3 thành; mọi đòn PvP trong vùng an toàn bị từ chối. Cổng chính có vùng PK tự động; đòn đánh cùng phe luôn bị chặn.

## Hướng phát triển

- Party/clan, kênh chat nhóm và nhiệm vụ đồng đội.
- Instance dungeon, chuyển vùng và nhiều bản đồ riêng cho từng cấp.
- Load balancing nhiều zone, Redis pub/sub, spatial interest management.
- Anti-cheat chặt hơn cho movement (server-side pathing), rate limit phân tán và audit log.
- Refresh token, xác thực email, quản lý phiên.
- Asset GLTF, animation nhân vật, âm thanh và mobile controls.
- Chợ giao dịch, nâng cấp trang bị, sự kiện theo mùa.

## Lưu ý

Đây là MVP phục vụ học tập và thử nghiệm. Trước khi phát hành công khai cần bổ sung HTTPS/WSS, rate limiting phân tán, secret management, backup database và kiểm thử tải. Movement hiện là kiểm tra biên độ phía server, chưa phải pathfinding đầy đủ.

`npm audit` còn cảnh báo transitive `deepmerge-ts` nằm trong Prisma CLI (dev tooling, không chạy trong server runtime); cần xử lý khi nâng lên Prisma 7.
