# 每日 PWA 推播提醒設定

本版已加入：

- 設定頁「每日練習提醒」開關
- 預設提醒時間 21:00
- 使用者可自行調整提醒時間，時間以 15 分鐘為單位
- 通知預覽按鈕
- PWA service worker push / notificationclick handler
- `/api/push-public-key` function
- `/api/push-subscription` function
- `send-daily-reminders` scheduled function，每 15 分鐘檢查一次各使用者的本地提醒時間

## 1. 產生 VAPID keys

```bash
npm install
npm run push:keys
```

會得到 Public Key 與 Private Key。

## 2. 在 Netlify 設定環境變數

Netlify Project Settings → Environment variables 新增：

```text
VAPID_PUBLIC_KEY=<Public Key>
VAPID_PRIVATE_KEY=<Private Key>
VAPID_SUBJECT=mailto:true.alpha0902@gmail.com
```

## 3. 部署方式

因為這版含 Netlify Functions，不要只手動拖拉 `dist`。請在專案根目錄部署：

```bash
npm install
npx netlify-cli deploy --prod --build
```

或推到 GitHub 後讓 Netlify 自動 build。

## 4. 使用者端限制

- 使用者必須允許通知。
- iPhone / iPad 需要先把 PWA 加入主畫面，再從 App 內開啟提醒。
- 通知點擊會開啟 `/image-quiz/daily`。
- 排程函式每 15 分鐘檢查一次；設定頁時間欄位已限制為 15 分鐘單位，預設是 21:00。
