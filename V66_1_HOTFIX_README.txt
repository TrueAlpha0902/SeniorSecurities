SeniorSecurities v66.1 安裝修正

修正內容：
1. package-lock.json 不再指向 OpenAI 內部套件 registry。
2. APPLY_V66_UPGRADE.ps1 會強制使用 npm 官方 registry。
3. 腳本改為 UTF-8 BOM，支援 Windows PowerShell 5.1。

解壓覆蓋專案根目錄後，重新執行 APPLY_V66_UPGRADE.ps1。
