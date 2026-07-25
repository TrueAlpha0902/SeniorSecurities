# AI Change Log

## 2026-07-24 — v91 圖像手寫介面與題庫級考試計畫

- 將生成的手寫文字、手繪圖示、首頁插圖、空狀態與答案狀態裁切為94個透明PNG，建立 `public/handwritten-ui` 可重複資產庫。
- 新增 `HandwrittenAsset`、`HandwrittenLabel` 與 `HandwrittenIcon`；圖片失敗時顯示文字備援，並保留螢幕閱讀器文字。
- 將桌面導覽、手機品牌、手機底部導覽、證券／外匯首頁、主要功能入口、題目控制、解析控制與正確／錯誤標示改為圖像介面。
- 動態題幹、選項、解析、日期、統計及使用者資料維持真實文字，避免損害搜尋、複製、可及性與響應式排版。
- 考試計畫從考科級全面收斂為題庫級：證券高業三考科共用一份，初階外匯兩科共用另一份。
- 移除考科／章節頁的獨立計畫入口；舊分科設定只供遷移，新的設定頁只顯示兩個題庫。
- 更新v83與v86相容契約，新增v91圖像資產、可及性、容量與題庫級計畫契約。
- 無Supabase migration，尚未部署正式網站。

## 2026-07-23 — v90 核准模板精準實作

- 依使用者最終核准模板，重寫 AppLayout、題庫首頁共同元件、品牌 Logo、手繪插圖、證券作答頁與初階外匯作答頁。
- 新增 `theme-v90.css`，以暖白稿紙、楷體／手寫字體、細框、斜線紙紋及低飽和證券藍／外匯綠覆蓋全 App。
- 桌面導覽改為固定紙張側欄並加入圖釘今日學習目標；手機保留精簡頂部列與非作答頁底部導覽。
- 兩套題庫首頁改用相同模板：主視覺、三張進度／日期／今日題量卡、六項捷徑、考科路徑、學習摘要與考試資訊。
- 新增證券 K 線、外匯地球匯兌、考試簡章及七日學習曲線 SVG；不引入外部圖片依賴。
- 作答頁加入模板式題號列、單選題標籤、斜線選項狀態、解析折疊、題目列表與頁底三段導覽。
- 新增 v90 模板契約與核准參考圖存證；無資料庫 migration，尚未部署正式網站。


## 2026-07-23 — v89 草稿線條全 App 統一主題

- 依核准參考圖加入暖白稿紙、繁體中文文楷／楷體字型堆疊與細線手繪介面。
- 新增證券 K 線、外匯地球匯兌、三種品牌 Logo 及圖釘學習便條的內嵌 SVG。
- 首頁、導覽、題目選項、解析、設定、帳號、搜尋及管理後台統一為低飽和鉛筆線風格。
- 答案選取／答對／答錯改以淡色斜線稿紋呈現，保留文字與圖示的可辨識性。
- 證券與外匯首頁共用資訊架構及共同考試日期；不變更題庫與資料庫。

## 2026-07-23 — v88 低飽和專注學習全 App 統一主題

- 依使用者確認的低飽和介面方向，新增 `theme-v88.css`，統一暖白／霧灰背景、藍灰與鼠尾草綠主色、細邊框、柔和陰影與深色文字。
- 重整 `AppLayout`：桌面使用固定左側導覽，手機使用精簡頂部列與非作答頁五項底部導覽；作答頁不顯示全域底部導覽。
- 新增 `ExamBrandMark`，依中文題庫名稱顯示證券書本／走勢、外匯地球／雙向箭頭及金融證照圖示，不顯示英文品牌。
- 兩套題庫首頁共用主視覺、進度總覽、共同考試計畫、今日建議、快速練習及考科路徑；初階外匯保留第23至47屆緊湊入口。
- 證照入口、章節、題目、解析、設定、會員、搜尋、相似題、排行榜、管理後台、Recovery及更新提示套用同一視覺系統。
- 保留每張證照一份共同考試日期、一般練習無計時器、模擬考有計時器、全卡紅／綠答案回饋及手機靜態上一題／下一題。
- 移除舊 `theme-v87.css`，新增 v88主題契約；無 Supabase migration，尚未部署正式網站。

## 2026-07-23 — v87.3 依題庫名稱切換 Logo

- 移除導覽品牌區的通用六角形 Logo。
- 證券高業使用 K 線圖示，初階外匯使用雙向匯兌箭頭，金融證照中性頁面使用證照勾選圖示。
- 桌面導覽與行動版功能選單共用相同動態 Logo，並沿用各題庫主色。
- 更新 v87 主題契約，防止通用 Hexagon Logo 回歸。
- 無 Supabase migration；尚未部署正式網站。

## 2026-07-22 — v87.2 全中文題庫品牌

- 移除桌面導覽與行動版選單中的 `SENIOR SECURITIES`、`FOREIGN EXCHANGE` 及 `FINANCE EXAMS`。
- 證券高業改顯示「證券高業／測驗題庫」，初階外匯改顯示「初階外匯／測驗題庫」，中性頁面改顯示「金融證照／學習中心」。
- 保留依路由切換品牌的行為，只將品牌文案收斂為中文。
- 調整中文品牌字級、字距與次要文字顏色，避免沿用英文全大寫字距。
- 更新 v87 主題契約，禁止品牌區重新出現英文名稱。
- 無 Supabase migration；尚未部署正式網站。

## 2026-07-22 — v87 高級極簡專業主題與全 App 統一體驗

- 新增 `theme-v87.css`，以暖白／霧灰背景、純白 surface、細邊框、極輕陰影和深色字體統一全 App；禁止裝飾性漸層。
- 證券高業採深海軍藍主色，初階外匯採墨綠主色；元件結構、排版、按鈕、進度條與狀態規則共用。
- 重寫 `AppLayout`，桌面提供品牌導覽列，手機提供精簡頂部列與非作答頁五項底部導覽；作答頁不顯示底部導覽。
- 新增 `ExamHomeSections`，證券與外匯首頁共用 Hero、共同考試日期、今日建議、快速操作與學習路徑。
- 考試計畫由五份分科設定收斂為兩份題庫設定：證券高業共用一份、初階外匯共用一份；舊值依題庫安全遷移。
- 證券高業維持投資學、財務分析、證券相關法規與實務三個正式考科；內部舊 bank ID 仍可相容。
- 題目、解析、答案狀態、設定、會員中心、搜尋、章節、相似題、排行榜、管理後台及Recovery均套用同一視覺系統。
- 手機作答上一題／下一題維持正常頁面流，並在所有quiz route移除全域底部導覽，避免遮住選項與解析。
- 一般練習不顯示計時器；證券與外匯模擬考保留計時器。
- 新增v87主題契約與18項桌面／手機版面報告；無橫向溢出或作答導覽遮擋。
- 無Supabase migration；尚未部署正式網站。

## 2026-07-22 — v86 統一題庫首頁、分科考試計畫與手機作答流程

- 證券高業從四個 learner-facing 題庫收斂為三個正式考科；法規與實務合併為「證券相關法規與實務」，舊 bank ID 與舊網址仍可相容。
- 考試計畫改為五個正式考科獨立設定：投資學、財務分析、證券相關法規與實務、國外匯兌業務、進出口外匯業務。
- 證券與外匯首頁採共同的 dashboard、進度、考科卡片與行動按鈕結構；證照入口移除總題數及正確率。
- 一般練習不顯示計時器，只有兩套模擬考保留計時；一般練習仍累積總學習時間。
- 手機作答導覽改為頁面流最底部，不再固定浮動；最後一個選項、解析與上一題／下一題之間保留安全間距。
- 外匯作答頁改用共用進度元件、標題層級與解析 surface；手機版歷屆與考科入口同步收斂。
- 新增 v86 契約與手機 E2E 斷言，鎖定三考科、五份計畫、模擬考專用計時器及靜態底部導覽。
- 無 Supabase migration；尚未部署正式網站。

## 2026-07-22 — v85.2 選項文字標記與融合式計時器

- 移除答題選項右側的勾號／叉號圖示，改以「正確」「錯誤」文字直接標記。
- 移除所有選項編號的圓形／膠囊背景與裝飾線，編號改為純文字。
- 證券高業、初階外匯與相似題共用同一套選項回饋規則。
- 保留 v85.1 整張深綠／深紅回饋，不再額外顯示重複答案摘要。
- 練習計時器改為融入題號列的透明資訊列；暫停按鈕取消獨立卡片感。
- 初階外匯模擬考計時器改為透明區塊，僅剩五分鐘時顯示警示底色。
- 更新 v83、v84、v85 契約測試，改驗證文字狀態標記。
- 本工作環境完成 TypeScript 語法轉譯、靜態契約及 CSS 維護預算檢查；npm registry 暫時回傳 503，未在此容器重跑完整 npm build。

# AI Change Log

## 2026-07-22 — v85.1 單一正解模式與全紅／全綠回饋

- 正解模式由六個分題庫開關收斂為一個全域開關，證券高業與初階外匯一般練習共用，預設關閉。
- 移除沒有其他設定內容的初階外匯設定分頁；一般設定只保留正解模式與答對後自動下一題。
- 升級時將舊的分證照／分題庫正解設定安全重設為關閉，避免沿用舊值意外揭露答案。
- 答對選項恢復整張深綠底白字；答錯選項恢復整張深紅底白字，選錯時同步標出正確選項。
- 證券高業、初階外匯與相似題共用同一套全卡片回饋；不恢復重複的「你的答案／正確答案」摘要。
- TypeScript、API TypeScript、ESLint、CSS、儲存遷移、模擬考、相似題、Production build、公開內容與 Bundle 檢查通過。
- 無 Supabase migration；尚未部署正式網站。

## 2026-07-22 — v85 高精度學習回饋與分題庫設定

- 作答結果改為選項式回饋，移除重複的答案摘要。
- 題目、選項與解析採全形標點顯示層，保留數值、網址及公式正確性。
- 相似題收斂為 19 組逐組人工核對配對。
- 正解模式拆為六個題庫 scope，預設全部關閉。
- 資料重設改為分題庫及三個清除層級；初階外匯錯題清單與作答歷史分離。
- 全量資料、契約、型別、Lint、CSS、Production build、公開內容及 Bundle 檢查通過。
- 無 Supabase migration；尚未部署正式網站。

## 2026-07-21 — v83.1 公開內容邊界與發布硬化

- 將免費試用題庫改為從掃描轉錄最終資料產生的純文字10題，清除所有掃描座標與PDF檔名。
- 移除Production舊版示範題庫，並新增 `test:public-boundary` 防止付費內容或掃描資產回歸。
- 更新post-deploy health check，改為驗證私有shards不可公開及題庫API必須執行登入/entitlement檢查。
- 修補開發依賴的brace-expansion安全公告，npm audit重新達到0項。

## 2026-07-21 — v83 產品與技術收斂版

- 新增統一受保護的 `/api/questions`，集中處理證券高業、初階外匯、搜尋、題目覆寫及兩套模擬考生命週期。
- 證券與外匯模擬考改為伺服器延後批改；開始／續考不回傳答案與解析，交卷後才由後端驗證簽章與題庫版本並評分。
- Production移除 `pdf-pages`及公開證券題庫shards，學員離線包改為登入後的純文字章節快取。
- Vercel公開Functions由11支降至9支，保留3支Hobby額度；舊API網址透過rewrite相容。
- 搜尋改為跨證照伺服器搜尋，只查詢使用者已開通題庫，結果不傳答案或完整解析。
- 重整全域頁首、證照入口、證券首頁、章節表格、初階外匯屆次篩選、設定及會員中心。
- 初階外匯答案與收藏接入共用雲端紀錄；兩套題庫使用共同的中性解析surface。
- 移除重複的舊題目、測驗、結果與複習頁面及舊資料層，舊路由改為安全重新導向。
- 新增v83產品契約，鎖定付費內容保護、模考簽章、Production資產清理、資訊架構及Function預算。
- TypeScript、API TypeScript、ESLint、CSS預算、資料稽核、production build與bundle預算均通過；本版尚未部署正式站。

## 2026-07-21 — v82.2 中性白底題目與解析、移除原圖功能

- 移除證券高業一般練習、模擬測驗、正解練習與相似題目中的「原圖／查看原始題圖／查看原始解析圖」入口及對話框。
- 學員端改為純文字呈現；題文或解析異常時顯示中性錯誤訊息，不再回退顯示掃描圖片。
- 題目區改為純白底、細灰框及低陰影；移除主色左標線、彩色漸層與高彩度標籤。
- 解析區同步改為純白底、細灰框及中性標題分隔線，避免與題目或選項搶視覺焦點。
- 保留切題後回到題目起始位置的閱讀導引；收藏、錯題、模擬考、答案與解析內容均未變更。
- 新增契約檢查，禁止學員介面重新出現原圖控制項或明顯主色題目樣式。
- 無資料庫、題庫文字、答案、解析、權限、API或Vercel Function異動。

## 2026-07-21 — v82.1 題目閱讀焦點與原始題圖快捷檢視

- 將證券高業主作答頁的原始題圖入口移至收藏按鈕左側，桌面顯示小型「原圖」按鈕、手機顯示圖示按鈕。
- 原圖改以具焦點管理、Esc／遮罩關閉及背景捲動鎖定的對話框顯示，移除題目卡底部的大型行內入口。
- 重新設計主要題目區：加入題目標籤、主色左標線、高對比漸層背景、較大字級與更清楚的題幹／選項層級。
- 題目切換、跳題、答題卡及自動下一題會回到新題目閱讀位置，減少使用者重新尋找題幹。
- 新增靜態契約驗證，鎖定原圖按鈕必須位於收藏按鈕之前，並保留相似題目、正解練習及解析原圖fallback。
- 無資料庫、題庫內容、答案、解析或Serverless Function異動。

## 2026-07-20 — v82 初階外匯第23至47屆完整封存與Vercel Hobby修正

- 新增第23至44屆2,860題，初階外匯總數擴充為第23至47屆3,250題。
- 匯入75份來源PDF，16,250個題幹／選項欄位與3,250筆官方答案均完成三條PDF文字擷取路徑核對。
- 支援6題官方特殊計分規則，包括複數可計分答案及凡有作答給分。
- 第23至44屆採官方答案對照式保守解析；第45至47屆保留原有390則詳細解析。
- 題庫API擴充至第23至47屆，隨機模式改由伺服器抽樣，錯題與收藏使用POST傳送大型ID清單。
- 將 `/api/auth/log-login` 併入 `client-error`，將 `/api/admin/ping` 併入 `admin/action`，公開Functions由13降至11，解決Vercel Hobby部署阻斷。
- 新增function budget prebuild檢查，保留1個Function安全餘量。
- 完整驗證、production build、PWA與bundle budget均通過；v82尚未部署正式網站。

## 2026-07-20 — v82 初階外匯第23至47屆完整題庫與 Vercel Hobby 函數整併

- 初階外匯由第45至47屆390題擴充為第23至47屆3,250題；國外匯兌1,250題、進出口外匯2,000題。
- 第23至44屆共66份來源PDF均納入 `source-materials/foreign-exchange-official-pdfs`；加上第45至47屆，共75份試題與答案PDF。
- 3,250題的題幹及四個選項共16,250個欄位由PDF原生文字層擷取並交叉核對；未使用OCR或AI補字。
- 3,250筆官方計分規則完整匯入，包含6題多答案或作答即給分的特殊題型；模擬考與練習均依官方規則計分。
- 第23至44屆解析採保守的官方答案導向文字，不冒充官方詳解；第45至47屆保留既有逐題解析。
- 前端屆次範圍、題數、隨機練習、錯題、收藏、進度與模擬考均擴充至第23至47屆。
- 修正Vercel Hobby部署超過12支Serverless Functions的問題：登入稽核整併至 `api/client-error.ts`，管理健康檢查整併至 `api/admin/action.ts`，公開API由13支降為11支，保留1支餘裕。
- 新增 `check:vercel-functions`，並在prebuild與verify前強制檢查函數預算，避免部署階段才失敗。
- 完整資料驗證、權限契約、TypeScript、API TypeScript、ESLint、production build、PWA與bundle budget均通過。
- 本版尚未由此工作環境直接發布至正式站；提供完整專案包及本機一鍵更新／發布工具。

## 2026-07-20 — v81 證券高業3,526題掃描全文字化

- 只使用專案內818張證券高業掃描頁，將3,526題全部轉為題幹、四選項與解析文字；未使用JY筆記、網路題庫、外部PDF或其他教材補字。
- 建立21,156個學員文字欄位；3,114題採多引擎一致結果，412題依原始掃描建立人工覆寫，其中187題為高風險逐題掃描處理。
- 完成152題直接掃描視覺抽查，涵蓋全部40章；修正跨頁、表格、公式、上下標、希臘字母、法規條號、頁碼及罕見OCR字形。
- 新增英文術語空格專項掃描核對，修復 `Call Option`、`Fund of Funds`、`Yield Curve`、`Efficient Frontier`、`High Yield Notes` 等OCR黏字；原掃描確實印為特殊拼法者保持原樣。
- 依掃描修正財務分析第三章第59題選項為 `（現金收入－現金支出）÷流通在外股數`，並擴充異常稽核以攔截中文字間異常空白、頁碼殘留、英文黏字與已知計算式錯誤。
- 最終異常稽核為0；14題Markdown表格通過格式檢查，唯一1題重複選項已確認是原掃描內容。
- 每題保留可展開原始題圖與解析圖；學員介面移除OCR模型、信心值、候選內容、裁切座標與內部稽核資料。
- OCR候選與稽核來源不進入production；最終轉錄只作為build-time輸入，production只輸出學員所需的章節shards。
- 一般練習、模擬測驗、正解練習、相似題目及搜尋支援文字；表格以HTML表格呈現，裁切修改會使舊文字失效並回退原圖。
- 完整組成驗證、production build、PWA與bundle budget均通過；initial assets為171.1 KiB gzip。
- 最終文字SHA-256為 `c62c12ccecb071fb2bc870f4b8b097f96b1718268bfe9cdcd5de11acb0e8e7b7`，題庫release為 `c2c5cc72ed708012`。
- 產生桌面與手機實際元件預覽及發布前審查包；本次v81尚未部署正式網站。

## 2026-07-19 — v80 初階外匯文字題庫、逐題解析與分題庫權限

- 新增第45至47屆初階外匯390題，拆分國外匯兌業務與進出口外匯業務。
- 題幹與選項直接取自官方 PDF 內嵌文字層；1,950個文字欄位由 pdftotext、PyMuPDF、pypdf 交叉核對，沒有使用 OCR 或語言模型補字。
- 390個官方答案完成三引擎核對；390題各自加入一則專案編寫解析，並逐題檢視題幹、選項、正解與解析的對應關係。
- 移除學員介面的PDF頁碼、來源檔、雜湊、OCR／AI及內部審核說明，只保留題目、選項、作答狀態、正確答案與解析等學習所需資訊。
- 修正初階外匯模擬測驗：交卷前不顯示答案、解析、答對數或答錯數。
- 新增 `user_exam_entitlements` 與 exam-scoped activation code migration；證券高業、初階外匯可獨立開通、撤銷與到期。
- 初階外匯資料改由受保護 API 提供，學員 payload 排除來源及稽核欄位。
- 修正三個 Big5 檔名為 UTF-8，恢復 Linux production build。
- 尚未部署正式 Supabase migration或Vercel版本。

## 2026-07-14 — v79.22 模擬考舊 Session 延後批改保護

- 「交卷後統一批改」勾選狀態現在會覆蓋尚未交卷的舊 `immediate` session，避免續答時立即洩漏正解。
- 未交卷測驗頁以「目前偏好為 deferred 或 session 已是 deferred」作為 fail-closed 條件；點選答案只保留已選擇狀態。
- 勾選延後批改時會自動關閉正解模式，並把所有未完成舊 session 升級為 `deferred`。
- 新增舊 immediate session + 已勾選延後批改的回歸測試。

## 2026-07-14 — v79.21 模擬考發佈驗證修正
- 修正 Playwright 模擬考 E2E：自訂開關的原生 checkbox 為透明且禁止 pointer events，測試改為點擊使用者實際操作的可見 switch。
- 保留 v79.20 的正解模式／交卷後統一批改互斥邏輯與交卷前答案隱藏保護。
- 發佈流程維持單一 worker，避免 Windows 平行 worker 結束逾時。

## 2026-07-14 — v79.20 模擬考延後批改與正解模式互斥修正

- 「交卷後統一批改」不再因正解模式已開啟而失效；勾選時會先持久化關閉正解模式，再建立 `deferred` session。
- 正解模式與模擬考延後批改改為設定層互斥：開啟其中一項會關閉另一項，且事件監聽只會看到已完成的最終狀態。
- 模擬考開始前會修復舊版同時為 true 的衝突設定；進入既有 deferred session 時也會再次強制關閉正解模式並恢復延後批改偏好。
- 模擬考設定開關不再因正解模式而 disabled，並明確顯示「勾選會自動關閉正解模式」。
- 新增 user-scoped setting exclusivity 測試，以及 Playwright「先開正解模式、再勾統一批改」流程。
- 無 migration、無新增 npm 套件。

## 2026-07-14 — v79.19 模擬考統一批改模式鎖定修正

- 模擬考開始時重新讀取當前帳號的「交卷後統一批改」設定，避免 React state、登入 scope 或快速切換造成建立錯誤模式的 session。
- session 建立後立即回讀確認 `feedbackMode`；若未正確保存就阻止進入測驗，避免畫面顯示 deferred、實際卻採 immediate。
- 測驗頁將 persisted session mode 設為唯一權威；navigation state 只作首次載入 fallback，缺值／非法值預設 deferred，交卷前不顯示正解與解析。
- 模擬考設定監聽 user storage scope 變更；新增 mode normalize／fallback／persistence 與更嚴格的 Playwright deferred-feedback assertions。
- 無 migration、無新增 npm 套件。

## 2026-07-13 — v79.18 模擬考續考、改選與交卷一致性

- 修正以「已選答案數等於總題數」誤判交卷、導致完整作答後離開看不到「繼續測驗」的問題；現在只認 `finishedAt`，且離開文案明確表示儲存進度。
- Immediate feedback 在選答後立即顯示正解與解析；deferred feedback 在交卷前隱藏正解、解析及紀錄卡成績。兩者都可在交卷前反覆改選，交卷後 UI 與 DB 同時拒絕修改。
- 將 mock provisional answer 與正式 learning attempt 分離：先原子完成本機交卷，再依最後答案寫入 user answer、wrong record、FSRS 與 leaderboard；重試使用答案內持久化 UUID 去重。
- 新增 per-session mutation chain 與 IndexedDB atomic updater，修正快速答兩題、答案與標記、答案與交卷互相覆蓋的競態；交卷期間鎖定切題／跳題／答題卡／離開，自動取消過期的 auto-next timer。
- completed session 若仍有 pending learning records，會在結果頁或模擬考首頁自動恢復；刪除會等待 active commit，且不允許刪除尚未完成本機 learning commit 的已交卷紀錄。
- 舊版 `learningRecorded` 缺欄位的未完成 session 在改選後會 reconcile 最終 user answer／錯題，但保留原 learning／leaderboard attempt，避免重複計分。
- 新增 mock exam UUID、提交 gate、改選、legacy reconcile、answer／mark／finish／delete concurrency tests，以及有假 Supabase 已開通 session 的 focused Playwright route flow。
- 題庫 3,526 題中尚有 3,517 題未完成手機分段人工覆核；若按題目＋解析兩欄計，尚有 7,037 欄。OCR 文字未寫回正式題庫。
- 完整 `npm run verify` 與 `npm run test:e2e` 通過；E2E 為 19 passed、9 device-conditional skipped。無 migration、無新增 npm 套件。

## 2026-07-13 — v79.17 手機圖片題閱讀、覆核裁切與 OCR 初評

- 圖片測驗新增精確的 `max-width: 600px` 手機排版；題目、選項與固定操作列針對窄螢幕重排，iPad 與桌面仍使用既有題圖比例與頁面佈局。
- `PdfSegmentStack` 新增等寬橫列與安全 fallback；首批 9 題的 15 個欄位經接觸表視覺覆核後啟用 64 個分段，公式被切開的 `investment-ch01-pdf-0006` 解析明確拒絕套用。
- 新增 mobile segment 候選產生器、版本鎖定的 OCR 依賴、候選／approval 證據檔、資料驗證及 integrity tests；OCR 只使用 layout boxes，不寫回未校對文字。
- 強化 runtime 與 API 護欄：分段必須有限值、包含於來源裁切、依序排列且通過 tracked SHA-256 approval chain；client／remote override 無法鑄造 reviewed 狀態。
- 修正投資學 ch01 q4、ch04 q2、財務分析 ch08 q47，以及法規 ch02 q97／q125、ch04 q125 共 6 個高信心裁切瑕疵，並重新產生 release manifest、索引與 shards。
- 全題庫只執行 dry-run，不大量套用：4,794／7,052 欄位可產生候選；其餘表格、公式、頁尾、覆蓋不足或無安全空白切點者保留原圖。
- OCR 實測可正確保留簡單表格的數字與欄列配對，但繁體字、特殊字形與公式尚不足以直接成為正式題庫文字，故仍要求逐欄人工校對。
- 修正 `SettingsPanel` 初始化 effect 被非同步題庫衍生資料重觸發，導致離線內容子頁偶發跳回設定首頁的競態；E2E 恢復以一般點擊驗證往返。
- 完整 `npm run verify` 與 `npm run test:e2e` 通過；E2E 為 18 passed、6 device-conditional skipped。無 migration、無新增 npm 套件。

## 2026-07-12 — v79.16 模擬考批改設定與正解模式一致化

- 修正「交卷後統一批改」只存在 React component state，頁面重新進入後固定回到開啟的問題。
- 新增 user-scoped mock exam feedback preference 與跨頁設定事件。
- 正解模式優先於 deferred grading：正解模式開啟時，新 session 使用 immediate feedback，既有 session 也不再遮蔽正解與解析。
- 保留 v79.15 的開關顏色修正，OFF／ON 視覺與實際 checked state 一致。
- 新增 integrity contracts 防止設定持久化與正解模式優先規則回歸。

## 2026-07-12 — v79.14.1 原頁透明裁切窗 CSS 預算修正

- 修正 v79.14 因新增 6 個 `!important`，使 CSS maintenance budget 由 213 增至 219 而無法通過驗證的問題。
- 非作用中紅框改用一般透明樣式；作用中裁切窗使用更高 specificity，只保留覆蓋全站 active 規則所需的 `border-color` 與 `background` 兩個 `!important`。
- 套用後全專案 `!important` 數量為 215，符合既有維護上限。
- 原頁文字仍完全可見，紅框外側遮罩與同頁虛線框均保留。

## 2026-07-12 — v79.14 原頁透明裁切窗

- 修正原頁裁切定位的作用中範圍被全站 active 樣式覆蓋成實心藍色、遮住原始題目文字的問題。
- 作用中裁切區改為透明洞口、紅色實線框，並以巨大外陰影只遮暗紅框外側。
- 同頁其他段落與圖例均維持透明紅框；新增管理介面契約測試防止實心覆蓋回歸。
- 本版為 v79.11／v79.12／v79.13 可直接套用的累積更新；無 migration、無新增 npm 套件。

## 2026-07-12 — v79.13 題目編輯器效能優化

- 題目編輯器初始請求改為 draft ID index；只在選定章節時讀取該章節的 draft payload。
- Public published overrides 新增 question-id subset 查詢，editor 不再抓取整個 release payload。
- `PdfSegmentStack` 使用穩定 key 與 memo，裁切座標改變時保留既有圖片節點，避免重複下載／解碼。
- 草稿題目、草稿解析及原頁定位改為 deferred／lazy preview，控制區先完成首屏繪製。
- 新增效能契約測試，防止 full override loading、coordinate-based image key 與 eager full-page preview 回歸。
- 本版為 v79.11 可直接套用的累積更新，包含 v79.12 雙預覽與紅框定位。

## 2026-07-12 — v79.12 題目草稿雙預覽與原頁裁切定位

- 管理後台題目編輯器新增題目／解析雙成品預覽，直接呈現目前草稿套用後在 App 內的顯示結果。
- 新增完整原頁預覽，依頁面尺寸等比例顯示來源圖片，使用紅框標出目前欲裁切範圍與同頁其他段落。
- 預覽卡可直接切換題目或解析編輯模式，並維持單畫面雙欄裁切工作區。
- 修正上下裁邊按鈕對比不足；新增管理後台契約，防止雙預覽與紅框定位功能回歸。
- `npm run verify` 全數通過，initial bundle 維持約 166.1 KiB gzip。

## 2026-07-12 — v79.11 更新可靠性、頭像自訂裁切與扁平化管理圖示

- 修正 PWA 更新按鈕可能等待 Service Worker 而看似無反應的問題；加入 bounded activation、controller-change 等待與強制 reload fallback。
- 新增無第三方套件的頭像裁切器，支援拖曳、縮放、重設及本機 Canvas 320 × 320 WebP 輸出。
- 移除排行榜頭像自動裁切說明文字。
- 管理控制中心標題與 KPI 圖示改為透明底、無邊框、無陰影的扁平符號。
- 更新 recovery／admin UI 契約；無 migration、無新增 npm 套件。

## 2026-07-12 — v79.10 管理圖示與獎牌緞帶協調修正

- 金、銀、銅獎牌的金屬本體維持名次辨識，三款緞帶統一為紅色。
- 管理控制中心的盾牌與 KPI 圖示容器改為白底、細框及低陰影，不再使用淺藍或淺綠底色。
- 新增管理介面契約，防止獎牌緞帶及管理圖示底色回歸。
- 無 migration、無新增 npm 套件。

## 2026-07-12 — v79.9 管理摘要、排行榜獎牌與帳號精簡

- 管理控制中心 KPI 由有效授權改為目前在線，練習投入時間支援完整換行顯示，不再被 ellipsis 截斷。
- 新增透明底 Q 版金、銀、銅獎牌 SVG，排行榜前三名卡片與完整排行列共用同一組圖示。
- 帳號頁、管理員設定與系統健康狀態移除 MFA／AAL 顯示；後端管理操作改為角色授權，不再依賴第二因素驗證。
- 更新管理後台 UI 契約；無 migration、無新增 npm 套件。

## 2026-07-12 — v79.8 介面精修與頭像載入修正

- 模擬考標題與說明精簡；測驗紀錄的操作欄固定寬度，完成／未完成卡片保持對齊。
- `vercel.json` 的 CSP `img-src` 加入 Supabase storage domain，修復排行榜自訂頭像無法顯示。
- 頭像元件加入載入失敗 fallback，避免顯示破圖圖示。
- 榮耀殿堂與完整排行榜改為中性白底，前三名以獎牌 SVG 本身的金／銀／銅色呈現，移除「本期」文案。
- 帳號同步狀態改為純白 inline layout。
- 管理控制中心改為 compact summary strip；使用者與活動改為桌面橫列、行動裝置精簡 stacked rows。
- 無 Supabase migration、無新增 npm 套件。

## 2026-07-12 — v79.7 專業一致化體驗

- 排行榜加入公開頭像上傳、正方形 WebP 壓縮與個人資料管理，並將前三名明確呈現為金牌、銀牌、銅牌。
- 移除排行榜多餘的個人成就摘要，保留榮耀殿堂、個人資料與完整排名。
- 管理控制中心與會員目錄改為對稱、乾淨的專業資訊卡；移除 30 秒同步文案與 Online／Offline 文字徽章。
- 模擬考設定重整為單一控制台，科目與紀錄卡片統一專案視覺語言。
- 題目編輯器改為 lightweight catalog + selected chapter loading，降低管理頁初次載入與切題卡頓。
- 發布流程改為主要管理員一鍵發布目前修改，不再建立送審／第二人核准流程；發布由 PostgreSQL transaction RPC 原子建立 release、items、pointer 與 audit。
- 新增 migration `20260712230000_professional_experience_v797.sql`；完整 `npm run verify`、PWA build 與 166.2 KiB initial bundle budget 通過。

## 2026-07-12 — v79.6 管理體驗與學習榮耀介面

- 新增 publish-only 的主要管理員 MFA 豁免；正式發布仍要求 `primary_admin` 且批次必須已完成雙人核准。
- 精簡帳號同步卡，只顯示雲端狀態、最後同步與立即同步。
- 重整管理控制中心、會員活動列表與 KPI 視覺層級，移除 90 秒心跳文案。
- 排行榜新增個人成就、前百分比、前三名榮耀殿堂與更具獎勵感的排名列。
- 更新管理後台契約測試；無 migration、無新增 npm 套件。

## 2026-07-12 — v79.5 裁切專注工作區

- 將管理後台題目裁切器重排為單畫面 focus workspace，主要操作與預覽不再被低頻欄位擠壓。
- 高頻的上下移動、裁上／裁下、高度調整與跨頁接縫工具固定顯示；左右與原始座標欄位移入進階設定。
- 儲存與復原移到可見頁首；發布管理改為收合區塊。
- 新增管理後台 UI 契約，防止大型底部工具列與全展開欄位回歸。
- 無 migration、無新增 npm 套件。

## 2026-07-12 — v79.4 跨頁題目裁切工具

- 管理後台題目編輯器新增獨立上／下／左／右裁邊，不再只能移動或放大裁切框。
- 新增可選 1／5／10／20 px 步長、減寬、減高及接縫兩側同步裁切。
- 新增基於 Canvas 像素分析的上下白邊偵測，可自動壓縮跨頁題目的段落接縫。
- 新增裁切復原堆疊及目前編輯段落高亮。
- 新增 PDF crop editor 自動測試並納入 `npm run verify`；無 migration、無新增 npm 套件。

## v79.3 — 管理後台入口與權限相容性修正

- 修正移除前端硬編碼管理員 Email 後，帳號頁「管理後台」入口消失的回歸。
- 改為呼叫受保護的 `/api/admin/tools?tool=access` 判定管理員角色。
- 修正資料庫 `primary_admin` 未被 `isPrimaryAdmin` 正確認定的問題。
- 恢復一般管理員建立與查看啟用碼；破壞性操作維持主要管理員與 MFA 保護。
- 新增主要管理員 bootstrap migration 與管理後台契約測試。

# AI Change Log

## 2026-07-12 — Complete Optimization v79

- 雲端同步由裝置時間／offset 改為 PostgreSQL `sync_version` server cursor 與 keyset pagination。
- 首次同步改為 download-first；live rows 與 tombstones 依 sync version reconciliation。
- 一般學習資料與 local sync intent 使用同一個 per-user IndexedDB transaction；FSRS state／attempt／outbox 亦為原子寫入。
- 圖片測驗 session 納入雲端同步、tombstone、批次 queue 與帳號同步摘要。
- Dead-letter queue 新增列出、重新嘗試、清除及帳號頁復原介面。
- 題庫 manifest 升級 schema 2，加入 question-to-shard index；Daily Plan、錯題、收藏、相似題與 session 只載入所需 shards。
- 新增 3,526 題／818 張圖片的完整 crop validator，修復 6 筆空白裁切及相鄰題目重疊。
- 移除 production build 中的完整編輯來源 JSON／backups；管理後台題目編輯器改從 hashed shards 載入。
- 移除 hard-coded admin Email，inactive assignment fail closed；敏感 admin／activation mutation 改為 AAL2 transaction RPC。
- Public override API 使用 published-only、分頁、ETag 與 CDN cache。
- Telemetry 移除 query string，加入 body size、source hash、rate limit 與敏感值清理。
- GitHub Actions 增加 WebKit；production health 改為輪詢並驗證安全與快取標頭。
- 移除未使用歷史計算機 CSS／bak，新增 CSS budget；完整 `npm run verify` 通過。

## 2026-07-11 — Stabilization Final（v78）

- 雲端同步改為明確分頁、增量 checkpoint、explicit tombstone、批次初始上傳與安全 reconciliation，消除 partial response 誤刪本機紀錄的風險。
- FSRS state、attempt、cloud mutation queue、sync metadata 與 dead-letter 搬到 IndexedDB；加入 coalescing、指數退避、jitter、批次 RPC 及 3,500-row 測試。
- Daily Plan 排除今日已完成題目後再選 quota，並將全題庫理論覆蓋速度與每日時間可執行題數分離。
- 題庫改為 content-hashed release manifest 與 40 個章節 shard；設定頁新增按科目離線下載／清除。
- Admin API 統一中央角色驗證，高風險操作強制 AAL2；publish／rollback 改為 transaction RPC；Production 禁止 draft fallback。
- Activation code 只保存 hash／preview，舊明文由 migration 清空；新增 privacy-safe client telemetry 與管理工具系統健康檢查。
- Calculator、Settings、Analytics 與 routes 全部使用 lazy chunk recovery；Service Worker update state 持久化並限制 cache cleanup scope。
- 合併歷史主題 import，加入 CSP/HSTS 等標頭、Playwright desktop/iPad/mobile、offline、axe、production health check、bundle 與 integrity contracts。
- `npm run verify` 全部通過；Desktop Chromium smoke／trial answer colors／offline reload 本地通過。
- 新增 migration `20260712090000_stabilization_final.sql` 與 Playwright／axe／fake-indexeddb 開發相依套件。

## 2026-07-11 — v74.1 Blank-Screen Recovery

- 將 PWA 更新從背景強制接管改為提示式更新，避免新版 Service Worker 接管仍執行舊版 lazy chunks 的分頁。
- 新增 `lazyWithRetry`，動態 import／chunk 載入失敗時安全自動重新載入一次。
- 新增 `AppErrorBoundary` 與全域 promise／script error recovery，錯誤時顯示可操作的復原畫面。
- 新增更新通知，使用者可在安全時機主動更新 App。
- 補上 Vercel HTML／Service Worker cache headers，hash assets 使用 immutable cache。
- 新增 `test:recovery` 並納入完整驗證；無 migration、無新增 npm 套件。

## 2026-07-11 — v74 Final Performance

- 首頁每日規劃改讀約 268 KB 的 compact question index，不再載入約 4.3 MB 完整 crop payload。
- 新增規劃索引自動生成與 freshness check，並驗證 compact／full question object 產生完全相同題列。
- 計算機、設定視窗、Analytics 與 `ts-fsrs` 改為延遲載入；學習狀態讀取拆成不依賴排程引擎的輕量模組。
- learning-state localStorage 加入 session memory cache，避免重複 JSON parse。
- Service Worker 延後到首屏後註冊，下一題 PDF 預抓改用實際版本化 URL。
- 首頁透明芙莉蓮由 PNG 改為 WebP，約從 1.02 MB 降至 126 KB。
- 全題目清單改為 48 題漸進呈現，長列表加入 `content-visibility`。
- Vite 改用 ES2022、移除 module-preload polyfill、刪除舊動畫 cache，新增 bundle-size budget。
- 無新增 migration、無新增 npm 套件。

## 2026-07-11 — v73 Phase 2.1 驗證相容性修正

- 移除 `ImageQuizPage.tsx` 未使用的 `WrongQuestionRecord` 型別 import。
- 修正 DailyPlanService 測試在 `noUncheckedIndexedAccess` 下的型別錯誤。
- Node 測試 TypeScript 設定加入 `vite/client`，讓共用 DailyPlanService 的型別依賴可完整建置。
- ESLint 與 Git 忽略本機 `update-backups`，避免備份檔影響驗證。
- 完整 `npm run verify` 已通過；無 migration、無新增 npm 套件。

## 2026-07-11 — v73 Phase 2 DailyPlanService 單一來源

- 新增共用 `DailyPlanService`，首頁與每日練習頁使用同一份當日不可變題列。
- 統一 FSRS 到期判斷、錯題排序、新題配置、三科平衡、交錯順序、快取讀寫與剩餘題數計算。
- 快取新增題庫 universe signature 與完整 plan snapshot，避免題庫更新或今日作答後造成首頁與練習頁漂移。
- `DAILY_PLAN_STORAGE_VERSION` 更新至 42，舊快取安全失效。
- 刪除 HomePage／ImageQuizPage 兩套重複 Daily Plan 邏輯。
- 新增 `test:daily-plan` 並納入 `npm run verify`。
- 無 Supabase migration、無新增 npm 套件。

## 2026-07-11 — v73 Phase 1 資料可靠性與多帳號隔離

- FSRS learning attempt 與排行榜 answer event 納入持久 cloud mutation queue，離線及短暫同步失敗後可重新補送。
- learning／leaderboard mutation 以 `eventId` coalescing，保留既有後端冪等語意。
- 新增 `userScopedStorage`，隔離練習秒數、考試計畫、每日計畫、相似題資料與答題設定。
- 舊 global localStorage 採單一 owner 遷移，防止第二個帳號誤讀第一個帳號的資料。
- Auth 切換帳號時同步切換 storage scope，登入後補送待同步練習秒數。
- 新增 `test:storage` 並納入 `npm run verify`。
- 新增 GitHub Actions Verify workflow，PR／main push 自動執行完整驗證。
- 無 Supabase migration、無新增 npm 套件。

## 2026-07-11 — v72.5 首頁置中與作答視覺修正

- 首頁透明芙莉蓮插圖改為置中顯示，並把倒數區塊再往右微調。
- 修正章節練習進度條顯示成空白的問題。
- 恢復題目頁「錯誤次數」徽章的紅色樣式。
- 恢復作答後答案正確／錯誤的顏色樣式。
- 移除「作答把握程度」區塊。
- 無新增 migration、無新增 npm 套件。

## 2026-07-11 — v72 首頁透明芙莉蓮、計算機鍵位微調與設定排版優化

- 首頁底部完整移除原本的芙莉蓮動畫元件、預載程式、CSS 與舊動畫素材，改為透明底 Q 版芙莉蓮「加油」插圖，直接融入背景。
- 首頁工具按鈕文案「相似題辨識訓練」改為「相似題測驗」。
- 計算機功能鍵重新排序，讓 `x` 緊鄰 `x²` 左側，並把等號移到 `%` 右邊空位。
- 等號按鈕改用與 `Ans` 相同的主色，右上角工具列的等號按鈕移除。
- 首頁倒數區塊往右微調，改善過度靠左的視覺感。
- 設定頁增加留白、卡片內距與危險操作按鈕的獨立性，降低擁擠感。
- 無新增 migration、無新增 npm 套件。

## 2026-07-11 — v66 完整學習與治理升級

- 重新設計統一 ClassWiz 風格計算機，補齊科學、工程、統計、矩陣、向量、方程式及財務模式。
- 重新設計排行榜與模擬考建立頁；完整模考為 150 題／210 分鐘。
- 模考加入延後批改、倒數、答題卡、待檢標記、信心標記與同場錯題重練。
- 相似題改為隱藏答案的主動比較學習，加入錯因、筆記、熟練度與重做流程。
- 導入 append-only attempt、FSRS 學習狀態、雲端摘要及不可重放排行榜事件。
- 完成 user-id RBAC、TOTP MFA／AAL2、主要管理員刪除啟用碼與管理稽核。
- 完成題庫雙人核准、immutable release 與 rollback。
- 新增 migration、API typecheck、FSRS 測試及 `npm run verify`。
- 驗證結果：前後端 typecheck、lint、calculator、learning、question data、production build 全部通過。

## 2026-07-11 — v67 Premium Liquid 視覺收斂與計算機修復

- 全站統一為簡約金融感 Liquid Glass 色系與元件層級。
- 首頁移除長期記憶大型資訊區，降低首頁資訊噪音。
- 計算機改為固定置中 overlay，修復可能無法看見／叫不出的問題。
- 計算機外觀重做為 991EX／ClassWiz inspired 單一機身與五欄按鍵配置。
- 模擬考頁修正控制區跑版，簡化模式、題數與科目卡片。
- 排行榜移除展示型前三名卡牆，改為單一高資訊密度榜單。
- 相似題頁統一視覺並降低資訊卡密度。
- 完整 verify 全部通過。

## 2026-07-11 — v68 深藍極簡與計算機重做

- 全站恢復單一深藍主題，移除鈷藍及裝飾性漸層。
- 每日練習首頁只顯示應做題數，其餘資訊收進說明視窗。
- 計算機改為精簡單一介面，新增方程式解 x、上下式分數輸入、歷史與按鍵回饋。
- 新增兩個指定金融方程式及巢狀分數的自動測試。
- 模擬考只保留單科自訂題數，移除快速題數、完整三科模考、倒數及自動交卷。
- 模擬考規則移至頁首，移除頁首 KPI 統計。
- 完整 `npm run verify` 通過；無資料庫 migration。

## 2026-07-11 — v69 deadline plan, floating calculator and admin contrast repair

- 每日練習改為依「尚未作答題數 ÷ 考試前完整練習日」計算，不再受每日分鐘上限壓低；舊的 v68 每日計畫快取會自動失效重建。
- 首頁保留考試倒數，說明按鈕縮成資訊圖示並緊鄰今日題數。
- 計算機合併一般運算與解 x；含等號的輸入自動解方程式，其他輸入直接計算。
- 計算機改為桌面／平板可拖曳浮動視窗，答題頁可一邊看題目一邊輸入；手機維持底部面板。
- 等號移到上方函數鍵，底部改為 EXE 與 Ans；移除輸入框範例及操作說明。
- 修復管理後台因全站移除漸層後白字白底，以及帳號頁登出按鈕背景消失的問題；管理區恢復實心紅色高對比樣式。
- 完整 verify 通過，無 Supabase migration、無新增 npm 套件。

## 2026-07-11 — v70 countdown, mock exam and admin governance refinement

- 計算機底列交換 Ans／EXE 位置，Ans 在左、EXE 在最右。
- 首頁每日練習恢復大型考試倒數區，說明按鈕改為無外框的小型資訊圖示。
- 模擬考移除規則、設定與科目標題下方的輔助說明，只保留必要標題與控制項。
- 管理控制中心移除紅色主視覺，改為白色金融儀表板與深藍操作層級。
- 發布流程合併到題目編輯頁，正式發布按鈕固定在發布區底部，僅主要管理員可用。
- 管理員角色收斂為「主要管理員／管理員」；管理員帳號頁只對主要管理員顯示，API 亦強制檢查。
- 完整 `npm run verify` 通過；無 Supabase migration、無新增 npm 套件。

## 2026-07-11 — v71 無縫首頁與角色生活空間動畫

- 首頁倒數與今日練習統一為無分隔線的白色卡片。
- 計算機顯示區改白底，等號移到右上工具列，x²／xʸ 同列。
- 首頁角色動畫重構為固定房間合成場景，家具從第一幀完整存在。
- 完全沿用既有角色資產，透過交疊淡化、走路循環、呼吸、燈光、窗簾、粒子與鏡頭微動作，建立 54 秒連續生活循環。
- 動畫離開視窗或分頁隱藏時自動暫停，並支援 reduced-motion。
- 完整 `npm run verify` 通過；無 Supabase migration、無新增 npm 套件。
## 2026-07-23 — v90 核准紙張草稿模板

- 全 App 套用核准模板的暖白紙張、繁體中文楷體、細線框、斜線底紋及手繪 SVG。
- 桌面改為紙張式左側導覽與圖釘目標便條；手機作答頁移除全域導覽，保留內容後方的上一題／題目列表／下一題。
- 證券與外匯首頁統一為主視覺、整體進度、共同日期、今日建議、六項捷徑、考科路徑、數據摘要及考試資訊。
- 收藏操作統一為星號；兩套題庫共用圓形選項代號、低飽和斜線答案狀態與紙張解析區。
- 移除 v88／v89 主題檔及舊主題契約，新增 v90 模板契約。
- 無 Supabase migration，題目、答案、解析、權限及學習紀錄不變。
