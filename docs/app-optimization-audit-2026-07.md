# 證券高業 App 全面優化與學習系統評估

日期：2026-07-10

## 1. 結論

目前 App 已具備完整題庫、離線圖片、錯題、收藏、每日計畫、隨機測驗與排行榜等功能，但學習核心仍偏向「做過題目」而不是「長期記住題目」。

最重要的產品目標應從即時答對率與累積作答數，改成：

- 首輪覆蓋率
- 到期複習完成率
- 7／14／30 天後再次答對率
- 穩定記住題數
- 逾期題數與平均逾期天數
- 真實模擬考成績

本輪已完成效能、同步與每日題列的立即改善；真正的長期記憶系統仍需新增 append-only 作答事件與每題學習狀態，再導入 Leitner／FSRS。

## 2. 本輪已實作

### 效能與載入

- 芙莉蓮動畫改為登入前預載、單一 sprite／Canvas 與 rAF 播放；循環重置以淡出／淡入隱藏跳切，離開可視區後暫停繪製，載入失敗可再次重試。
- PWA 不再 precache `public/data/backups` 與 4.31 MiB 完整題庫，production output 也不包含來源備份；正式 precache 已由約 5.13 MiB 降到 826.64 KiB。
- 7 個原本 eager 載入的路由頁面改為 lazy chunks。
- React/router 與 Supabase 拆成穩定 vendor chunks。
- 開通後首頁不再讀取 4.31 MiB 完整題庫，只使用約 9 KiB 摘要與使用者紀錄。
- Presence heartbeat 移除每次 click／keydown 的網路請求，改為節流計時與 focus／visibility 更新。
- 題目圖片只有當前題第一張為 high priority，鄰題在 idle 時低優先載入。

### 本機優先與雲端同步

- 答題、收藏、進度與 session 先寫 IndexedDB，UI 不再等待 Supabase。
- IndexedDB 已依 user id 分庫；舊版共用資料只在能安全判定唯一擁有者時遷移，多帳號狀況會隔離而不自動混入。
- 雲端寫入改為每位使用者各自的持久 outbox；新增、刪除、批次刪除與清空都可在斷線後保留，恢復連線或下次登入再送，同一題／scope 會合併為最新操作。
- 雲端匯入 30 秒內去重並共用同一個 in-flight import；有待送操作時不覆蓋本機，匯入採逐筆 transaction，避免另一分頁的新答案被整庫 clear 掉。
- entitlement 於 focus、visibility 與每兩分鐘重新驗證；短暫網路錯誤保留最後一次有效權限，只有成功取得的伺服器結果才能撤銷。

### 每日訓練正確性

- 修正「首頁顯示新題／錯題／間隔複習，但實際題列只有新題」。
- 每日 queue 現在真正包含 review、wrong、new，並採交錯順序。
- 今日剩餘與完成率會計入全部三類，並完整保存建立計畫前已完成的題目，重新載入後不會卡住或提早完成。
- 歷史答案不再讓到期複習題直接被鎖住；只有今天已完成的題目視為本次完成。
- 首頁總數、分類數與實際題列使用同一份計畫。
- 時間估算改用各類題目的 minutes-per-question，不再把一題直接當一分鐘。
- 手機三列固定控制列增加足夠底部空間，不再遮住解析。

## 3. 3526 題的建議記憶系統

題庫分布：

- 投資學：1110 題
- 財務分析：895 題
- 證券交易相關法規：813 題
- 證券交易相關實務：708 題

### 第一階段：簡化 Leitner

先建立可解釋、容易驗證的排程：

1. 新題答對：隔天複習。
2. 第二次跨日答對：3 天後。
3. 第三次：7 天後。
4. 第四次：14 天後。
5. 第五次：30 天後。
6. 答錯／不知道：本 session 隔 6–10 題再出現，訂正後仍排隔天。
7. 猜對／不確定：不升級或只延後一天。
8. 至少三次跨日答對且達 14 天間隔，才顯示「穩定記住」。

### 第二階段：FSRS

導入成熟 TypeScript FSRS 套件，不自行設計參數。答案揭露後提供：

- 再學一次
- 困難
- 正常
- 簡單

答錯自動視為「再學一次」；答對可依反應時間先選預設值，再允許使用者用「猜的／不熟」覆寫。

### 必要資料模型

```ts
type QuestionLearningState = {
  questionId: string;
  state: "new" | "learning" | "review" | "relearning" | "suspended";
  difficulty: number;
  stabilityDays: number;
  dueAt: string;
  lastReviewAt?: string;
  reps: number;
  lapses: number;
  consecutiveCorrect: number;
  lastRating?: 1 | 2 | 3 | 4;
  averageResponseMs?: number;
  algorithmVersion: number;
  contentVersion: string;
};

type AnswerAttempt = {
  id: string;
  clientEventId: string;
  sessionId: string;
  questionId: string;
  mode: string;
  selectedAnswer?: string;
  isCorrect: boolean;
  rating: 1 | 2 | 3 | 4;
  responseMs: number;
  occurredAt: string;
};
```

現有 `UserAnswer` 只保留最後一次作答，不能取代上述模型。

## 4. 建議訓練順序

### 首次診斷

- 60 題：投資、財分、交易三大考科各 20 題。
- 依章節分層抽樣，用來初始化弱點，不可因此跳過未看過題目。

### 每日 session

1. 5 題到期複習暖身。
2. 8–12 題同章新題，建立知識脈絡。
3. 插回本 session 答錯題。
4. 切換下一考科，避免長時間單一情境。
5. 最後 5–10 題跨章混合或易混淆對比。

題列應交錯，而不是先做完全部錯題、再做全部新題。

### 每週節奏

- 5 天：新題＋到期複習。
- 1 天：50 題單科測驗，完成前不顯示答案。
- 1 天：清逾期、易混題或主動休息。

### 考前階段

- 45 天以上：新題 50–60%，其餘為到期與錯題。
- 15–45 天：新題 30–40%，增加混合測驗。
- 最後 14 天：到期、易錯、相似題與完整模考為主。

每日容量需依個人最近 30–50 題的第 70 百分位作答時間估算；若期限所需題量超過容量，介面應讓使用者選擇增加時間、調整休息日、優先考試權重或接受較晚完成，不可只塞入不可能完成的題數。

## 5. UX／UI 資訊架構

### 首頁建議順序

1. 今日任務：到期、錯題、新題、預估時間與繼續按鈕。
2. 真實學習狀態：首輪覆蓋、學習中、穩定記住、逾期。
3. 三大考科：熟練度、到期數、最弱章節與建議下一步。
4. 題庫章節。
5. 單科測驗、易混題、收藏、排行榜等工具。

目前的「進度」其實只是曾答過，應改名「首輪覆蓋率」。

芙莉蓮建議在今日任務 hero 右側放小型版本，底部保留完整版本；首次考試日期設定改為可跳過 onboarding sheet，日期不可預設今天。

### 手機導航

- 今日
- 題庫
- 進度
- 我的

答題頁底部控制應依狀態切換：

- 作答前：1、2、3、4、不知道。
- 作答後：熟悉度＋下一題。
- 上一題與跳題移入次要選單；daily／wrong 模式不必顯示跳題。

### 答題體驗

- 學習模式預設不顯示計時器。
- 加入「不知道」，降低亂猜造成的假熟練。
- 學習模式不要在 650ms 後自動跳題，讓使用者閱讀解析。
- 顯示「新題／重新學習／逾期幾天／第幾次複習」。
- 答題後顯示下次複習日期。
- 結果頁改顯示清除多少到期、新學多少、仍需重學多少與明日預估。

現有相似題資料已有 180 組、740 個題目成員，建議改為隱藏答案的「易混淆對比訓練」，而不是直接並排顯示答案。

目前的「模擬考」實際是單一題庫隨機測驗且立即批改，應先改名「單科隨機測驗」。真正模考需 150 題／210 分鐘、延後批改、答題卡、標記待檢與交卷確認。

## 6. 管理員後台 P0

### 權限與安全

1. `create_activation_code` 的 SECURITY DEFINER function 曾授權 `authenticated`，一般登入者可能自行產生啟用碼。需 revoke public／anon／authenticated，只授權 service_role。
2. 排行榜 stats 允許本人直寫，計分與時間 RPC 可重放；需改用不可重放的 answer event 聚合。
3. 完整題庫與答案位於 public 靜態路徑，entitlement 只有 UI 門禁。若要保護內容，需 private storage／受驗證 API／短效 URL；完整離線則必須接受已下載內容無法真正收回。
4. 管理員目前以 Email 判斷，應改 user_id RBAC＋AAL2/MFA，角色至少分 owner、security_admin、support、content_editor、content_approver、analyst。
5. 管理操作缺少 append-only audit log、reason、before／after、request id 與 idempotency key。

### 題庫治理

題庫需由直接覆寫 JSON 改成：

```text
Draft → 自動驗證 → 人工校對 → 第二人核准 → immutable release
      → 原子切換 manifest → 監測 → 一鍵 rollback
```

新增 question release、question version、question report、publish job。法規題加入 effective date、review due date 與 retired at。

### 後台 IA

- 總覽：開通率、DAU／WAU、今日作答、同步失敗、內容告警。
- 使用者：伺服器端搜尋、cursor pagination、filter、匯出。
- 使用者詳情：權限、學習概況、登入／裝置、timeline。
- 啟用碼：到期、停用、使用明細、campaign；只保存 hash，明文只顯示一次。
- 學習分析：章節 mastery、卡關題、放棄率、異常作答。
- 題庫 QA：勘誤、版本 diff、發布與 rollback。
- 排行榜：異常偵測、排除／恢復、由事件重建。
- Audit：actor／action／target／date filter。
- System：migration、release、API latency、同步 backlog、備份復原測試。

危險操作應要求 reason、顯示 before／after，並輸入目標 Email 確認；hard delete 改為停用、延遲刪除、匿名化與法規刪除分流。

## 7. 建議落地順序

### 下一個工程階段

1. 新增 AnswerAttempt＋QuestionLearningState 與 Supabase migration。
2. 上線簡化 Leitner、同 session 錯題重現與「不知道／猜的」。
3. 分離 sessionAnswers 與永久歷史答案。
4. 首頁四態 mastery 與到期工作量。
5. 相似題主動對比訓練。

### 安全與營運階段

1. 啟用碼與排行榜權限止血。
2. user_id RBAC＋MFA＋admin audit。
3. 題庫 immutable release、雙人核准與 rollback。
4. 私有題庫或明確制定離線 entitlement lease 策略。
5. 真正三科完整模考與可信 server-side event statistics。
