import { Mail } from "lucide-react";

export const ACTIVATION_SUPPORT_EMAIL = "aaron.kcts@gmail.com";

const SUPPORT_MAILTO =
  "mailto:aaron.kcts@gmail.com?subject=%E5%95%9F%E7%94%A8%E7%A2%BC%E5%8D%94%E5%8A%A9";

export function ActivationSupport() {
  return (
    <aside className="activation-support" aria-label="啟用碼協助">
      <Mail aria-hidden="true" size={19} />
      <div>
        <strong>啟用碼遇到問題？</strong>
        <p>
          請寄信至 <a href={SUPPORT_MAILTO}>{ACTIVATION_SUPPORT_EMAIL}</a>，並附上註冊
          Email、題庫名稱與錯誤訊息；請勿寄送密碼或完整啟用碼。
        </p>
      </div>
    </aside>
  );
}
