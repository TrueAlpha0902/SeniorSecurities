# SeniorSecurities Current State

更新日期：2026-08-26
目前版本：**v93 啟用碼無連字號顯示**

## 2026-08-26 啟用碼無連字號顯示

- 管理後台新建立的啟用碼會以純英數大寫格式顯示與複製，不再每四碼插入 `-`。
- 建立與兌換欄位的範例同步改為無連字號格式，且不會把正式啟用碼硬編碼到前端。
- 資料庫仍以移除非英數字元後的大寫值計算雜湊，因此舊式含連字號與新式無連字號輸入完全相容。
- 正式啟用碼已用回滾交易驗證：交易內可增加使用次數並授予對應題庫權限，回滾後未留下使用次數或會員權限變更。
- 不需要 Supabase migration，也不變更既有啟用碼資料。

## 2026-08-26 管理後台權限開通修復

- 「開通證券高業」與「開通初階外匯」共用的確認視窗雖已 portal 到 `document.body`，其 `.v93-confirm-*` 樣式卻仍只存在於未載入的舊版 `theme-v93.css`，導致視窗以一般文件流落在管理員抽屜下方、使用者看不到「確認執行」，後端也不會收到開通請求。
- 將確認視窗必要樣式移入現行唯一載入的 `theme-current.css`；桌面與手機皆固定覆蓋 viewport，層級高於管理員抽屜，並保留高度限制、捲動與 reduced-motion 行為。
- 管理後台契約測試同時鎖定現行主題載入、portal 版面樣式，以及兩種 `examId` 從按鈕到 `/api/admin/action` POST 的傳遞。
- 新增桌面與手機 Playwright 版面回歸測試，驗證 portal 直屬 `body`、`position: fixed`、完整 viewport 覆蓋、正確層級與確認按鈕可見；另以真實模擬考流程開啟同一個共用 React 元件並確認可取消。
- Supabase schema、migration、題庫內容與既有會員權限均未變更。

## v91 圖像手寫介面與題庫級考試計畫

- 新增 `public/handwritten-ui` 圖像資產庫，共94個透明PNG、約6.40 MiB；包含固定介面文字、證券／外匯功能圖示、首頁插圖、空狀態與正確／錯誤狀態。
- 新增 `HandwrittenAsset` 共用元件；圖片載入失敗時自動回退為真實文字，非裝飾圖片保留螢幕閱讀器可讀文字。
- 桌面側欄、手機頂部品牌、手機底部導覽、兩套題庫首頁、主要練習操作、題目控制與答案狀態已改用生成圖像。
- 題幹、選項、解析、日期、題號、百分比與使用者資料維持真正文字，保留搜尋、複製、縮放、響應式排版及可及性。
- 考試計畫正式收斂為兩份：證券高業一份、初階外匯一份；同一題庫內所有考科共用考試日期、每日時間與備考強度。
- 證券高業考科頁與初階外匯科目頁不再提供獨立考試計畫入口；每日題量仍依各考科剩餘題數、錯題與複習需求自動分配。
- 舊分科計畫只保留唯讀遷移相容，升級後寫入題庫級 v4 儲存鍵；不修改題目、答案、解析、會員權限或 Supabase schema。
- 一般練習不顯示計時器；模擬考保留計時。手機上一題／下一題維持正常頁面流與 safe-area 間距。
- 已完成149個TS／TSX語法轉譯、12個CSS檔案括號檢查、v83／v84／v86／v90／v91／管理後台／完整性靜態契約及CSS預算。
- 本容器無法從套件來源完整安裝 `node_modules`，因此正式 TypeScript、API TypeScript、ESLint、Production build、PWA、public-boundary及bundle gate由Windows更新器強制執行；任一失敗立即停止。
- v91尚未部署Vercel，也沒有修改Supabase。

## v90 核准紙張模板

- 依使用者指定模板，全面改為暖米灰紙張、繁體中文楷體、細線框、低飽和海軍藍／鼠尾草綠及手繪 SVG 插圖。
- 桌面採紙張式左側導覽與圖釘今日目標；手機非作答頁保留五項導覽，作答頁只顯示題目內控制。
- 證券與外匯首頁共用相同模板：主視覺、三張概況卡、六項捷徑、考科路徑、學習摘要及考試資訊。
- 證券高業維持三考科；初階外匯維持兩科與第23至47屆。每張證照各自共用一個考試日期。
- 題目、選項、解析、收藏星號及上一題／題目列表／下一題已套用同一紙張式作答模板。
- 移除舊 v88／v89 主題檔，v90 為唯一版本主題層。
- 尚未部署 Vercel，沒有新增 Supabase migration，也不改寫題庫或學習紀錄。
- 規格見 `docs/V90_TEMPLATE_SPEC.md`，審查見 `docs/RELEASE_REVIEW_v90.md`。

## v89 草稿線條主題

- 依使用者核准參考圖，全面改為暖白紙張、繁體中文手寫楷體、細鉛筆線、低飽和海軍藍／墨綠與輕量斜線底紋。
- 證券高業使用 K 線與走勢插圖；初階外匯使用地球、匯兌箭頭及貨幣符號插圖；金融證照、證券、外匯各有名稱相關手繪 Logo。
- 桌面側欄加入圖釘式今日學習目標便條，今日題數依目前題庫自動更新。
- 證券與外匯首頁共用同一資訊層級；每張證照只保留一份共同考試日期。
- 題目選項、解析、設定、帳號、搜尋、管理後台及 Recovery 均套用同一紙張／線稿規則。
- 一般練習不顯示計時器；模擬考保留計時器；上一題／下一題維持正常文件流。
- 不封裝字型檔；使用 `Senior Sketch` 本機字型別名與繁體中文文楷／楷體後備。
- v89 尚未部署，沒有新增 Supabase migration，也不改寫題目、答案、解析、權限或學習紀錄。
- 詳細規格見 `docs/V89_THEME_SPEC.md`，發布審查見 `docs/RELEASE_REVIEW_v89.md`。

## v88 低飽和專注學習主題

- 依使用者確認的設計方向，將整個 App 收斂為暖白／霧灰背景、低飽和藍灰與鼠尾草綠主色、細邊框、柔和陰影及高可讀性深色文字。
- 桌面版採固定左側導覽與精簡頁面工具列；證券高業、初階外匯及中性頁面會依路由顯示對應中文品牌與名稱相關 Logo。
- 手機版採精簡頂部列與非作答頁五項底部導覽；作答頁不顯示全域底部導覽，上一題／下一題維持正常頁面流，避免遮住選項或解析。
- 證券高業與初階外匯首頁共用相同資訊架構：低飽和主視覺、整體進度、共同考試日期、今日建議、學習捷徑及考科路徑；初階外匯另外保留第23至47屆緊湊入口。
- 每張證照只保留一份共同考試計畫；證券高業三考科共用日期，初階外匯兩科共用日期。
- 題目、選項、解析、章節、證照入口、設定、會員中心、搜尋、相似題、排行榜、管理後台、Recovery 與更新提示均套用同一組 surface、字級、間距與狀態規則。
- 一般練習不顯示計時器，僅模擬考顯示計時；作答結果仍保留整張深紅／深綠回饋與「錯誤／正確」文字標示。
- 移除舊 v87 主題檔，v88 成為唯一版本主題層；CSS 維護靜態檢查為11個檔案、12,100行、322個 `!important`，仍在既有預算內。
- 已完成7個核心 TS／TSX 檔案語法轉譯、v88主題契約、CSS括號及維護預算靜態檢查、桌面與手機 CSS 實際渲染預覽。
- 本容器的內部 npm registry 持續回傳 HTTP 503，無法在此重建完整 `node_modules`；Windows 更新器會強制執行 TypeScript、API TypeScript、ESLint、題庫契約、Production build、公開內容邊界與 Bundle 預算，任一失敗即停止。
- v88 尚未部署 Vercel，沒有新增 Supabase migration，也不會改寫題目、答案、解析、權限或學習紀錄。
- 詳細審查見 `docs/RELEASE_REVIEW_v88.md`，驗證記錄見 `docs/V88_VERIFICATION_RESULTS.md`。

## v87.3 依題庫名稱切換 Logo

- 移除全域共用的六角形圖示。
- 證券高業改用 K 線／證券走勢圖示。
- 初階外匯改用雙向匯兌箭頭圖示。
- 金融證照中性頁面改用證照勾選圖示。
- 桌面左上品牌與行動版功能選單共用同一套動態 Logo。
- 中文名稱、題庫內容、權限、路由、Supabase 與 Vercel Functions 均不變。

## v87.2 全中文題庫品牌修正

- 左上品牌與行動版功能選單不再顯示英文名稱。
- 證券高業頁面顯示「證券高業／測驗題庫」。
- 初階外匯頁面顯示「初階外匯／測驗題庫」。
- 證照入口、搜尋、會員與管理等中性頁面顯示「金融證照／學習中心」。
- 品牌仍依目前路由自動切換，但不再自行使用英文翻譯。
- 中文品牌字級、字距與次要文字顏色已重新調整，維持 v87 高級極簡導覽比例。
- 不變更題庫內容、作答紀錄、權限、路由、Supabase 或 Vercel Functions。

## v87 高級極簡專業主題與全 App 統一體驗

- 全 App 改採同一套高級、簡約、專業的視覺系統：暖白／霧灰頁面、純白 surface、細灰框、極輕陰影與深色文字；不使用裝飾性漸層。
- 證券高業以深海軍藍為主色，初階外匯以墨綠為主色；兩者只在品牌重點色不同，資訊層級、卡片、按鈕、進度條與操作位置完全一致。
- 桌面版新增依題庫切換的全中文品牌導覽列：證券高業顯示「證券高業／測驗題庫」，初階外匯顯示「初階外匯／測驗題庫」，中性頁面顯示「金融證照／學習中心」；並統一首頁、題庫、錯題本、收藏夾、模擬考、設定、搜尋、計算機與帳號入口。
- 手機版使用緊湊頂部列；非作答頁提供固定五項底部導覽，作答頁完全隱藏底部導覽，避免遮住題目、選項或解析。
- 兩套題庫首頁改用共同元件：題庫名稱與整體進度、共同考試日期、今日建議、快速開始、學習路徑；初階外匯額外保留第23至47屆的緊湊屆次入口。
- 考試計畫改為每張證照一份：證券高業三考科共用一個日期與每日時間；初階外匯兩科共用另一個日期與每日時間。舊的分科設定會依題庫安全合併遷移。
- 證券高業學員端維持三個正式考科：投資學、財務分析、證券相關法規與實務；原始法規／實務 bank ID 與題目紀錄仍相容。
- 題目頁、解析、紅／綠答案回饋、題號列、收藏、上一題／下一題已依同一套 surface 與字級重整；一般練習不顯示計時器，只有模擬考保留計時。
- 設定、會員中心、搜尋、證照入口、章節頁、相似題、排行榜、管理後台、Recovery 與版本更新提示均套用同一主題。
- 手機作答導覽維持正常頁面流，位於最後一個選項與解析之後；不使用 fixed 或 sticky，不會遮住內容。
- 實際 Chromium 版面檢查涵蓋9類頁面、桌面與390×844手機，共18項；橫向溢出0、作答頁底部導覽誤顯示0、上一題／下一題早於最後選項0。
- CSS維護檢查：11個檔案、12,307行、324個 `!important`，在v87調整後預算內。
- 已通過v86統一體驗契約、v87主題契約、TS／TSX語法檢查、Python語法檢查、CSS預算及離線實際元件版面驗證。
- 本容器無法從內部npm registry完整安裝 `node_modules`（registry回傳503），因此完整TypeScript、API TypeScript、ESLint、Production build、public-boundary及bundle gate由Windows更新器強制執行；任一失敗即停止。
- 詳細審查見 `docs/RELEASE_REVIEW_v87.md`，驗證結果見 `docs/V87_VERIFICATION_RESULTS.md`。
- v87尚未部署正式網站，也沒有新增Supabase migration。

## v86 三考科、分科考試計畫與手機作答一致化

- 證券高業學員入口收斂為三個正式考科：投資學、財務分析、證券相關法規與實務。
- 「證券交易相關法規」與「證券交易相關實務」仍保留為內部來源 bank，但學員端只顯示一張「證券相關法規與實務」卡片、一份考試計畫與一個章節入口。
- 考試計畫改為五個正式考科各自設定：三個證券考科與兩個初階外匯考科。舊版法規／實務分開的設定會合併遷移，不遺失既有日期。
- 證券與初階外匯首頁採共同的 Hero、進度、今日建議、考科卡片與操作層級；證照選擇頁移除跨題庫總題數與正確率。
- 一般練習、錯題、收藏、章節、全題庫、每日練習與外匯隨機練習均不顯示計時器；只有證券模擬考與外匯模擬考顯示計時。
- 手機上一題／下一題已退出 fixed 浮動層，改在題目、選項與解析之後的頁面最底部；兩個按鈕等寬並保留 safe-area 間距。
- 證券與外匯一般練習共用白底題目、全形標點、整卡紅／綠答案回饋、中性解析與相同底部導覽。
- 手機布局驗證涵蓋 360×800、390×844、412×915、430×932；16 組檢查均無橫向溢出，且導覽列位於最後選項／解析之後。
- Vercel Functions 維持 8／12；沒有新增 Supabase migration 或 npm 套件。
- 本容器完成 frontend typecheck、143 個 TS／TSX 語法轉譯、題庫／全形標點／相似題／CSS／Function／v83／v84／v86 契約。由於容器 npm 套件安裝不完整且 registry 無法解析，完整 API typecheck、ESLint、Production build、public-boundary、bundle 與 URL 式 E2E 由 Windows 更新器強制執行；任一失敗即停止。
- 詳細審查見 `docs/RELEASE_REVIEW_v86.md`，驗證結果見 `docs/V86_VERIFICATION_RESULTS.md`。
- v86 尚未部署正式網站。

## v85.2 選項文字標記與融合式計時器

- 答題選項不再顯示勾號或叉號，右側改顯示「正確」或「錯誤」。
- 選項編號改為純文字，不使用圓形、膠囊或外框裝飾。
- 保留整張深綠／深紅答案回饋，解析維持白底。
- 計時器改為與題號列融合的透明資訊列，暫停控制不再是獨立白色方塊。
- 證券高業、初階外匯及相似題套用同一規則。
- CSS 現況：10 個檔案、9,737 行、212 個 `!important`。
- 完成 TSX 語法轉譯及靜態契約；本容器 npm registry 暫時回傳 503，完整 npm build 應由更新器在使用者 Windows 環境執行。
- 詳細審查見 `docs/RELEASE_REVIEW_v85_2.md`，驗證見 `docs/V85_2_VERIFICATION_RESULTS.md`。
- v85.2 尚未部署正式網站。

## v85.1 單一正解模式與全紅／全綠回饋

- 正解模式改為一個全域開關，證券高業與初階外匯一般練習共用，預設關閉；正式模擬考不受影響。
- 設定分類由一般／證券高業／初階外匯／資料管理收斂為一般／證券高業／資料管理；初階外匯不再保留只有一個開關的獨立分頁。
- 舊的分證照與六個分題庫正解設定在升級後一律安全重設為關閉。
- 答對選項使用整張深綠底白字與勾號；答錯選項使用整張深紅底白字與叉號，選錯時同步顯示正確選項。
- 證券、外匯與相似題共用相同回饋規則；不顯示重複的答案摘要卡。
- Vercel Functions 維持 8／12；Production build、公開內容邊界與 Bundle budget 通過。
- 詳細審查見 `docs/RELEASE_REVIEW_v85_1.md`，驗證見 `docs/V85_1_VERIFICATION_RESULTS.md`。
- v85.1 尚未部署正式網站。


## v85 高精度學習回饋與分題庫設定

- 移除作答後重複的「答對／答錯、你的答案、正確答案」摘要，改由選項的紅綠邊框、圖示與左側強調線直接回饋。
- 題幹、選項、解析及表格採共用全形標點顯示層；全量驗證 40,656 個學員顯示欄位，不改動原始題庫。
- 相似題改為 19 組／38 題的逐組人工核對高精度題組；每組固定兩題並明列真正改變答案的條件。
- 正解模式拆為 4 個證券題庫及 2 個外匯科目，全部預設關閉，模擬考不受影響。
- 資料重設改為選題庫、選清除程度、顯示影響數量與最後確認；建議層級會保留收藏。
- 初階外匯錯題清單與歷史作答分離，清空錯題不再刪除正確率統計。
- 證券首頁練習工具移除「搜尋題目」及「今日錯題」重複入口。
- Vercel Functions 維持 8／12；Production build、公開內容邊界及 Bundle budget 通過。
- 完整審查見 `docs/RELEASE_REVIEW_v85.md`，驗證見 `docs/V85_VERIFICATION_RESULTS.md`。
- v85 尚未部署正式網站。

## v83.1 公開內容邊界與發布硬化

- 免費試用10題改為純文字資料，不再依賴已從Production移除的掃描頁。
- Production建置進一步移除舊版示範題庫 `data/banks.json` 與 `data/banks/**`。
- 新增build後公開內容邊界測試，驗證無掃描頁、無付費章節shards、無舊示範題庫。
- 修正正式站健康檢查：私有章節shard必須不可公開，未登入題庫API必須回傳401或403。
- 更新鎖定檔中的 `brace-expansion` 至已修補版本，完整npm audit為0項弱點。
- v83.1不新增Supabase migration；正式發布前必須在Windows或正常CI環境通過Playwright E2E。
- 完整審查見 `docs/RELEASE_REVIEW_v83_1.md`，驗證結果見 `docs/V83_1_VERIFICATION_RESULTS.md`。

## v83 產品與技術收斂版

- 證券高業與初階外匯改由統一受保護的 `/api/questions` 提供題庫、搜尋、覆寫及模擬考生命週期。
- 兩套模擬考開始與續考時不回傳答案、特殊計分規則或解析；交卷後由伺服器驗證登入、題庫權限、使用者、內容版本及HMAC簽章再評分。
- 證券完整題庫不再從公開 `public/data/question-shards` 傳送；production build會移除 `dist/data/question-shards`。
- 學員Production不再包含818張來源掃描，`dist/pdf-pages`不存在；文字離線包改由登入API按章節取得。
- Vercel公開Functions由11支降至9支，保留3支Hobby方案餘量。
- 正式啟用跨證照伺服器搜尋；搜尋結果不回傳答案及完整解析。
- 全域頁首、證照入口、證券首頁、章節清單、外匯歷屆篩選、設定與會員中心已依學習任務重新整理。
- 初階外匯回答與收藏已接入共用雲端紀錄；設定改為一般／證券／外匯／資料管理四區。
- 移除舊 `QuestionsPage`、`QuizPage`、`ResultPage`、`ReviewPage`及舊資料層，舊網址改為重新導向。
- Production build、TypeScript、API TypeScript、ESLint、CSS budget、題庫與模擬考契約均通過。完整審查見 `docs/RELEASE_REVIEW_v83.md`。
- 此版本尚未部署正式網站。

## v82.2 中性白底題目與解析、移除原圖功能

- 證券高業學員端已移除所有「原圖／查看原始題圖／查看原始解析圖」按鈕、行內展開區與對話框。
- 一般練習、模擬測驗、正解練習及相似題目均採純文字呈現；文字異常時顯示中性提示，不對學員回退顯示掃描圖。
- 主要題目區為純白底、細灰框、低陰影與深色文字；移除主色左標線、彩色漸層和高彩度題目標籤。
- 解析區同步使用純白底、細灰框與中性分隔線；題目與解析的視覺層級清楚但不以明顯色塊區分。
- 保留上一題、下一題、跳題、答題卡及自動下一題後回到題目起始位置的閱讀導引。
- 3,526題題文、四選項、答案與解析均未修改；初階外匯3,250題、權限、資料庫、API及11支Vercel Functions亦未變更。
- 驗證基準：`npm run test:securities-text-contracts`、`npm run typecheck`、`npm run typecheck:api`、`npm run lint`、`npm run test:css`、`npm run build`及`npm run test:bundle`。
- 發布前審查見 `docs/RELEASE_REVIEW_v82_2.md`。

## v82 初階外匯完整封存與部署修正

- 初階外匯擴充為第23至47屆，共25屆、3,250題；國外匯兌業務1,250題，進出口外匯業務2,000題。
- 75份來源PDF均保存於 `source-materials/foreign-exchange-official-pdfs`；題幹與四個選項共16,250個欄位由原生PDF文字層取得，Poppler、PyMuPDF與pypdf交叉核對。
- 3,250筆官方計分資料完整匯入；6題特殊計分題支援複數答案或凡有作答給分。
- 第45至47屆390題沿用詳細解析；第23至44屆2,860題採官方答案對照式保守解析，不虛構來源未提供的法規理由。
- 初階外匯介面、錯題、收藏、隨機練習、逐屆練習及模擬考均支援第23至47屆；模擬考交卷前仍不顯示答案與解析。
- v81的Vercel部署失敗原因是13個公開API entrypoints超過Hobby方案12個Functions上限。v82將登入稽核併入 `client-error`、管理健康檢查併入 `admin/action`，降至11個Functions並保留1個餘量。
- `npm run check:vercel-functions` 已加入prebuild與verify，避免同類部署問題再次發生。
- 完整資料、權限、TypeScript、ESLint、既有契約、production build、PWA與bundle budget均通過。
- 完整發布前審查見 `docs/RELEASE_REVIEW_v82.md`。v82尚未部署正式網站。

---

## v81 證券高業全文字化

- 證券高業3,526題已全部建立題幹、四個選項與解析文字；一般練習、模擬測驗、正解練習、相似題目及搜尋均採文字優先。
- 唯一文字來源為專案內818張 `public/pdf-pages/**/*.webp` 掃描頁；未使用JY筆記、網路題庫、外部PDF或其他教材補字。
- 共有21,156個學員文字欄位：7,052個題幹／解析欄位與14,104個選項欄位；空白題文、缺少選項、空白解析、重複ID及無效答案均為0。
- 3,114題由多引擎與多種影像前處理的一致結果產生；412題依原始掃描建立人工覆寫，其中187題為跨頁、公式、表格、上下標、法規條號或多引擎差異等高風險記錄。
- 直接視覺抽查152題，涵蓋40／40章；另完成英文術語空格、計算式、希臘字母、表格與頁碼殘留專項掃描核對。
- 最終異常稽核為0；14題Markdown表格皆通過欄數驗證。唯一1題重複選項已確認是原掃描內容，不自行改題。
- 所有818張來源掃描均以SHA-256與檔案大小鎖定；每題另保存題圖／解析裁切內容雜湊。來源掃描或裁切若變動，驗證會失敗或回退原圖。
- 每題保留「查看原始題圖／查看原始解析圖」，但一般使用者不會看到OCR引擎、信心值、候選文字、裁切座標或稽核欄位。
- OCR候選資料位於內部建置來源並由 `.vercelignore` 排除；production輸出只包含學員所需的章節shards，不公開中間候選或模型信心。
- 表格題轉為可捲動HTML表格；模擬測驗在交卷前不顯示正解、正誤樣式或解析。
- 完整QA與正確性界線記錄於 `docs/SECURITIES_TEXT_QA.md`。本版未宣稱21,156個欄位已完成雙人逐字雙錄。
- 最終文字SHA-256為 `c62c12ccecb071fb2bc870f4b8b097f96b1718268bfe9cdcd5de11acb0e8e7b7`；題庫release為 `c2c5cc72ed708012`。
- v81證券文字化已完成發布前封裝與預覽，**尚未部署正式網站**。

## v81 驗證基準

- `npm run validate:securities-text`：3,526題、21,156個學員文字欄位、187題高風險覆寫、152題視覺抽查、818張來源掃描通過。
- `npm run audit:securities-text-final`：3,526題、40章、14題表格、0項最終異常，且 `forbiddenExternalSourcesUsed: false`。
- `npm run test:securities-text-contracts`：題庫產生、裁切失效、一般練習、正解練習、相似題目、搜尋與原圖fallback通過。
- `npm run generate:shards`／`npm run generate:plan-index`：40個章節shards、3,526題與每日計畫索引重新產生。
- TypeScript、API TypeScript、ESLint、CSS budget、既有功能契約、production build、PWA及bundle budget均分別通過。
- `npm run verify` 外層命令在最後build階段達到執行環境時間限制；同一build與bundle檢查獨立重跑通過。
- 容器Chromium受 `URLBlocklist: ["*"]` 政策限制，未執行URL導覽式E2E；預覽由實際元件、正式CSS及正式資料離線掛載渲染。

---

## v80 初階外匯整合

- App 已由單一證券高業題庫擴充為「證券高業」與「初階外匯」兩套題庫入口。
- `user_exam_entitlements` 以 `(user_id, exam_id)` 為複合主鍵；兩套題庫可各自開通、撤銷及設定到期日。
- 初階外匯收錄第45、46、47屆，共390題：國外匯兌業務150題、進出口外匯業務240題。
- 題目不是 OCR 產物；以官方 PDF 內嵌 Unicode 文字層為準，使用 `pdftotext -raw` 擷取，再由 PyMuPDF 與 pypdf 逐欄比對。390題的題幹與四個選項共1,950個文字欄位全部通過一致性檢查。顯示時只正規化PDF欄寬造成的換行與假空白，不改寫題目字元、標點、數字或英文字母。
- 390個答案均由官方答案表解析，並由三套 PDF 引擎交叉核對。
- 每題皆有一則獨立解析；390則內容已逐題對照題幹、選項與官方答案檢視，並通過非空、唯一性、占位文字及內部說明洩漏檢查。解析為本專案依官方答案編寫，不宣稱是金融研訓院官方解析。
- 學員介面只保留題目、選項、答案、解析、屆次、科目、作答及計時資訊；來源檔名、PDF頁碼、SHA-256、OCR／AI處理說明及內部審核欄位均不對學員顯示。
- 模擬測驗在交卷前不顯示答案、解析、答對數或答錯數，只顯示已作答與未作答。
- 初階外匯題庫存放於 server-only data，透過需登入且需具初階外匯 entitlement 的 API 傳送；前端 projection 不包含來源頁碼、雜湊與審核欄位。
- 新增 migration `supabase/migrations/20260719120000_exam_scoped_entitlements_v80.sql`；尚未套用到正式 Supabase，也尚未部署至 Vercel。
- 修正原專案三個以 Big5 位元組命名的章節 JSON，改為正常 UTF-8 檔名，避免 Vite production build 在 Linux 失敗。
- 自動檢查可以證明 App 文字與官方 PDF 的文字層一致；尚未完成兩位人工逐字雙重輸入校對，因此不得表述為「絕對零誤差的人工作業證明」。

## v80 驗證基準

- `npm run audit:fx-source`：390題、1,950個文字欄位、390則解析通過。
- `npm run validate:fx`：題數、官方答案、個別解析、來源雜湊與資料 schema 通過。
- `npm run test:fx-contracts`：分題庫權限、受保護 API、學員介面精簡、解析顯示及模擬測驗防洩漏通過。
- TypeScript、API TypeScript、ESLint、CSS budget、管理後台契約、完整性契約、production build 及 bundle budget均分別通過。
- 本工作容器的 Chromium 受系統 `URLBlocklist` 政策限制，無法以一般 HTTP 導覽執行 Playwright；預覽截圖改以實際 React 元件、正式 CSS、正式390題資料及離線 API stub 渲染，並未另畫靜態設計稿。

---

## v79.22 模擬考舊 Session 延後批改保護

- 「交卷後統一批改」勾選狀態現在會覆蓋尚未交卷的舊 `immediate` session，避免續答時立即洩漏正解。
- 未交卷測驗頁以「目前偏好為 deferred 或 session 已是 deferred」作為 fail-closed 條件；點選答案只保留已選擇狀態。
- 勾選延後批改時會自動關閉正解模式，並把所有未完成舊 session 升級為 `deferred`。
- 新增舊 immediate session + 已勾選延後批改的回歸測試。

## v79.21 模擬考發佈驗證修正
- 模擬考 E2E 不再使用 `setChecked()` 操作刻意隱藏的原生 checkbox，而是點擊畫面上可見的 switch。
- v79.20 功能修正不變：勾選交卷後統一批改會自動關閉正解模式；交卷前不顯示正解、正誤樣式與解析。
- Windows 發佈測試以單一 Playwright worker 執行。

## v79.20 模擬考延後批改與正解模式互斥修正

- 勾選「交卷後統一批改」會立即關閉全域正解模式，並以 `deferred` 建立新模擬考；不再因正解模式殘留而改回即時顯示。
- 正解模式與延後批改在持久設定層互斥，跨分頁、登入 scope 與設定事件皆讀取一致的最終值。
- deferred session 進入測驗後會再次 fail closed：任何舊設定、跨分頁變更或競態都不能在交卷前顯示正解、正誤樣式或解析。
- 設定介面會同步反映自動關閉狀態；模擬考開關保持可操作並說明互斥行為。
- 無 Supabase migration、無新增 npm 套件。

## v79.19 模擬考統一批改模式鎖定修正

- 建立模擬考時不再只依賴可能過期的 React state；按下開始後會重新讀取目前帳號的持久設定，將 `immediate`／`deferred` 寫入 session，並在進入測驗前回讀驗證。
- 模擬考頁以 session 的批改模式為唯一權威，首屏可用 navigation state 補接；缺值、非法值或舊版 session 一律 fail closed，交卷前不揭露正解與解析。
- 使用者儲存 scope 切換時會同步刷新模擬考開關，避免登入／切換帳號後沿用 guest 或前一帳號狀態。
- 新增批改模式持久化、fallback、fail-closed 與 UI data contract 測試；Playwright 流程加強驗證 deferred 模式沒有答案面板、沒有正解／答錯樣式，只有「已選擇」。
- 無 Supabase migration、無新增 npm 套件。

## v79.18 模擬考續考、改選與交卷一致性

- 模擬考只以 `finishedAt` 判定已交卷；即使所有題目都已選完，只要尚未明確交卷，紀錄仍顯示「未完成」與「繼續測驗」，並保留題號、答案及待檢標記。
- 未勾選「交卷後統一批改」時，選答後立即顯示正解與解析；勾選時則到交卷前都隱藏正解、解析與紀錄卡成績。兩種模式在交卷前都可改選，交卷後才鎖定。
- 模擬考 provisional answers 不再提前寫入 FSRS、錯題與排行榜；明確交卷後才以最後答案一次寫入。舊版未完成 session 改選時只 reconcile 最後的 user answer／錯題，不重複新增 learning 或 leaderboard attempt。
- `imageQuizSessions` 的答案、標記、暫存、交卷與刪除改為 per-session serialization，並在 `imageQuizSessions + syncIntents` 單一 IndexedDB transaction 原子合併；快速切題、交卷或刪除不再互相覆蓋。
- learning event 使用持久化 RFC 4122 UUID；提交期間鎖定切題與離開，已提交但尚待整理的紀錄會在模擬考首頁自動補寫，完成前也不能被刪除。
- 題庫共 3,526 題；已人工覆核手機分段 9 題，尚餘 3,517 題（若以題目／解析欄位計為 7,037 欄）待彙整／逐欄覆核。OCR 仍只作候選分析，沒有直接取代正式截圖。
- `npm run verify` 與完整 `npm run test:e2e` 通過；E2E 為 19 passed、9 device-conditional skipped，並包含真實 route 的 immediate／deferred、改選、離開續考與交卷重載流程。
- 無 Supabase migration、無新增 npm 套件。

## v79.17 手機圖片題閱讀與裁切完整性

- 圖片測驗在 `600px` 以下採手機專用排版：題目以人工視覺覆核的橫列分段等寬呈現、答案改為 2 × 2、操作列固定於底部；`601px` 以上的平板與桌面維持原排版。
- 首批已覆核 9 題、15 個題目／解析欄位，共 64 個 mobile segments；表格、公式或無安全切點的內容不會自動套用，保留原圖並支援觸控、鍵盤水平瀏覽。
- mobile segments 只能來自 bundled release，並以來源圖片、分段座標、候選報告與 reviewer approval 的 SHA-256 證據鏈驗證；遠端 override 與管理端 payload 不得自行標記為已覆核。
- 修正 6 個高信心既有裁切問題：移除頁碼／空白尾端／空白接縫，並補回遺漏的三角形圖示；手機與平板讀取相同修正版來源裁切。
- OCR 初評確認簡單表格的數字與儲存格關係可重建，但繁體字形與公式仍會誤辨；因此 OCR 文字只供候選分析，沒有取代正式題庫原圖或保存為已校對內容。
- 全題庫 dry-run：7,052 個題目／解析欄位中 4,794 個可形成候選、2,258 個因表格／公式／覆蓋不足等原因維持原圖；未執行未覆核的大量套用。
- 修正設定視窗在題庫清單非同步載入時將離線內容子頁重設回首頁的競態。
- release id 為 `a13fcc5826142433`；`npm run verify` 與完整 `npm run test:e2e`（18 passed、6 device-conditional skipped）通過。
- 無 Supabase migration、無新增 npm 套件。

## v79.16 模擬考批改設定與正解模式一致化

- 「交卷後統一批改」改為使用者分帳號持久設定，離開模擬考頁再返回不會自行恢復開啟。
- 正解模式啟用時，模擬考會自動採即時顯示正解與解析，並停用互相衝突的統一批改開關。
- 既有 deferred 模擬考 session 在正解模式開啟後，也會立即遵循正解模式。
- 開關 OFF 為淺灰、ON 為藍綠，狀態與實際行為一致。
- 無 Supabase migration、無新增 npm 套件。

## v79.14.1 原頁透明裁切窗 CSS 預算修正

- 保留紅色實線框、中間透明洞口與框外淡色遮罩。
- 將裁切窗規則改為更精確的高 specificity selector，只保留 2 個必要的 `!important`。
- 全專案 `!important` 數量維持 CSS maintenance budget 上限 215，不再因裁切修正造成驗證失敗。
- 無 Supabase migration、無新增 npm 套件。

## v79.14 原頁透明裁切窗

- 原頁裁切定位改為紅色外框、中間完全透明，來源文字與版面不再被色塊遮住。
- 目前裁切範圍外側加入低透明度暗色遮罩，強化定位但不影響裁切區內容閱讀。
- 同頁其他段落維持透明紅色虛線框；圖例也改為透明紅框。
- 使用 `!important` 鎖定透明背景，避免全站 `.is-active` 樣式再次覆蓋成實心主色。
- 無 Supabase migration、無新增 npm 套件。

## v79.13 題目編輯器效能優化

- v79.12 的草稿題目／解析雙預覽與原頁紅框定位完整保留。
- 題目編輯器開啟時先讀取輕量草稿索引，不再逐筆下載所有尚未發布的 JSON；進入章節後只讀取該章節需要的草稿。
- 正式題庫 override 改為依目前章節的題目 ID 分批取得，避免每次進入編輯器下載整個發布版本。
- PDF 裁切預覽改用穩定 React key；移動或裁切時不再銷毀並重新解碼同一張原頁圖片。
- 草稿雙預覽改為 deferred rendering，先顯示操作控制，再於下一個畫面週期掛載高解析圖片；非作用中預覽及原頁定位使用低優先載入。
- 預覽卡加入 memo、CSS containment 與 content-visibility，降低不相關狀態更新造成的重排與繪製。
- 本次修改清單使用輕量 ID 索引，切換到修改題目時才載入對應章節內容。
- 完整 `npm run verify` 通過；無 Supabase migration、無新增 npm 套件。

## v79.12 題目草稿雙預覽與原頁紅框定位

- 題目編輯器同時顯示「草稿題目」與「草稿解析」的 App 成品預覽，尚未儲存的裁切調整也會即時反映。
- 新增原始 PDF 頁面定位預覽，完整呈現目前頁面，並以紅色實線框標示正在調整的裁切區域；同頁其他段落使用紅色虛線框輔助辨識。
- 草稿題目／解析預覽可直接切換目前編輯模式，減少在工具列與預覽間來回確認。
- 強化「裁上／裁下」按鈕為深藍綠底白字；「減高／加高」維持白底深色字，避免低對比按鈕難以辨識。
- 完整 `npm run verify` 通過；無 Supabase migration、無新增 npm 套件。

## v79.11 更新可靠性、頭像自訂裁切與扁平化管理圖示

- 「更新 App」改用具 3 秒上限的 Service Worker 啟用流程；即使更新 promise 或 controller change 沒有回應，也會安全重新載入，並立即顯示「更新中…」。
- 排行榜頭像改為使用者選圖後先進入裁切視窗，可直接拖曳位置、調整縮放、重設並確認 320 × 320 裁切結果後再上傳。
- 移除排行榜資料區「自動裁切／不公開 Email」說明文字，保留乾淨的名稱與頭像操作。
- 管理控制中心盾牌與營運摘要符號移除白色立體方塊、邊框與陰影，改為透明底扁平線條，直接融入白色背景。
- 無 Supabase migration、無新增 npm 套件。

## v79.10 管理圖示與獎牌緞帶協調修正

- 排行榜金、銀、銅獎牌保留各自金屬色，三者緞帶統一改為紅色漸層。
- 管理控制中心標題圖示與四項營運摘要圖示改為白底、細框與低陰影，移除藍色塊感並維持圖示辨識度。
- 在線人數圖示仍使用綠色線條，但底色與其他圖示一致為白色。
- 無 Supabase migration、無新增 npm 套件。

## v79.9 管理摘要、排行榜獎牌與帳號精簡

- 管理控制中心摘要移除「有效授權」，改為「目前在線」，並修正練習投入時間在窄欄位被省略的問題。
- 排行榜前三名改用獨立透明底 Q 版金／銀／銅獎牌 SVG，榮耀殿堂與完整排名共用相同獎牌識別。
- 帳號頁與管理工具移除多因素驗證設定；管理操作改以主要管理員／管理員角色權限與確認流程保護。
- 無 Supabase migration、無新增 npm 套件。

## v79.8 介面精修與頭像載入修正

- 模擬考測驗紀錄統一右側操作欄寬度，完成與未完成紀錄保持水平對齊。
- 「專業模擬考」更名為「模擬考」，移除冗長說明並精簡控制台。
- 修正排行榜頭像被 CSP 阻擋而無法顯示的問題，並加入圖片載入失敗的文字 fallback。
- 排行榜榮耀殿堂改為中性白底，由獎牌圖示本身呈現金、銀、銅，不再使用文字或卡片底色辨識。
- 移除排行榜所有「本期」字樣，重新整理完整排行列的資訊層級。
- 帳號頁同步區改為純白、低框線的兩欄狀態列。
- 管理控制中心改為單一摘要列；會員目錄改為橫向資料列，只顯示必要資訊，其餘內容保留在點擊後的詳細抽屜。
- CSS 維護預算維持在 10 個檔案、9,246 行、215 個 `!important`。

## v79.7 專業一致化體驗

- 排行榜移除多餘的個人成就摘要，前三名明確使用金牌、銀牌與銅牌，並新增使用者自助頭像上傳、裁切、壓縮與移除。
- 管理後台會員目錄改為對稱資訊卡，移除 30 秒同步與 Online／Offline 文字徽章，只在正在使用的會員頭像保留綠燈。
- 管理控制中心改用帳號、授權、累積作答與練習投入四項營運指標。
- 模擬考設定整併為單一專業控制台，統一題數、抽題策略與批改方式。
- 題目編輯器只載入目錄與目前章節，保留單畫面裁切工作區；上方直接顯示本次修改、儲存修改與一顆發布題庫按鈕。
- 題庫發布取消第二人核准流程，由主要管理員直接將目前已儲存修改原子發布；發布不要求 MFA，回滾與破壞性管理操作仍要求 MFA。
- 新增 leaderboard avatar storage migration 與 direct publication transaction RPC。
- CSS 維護預算目前為 10 個檔案、8,968 行、215 個 `!important`。

## v79.6 管理體驗與學習榮耀介面

- 主要管理員正式發布已核准題庫時不再要求 MFA；第二人核准與回滾仍維持既有安全驗證。
- 帳號頁學習同步縮減為雲端狀態、最後同步時間與立即同步按鈕。
- 管理控制中心重新整理資訊層級、營運 KPI、會員學習指標與正確率進度。
- 移除「90 秒內有心跳」實作文字，改為使用者可理解的即時狀態。
- 學習排行榜新增個人成就提示、前段百分比、榮耀殿堂與前三名獎台。

## v79.5 裁切專注工作區

- 題目編輯器改為單畫面雙欄工作區，左側只保留高頻裁切操作，右側使用可獨立捲動的大型即時預覽。
- 段落、題目／解析、步長、自動裁白邊、自動壓縮接縫、復原與儲存集中到上方工具列。
- 圖片路徑、頁碼、X／Y、原頁尺寸、左右調整、段落新增／移除及恢復部署版本移入預設收合的「進階設定」。
- 題庫發布管理改為預設收合，避免占用裁切工作區。
- 移除底部大型黏附儲存列，讓預覽與控制在一般桌面高度內可同時操作。

## v79.4 跨頁題目裁切工具

- 題目編輯器新增 1／5／10／20 px 可調步長。
- 新增裁上、裁下、裁左、裁右，可獨立縮短截圖邊界，不再只能移動整個段落。
- 新增減寬、減高及跨頁接縫兩側同步裁切。
- 新增瀏覽器端白邊偵測，可自動裁除單一段落上下白邊，或壓縮前一段與本段的跨頁接縫。
- 新增最多 30 步裁切復原，並在預覽中標示目前編輯段落。
- 新增 `test:crop-editor`，驗證裁邊、頁面邊界、接縫與白邊偵測。


## v79.3 管理後台還原

- 帳號頁改由伺服器判定管理員資格，不再只依賴 `VITE_ADMIN_EMAILS` 顯示入口。
- 未設定環境管理員清單時，保留專案主要管理員帳號的相容性 bootstrap。
- 資料庫角色為 `primary_admin` 的帳號會正確取得主要管理員功能。
- 管理後台檢視可在 AAL1 使用；刪除啟用碼與管理員異動仍要求 AAL2。
- 恢復啟用碼、管理員、題庫編輯、排行榜、稽核與系統狀態等後台功能。

## v79 歷史基準

## v79 已完成的核心優化

### 資料完整性與跨裝置同步

- 所有同步資料表新增由 PostgreSQL sequence 產生的 `sync_version`。
- 雲端讀取改為 server-authored cursor 與 keyset pagination，不再依賴使用者裝置時間或 mutable offset。
- 首次同步固定先下載 live rows 與 tombstones，再判斷是否需要 legacy bootstrap upload，降低舊資料復活風險。
- 答題、錯題、收藏、進度、一般 session、圖片測驗 session 與本機 `syncIntents` 使用同一個 per-user IndexedDB transaction。
- FSRS state、attempt 與其 cloud outbox entry 使用同一個 reliability IndexedDB transaction。
- 圖片測驗 session 已加入雲端同步、刪除 tombstone、批次上傳及同步摘要。
- Dead-letter queue 新增檢視、重新嘗試與清除操作；帳號頁可處理長期失敗事件。
- Queue 依 `nextAttemptAt` 排程，保留 event id、coalescing、batch、exponential backoff、jitter 與最大重試限制。

### 題庫品質與載入效能

- 3,526 題完整圖片題庫新增語意 validator：ID／題號唯一、答案範圍、題目與詳解裁切、圖片存在、實際尺寸及 crop 邊界。
- 修正 1 筆缺少題目裁切及 5 筆缺少詳解裁切，並調整相鄰題目避免重疊。
- Release manifest schema 2 新增 `questionId -> shardPath` 索引。
- 單章練習只下載單一 chapter shard；Daily Plan、錯題、收藏、相似題及 session 模式只 materialize 實際需要的 shards。
- 原始編輯用 `pdf-image-quiz.json` 與本機 backups 在 production build 後自動移除；管理後台改讀 content-hashed shards。
- Production 仍保留完整 PDF 頁面圖片作為共用來源；同頁多題可共用快取，避免生成數千張重複 crop 資產。

### 管理權限與發布安全

- 移除程式內硬編碼主要管理員 Email，只接受 `ADMIN_EMAILS` 環境設定及資料庫角色。
- Inactive user-id assignment 直接 fail closed，不再 fallback 到 legacy Email access。
- Configured primary admin 與敏感工具操作原則上要求 MFA／AAL2；已完成雙人核准的正式發布可由 primary admin 直接執行。
- 管理員新增、停用、刪除，以及啟用碼建立／刪除，改用 transaction RPC，mutation 與 audit event 原子完成。
- Public question override API 只回傳 published release，使用 500 筆分頁、ETag 與 CDN cache；沒有 active release 時使用 bundled stable data。
- Client telemetry 不傳 query string；後端加入 body limit、來源雜湊、rate limit 與敏感值清理。

### PWA、CI 與維護性

- GitHub Actions browser job 安裝 Chromium 與 WebKit，涵蓋桌面、手機、iPad Chromium 與 iPad WebKit。
- Production health check 不再固定等待 90 秒，改為最多 8 分鐘輪詢，並驗證 CSP、cache headers、manifest schema、hashed asset、chapter shard，以及 raw editor source 未公開。
- CSS 移除 5 個未使用的歷史計算機樣式與舊 `.bak` 元件。
- 新增 CSS maintenance budget：最多 10 個 CSS 檔、9,800 行、215 個 `!important`、`glass.css` 4,900 行。
- 現況為 10 個 CSS 檔、9,730 行、214 個 `!important`。

## 完整驗證結果

已執行並通過：

```bash
npm run verify
```

結果：

- 圖片題庫 validator：3,526 題、818 張來源圖片。
- Question shards：3,526 題、40 個 chapter shards。
- Daily Plan compact index：268,395 bytes。
- Frontend TypeScript、API TypeScript、ESLint。
- CSS maintenance budget。
- Calculator、FSRS、Daily Plan、user-scoped storage。
- Reliability store：3,500 states、1,200 attempts、atomic outbox、dead-letter retry。
- v79 security／sync／deployment integrity contracts。
- App recovery 與傳統文字題庫驗證。
- Production build、PWA generation、bundle budget。
- 初始資源約 **166.5 KiB gzip**。
- Production build 不包含 `data/pdf-image-quiz.json` 或 `data/backups`。

Playwright 實際 browser suite 不包含在 `npm run verify`；GitHub Actions 會使用官方 Playwright Chromium／WebKit 執行。本工作容器的系統 Chromium 受集中式 URL block policy 限制，因此本地未宣稱 browser E2E 通過。

## 資料庫部署順序

必須依序套用尚未部署的 migrations：

```text
supabase/migrations/20260712090000_stabilization_final.sql
supabase/migrations/20260712130000_final_hardening_v79.sql
```

v79 migration 新增：

- `user_sync_version_seq`
- 各同步表 `sync_version` trigger／index
- `user_image_quiz_sessions` 與 RLS
- `image_session` tombstone type
- 原子管理員及啟用碼 RPC
- telemetry `source_hash`

## 部署驗收

1. 最終安裝腳本的 isolated `npm ci` 與 `npm run verify` 成功。
2. `supabase db push` 成功。
3. Git commit／push 成功。
4. GitHub Actions `verify` 與 `browser-smoke` 成功。
5. Vercel Git integration 部署該 commit。
6. `production-health` 成功。

在使用者尚未提供安裝完成畫面前，不能宣稱正式 Supabase、GitHub 或 Vercel 已完成更新。
