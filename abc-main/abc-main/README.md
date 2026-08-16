# Mã QR ra vào

## Cấu hình Firebase bắt buộc

1. Trong **Firebase Authentication > Sign-in method**, bật **Email/Password** cho quản trị viên và **Anonymous** cho trang nhân viên.
2. Tạo tài khoản quản trị bằng Email/Password.
3. Trong Firestore, tạo document `admins/<UID-của-tài-khoản-quản-trị>` để cấp quyền quản trị.
4. Sao chép nội dung `firestore.rules` vào Firebase Console và Publish.
5. Đặt các file trên một web server (Firebase Hosting, Netlify, GitHub Pages…); không mở trực tiếp bằng `file://` vì JavaScript module và Firebase cần HTTP/HTTPS.

## Cách sử dụng

- Mở `admin.html`, đăng nhập quản trị và tạo nhân viên.
- Mở `index.html`, nhập mã nhân viên để nhận mã QR.
- Quản trị viên có thể sửa thông tin, khóa/mở khóa, reset thiết bị hoặc xóa nhân viên.

## Lưu ý bảo mật

Phiên bản web tĩnh này cho phép người dùng đã đăng nhập ẩn danh cập nhật hai trường `activeSession` và `lastLogin` để hỗ trợ chức năng một thiết bị. Với hệ thống kiểm soát ra/vào thật, nên chuyển thao tác tạo phiên và QR sang Cloud Functions/server riêng để kiểm tra thiết bị, ký mã QR và chống giả mạo.
