import type { CSSProperties } from "react";

type EncouragementTone = "correct" | "wrong" | "neutral";

type CorrectTier = {
  min: number;
  level: "starter" | "warming" | "focus" | "power" | "fire" | "rocket" | "boss" | "legend";
  tag: (streak: number) => string;
  messages: Array<(streak: number) => string>;
};

const MILESTONE_MESSAGES: Record<number, string> = {
  10: "10 題達成，題目剛想反抗，結果被你用觀念按回座位。",
  20: "20 題達成，你的腦袋現在像開了低延遲模式，題目還在轉圈你已經送出答案。",
  30: "30 題達成，題庫開始懷疑自己是不是出太簡單，但其實是你太會。",
  40: "40 題達成，考場如果有氣氛組，現在應該要幫你放進場音樂。",
  50: "50 題達成，這已經不是暖身，是把一整節考試拿來當伏地挺身。",
  60: "60 題達成，你不是在練習，你是在替未來的自己存考場保險。",
  70: "70 題達成，錯誤率看到你都想請病假，題目也開始講話變小聲。",
  80: "80 題達成，今天的讀書效率已經可以拿去申請優良駕駛。",
  90: "90 題達成，題庫快被你刷出心理陰影，請保持禮貌但不用手下留情。",
  100: "100 題達成，這不是連續練習，這是把考試範圍拿去做壓力測試。",
  110: "110 題達成，題目剛排好隊準備嚇你，結果被你整隊點名。",
  120: "120 題達成，你的專注力現在像財報附註一樣長，但比它好懂很多。",
  130: "130 題達成，法規條文都坐直了，投資學和財分也不敢亂動。",
  140: "140 題達成，今天不是你在追進度，是進度在後面喊等等我。",
  150: "150 題達成，一回完整考試量到手，考場壓力目前正在排隊退票。",
  160: "160 題達成，這種續航力很不科學，但很適合拿來通過考試。",
  170: "170 題達成，題庫已經從敵人變陪練，甚至可能想跟你收學費。",
  180: "180 題達成，你的腦內索引正在更新：看到關鍵字，自動彈出正確觀念。",
  190: "190 題達成，考前焦慮剛探頭看一眼，又默默把門關上了。",
  200: "200 題達成，請把今天記下來，這不是讀書紀錄，這是備考名場面。",
};

const CORRECT_TIERS: CorrectTier[] = [
  {
    min: 100,
    level: "legend",
    tag: (streak: number) => `👑 ${streak} 題霸榜模式`,
    messages: [
      (streak: number) => `${streak} 題穩定輸出，題庫現在不是敵軍，是你的私人健身房。`,
      (streak: number) => `${streak} 題了，請低調，題目已經開始懷疑人生。`,
      (streak: number) => `${streak} 題火力全開，考場壓力被你反向面試。`,
    ],
  },
  {
    min: 50,
    level: "boss",
    tag: (streak: number) => `🏆 ${streak} 題主場優勢`,
    messages: [
      (streak: number) => `${streak} 題穩穩收，這不是手感，這是長期備考終於開始收利息。`,
      (streak: number) => `${streak} 題過關，題目已經從偷襲改成排隊報到。`,
      (streak: number) => `${streak} 題保持專注，三科看到你都自動站成一排。`,
    ],
  },
  {
    min: 30,
    level: "rocket",
    tag: (streak: number) => `🚀 ${streak} 題推進器`,
    messages: [
      (streak: number) => `${streak} 題推進中，這台備考引擎有點太順，記得不要超速。`,
      (streak: number) => `${streak} 題拿下，這波不是運氣，是知識點集體歸位。`,
      (streak: number) => `${streak} 題節奏在線，考場如果有雷達，現在應該會偵測到你。`,
    ],
  },
  {
    min: 15,
    level: "fire",
    tag: (streak: number) => `🔥 ${streak} 題燃燒中`,
    messages: [
      (streak: number) => `${streak} 題火力已開，法規條文都要坐正了。`,
      (streak: number) => `${streak} 題手感很燙，請用成績單承接。`,
      (streak: number) => `${streak} 題攻勢穩定，考前焦慮看到你都想請假。`,
    ],
  },
  {
    min: 7,
    level: "power",
    tag: (streak: number) => `⚡ ${streak} 題加速`,
    messages: [
      (streak: number) => `${streak} 題節奏起來了，現在是你在帶題目跑。`,
      (streak: number) => `${streak} 題不是猜，是觀念在自動導航。`,
      (streak: number) => `${streak} 題穩住，題庫正在小聲說：這人有備而來。`,
    ],
  },
  {
    min: 4,
    level: "focus",
    tag: (streak: number) => `✨ ${streak} 題上軌道`,
    messages: [
      (streak: number) => `${streak} 題連續穩答，手感加溫中，請繼續讓題目緊張。`,
      (streak: number) => `${streak} 題收下，這波有點帥，先不要太早下課。`,
      (streak: number) => `${streak} 題保持清醒，筆記本已經開始鼓掌。`,
    ],
  },
  {
    min: 2,
    level: "warming",
    tag: (streak: number) => `😎 ${streak} 題起手式`,
    messages: [
      (streak: number) => `${streak} 題穩答，這不是巧合，是準備開始兌現。`,
      (streak: number) => `${streak} 題到手，今天的你有點會。`,
      (streak: number) => `${streak} 題漂亮處理，題目剛想裝兇就被你識破。`,
    ],
  },
  {
    min: 1,
    level: "starter",
    tag: () => "✅ 答對",
    messages: [
      () => "答對！這題被你秒收，考場壓力少一格。",
      () => "命中！這個觀念先收進你的上榜裝備欄。",
      () => "漂亮，這題沒有掙扎太久就被你處理掉了。",
      () => "穩，這題已經從敵軍變成友軍。",
    ],
  },
];

const WRONG_MESSAGES = [
  "這題沒收下沒關係，現在抓到比考場踩雷划算。",
  "盲點已捕獲，解析看完就把它關進錯題籠。",
  "錯題不是敵人，是偽裝成分數的提醒。",
  "這題先記一筆，下次遇到它就讓它知道誰才是考生。",
  "被題目偷襲了？沒事，現在反查解析，等等反殺。",
  "今天錯在這裡，考場就少一個坑。這交易很划算。",
];

const NEUTRAL_MESSAGES = [
  "先暖機，一題一題把證照路鋪平。",
  "今日進度開跑，讓三科一起練核心。",
  "保持節奏，現在每一題都在替考場減壓。",
  "先別急著帥，穩穩選，分數會自己靠過來。",
  "題目已上桌，請用知識把它優雅處理掉。",
];

const WRONG_TAGS = ["🛠 補洞", "🧯 滅火", "🔍 抓盲點", "📌 訂正點"];
const NEUTRAL_TAGS = ["🎯 開練", "📚 備戰", "🧠 暖機", "🚦 起跑"];

type EncouragementNoteProps = {
  isCorrect?: boolean;
  seed: string | number;
  compact?: boolean;
  correctStreak?: number;
};

type EncouragementContent = {
  tag: string;
  message: string;
  level: CorrectTier["level"] | "wrong" | "neutral";
  milestone?: number;
};

export function EncouragementNote({ isCorrect, seed, compact = false, correctStreak = 0 }: EncouragementNoteProps) {
  const tone: EncouragementTone = isCorrect === true ? "correct" : isCorrect === false ? "wrong" : "neutral";
  const safeStreak = Math.max(0, Math.floor(correctStreak));
  const content = getEncouragementContent(tone, seed, safeStreak);
  const progress = tone === "correct" ? getStreakProgress(safeStreak) : 0;
  const showComboMeter = tone === "correct" && safeStreak >= 2;
  const className = [
    "encouragement-note",
    `encouragement-${tone}`,
    `encouragement-level-${content.level}`,
    content.milestone ? "encouragement-milestone" : "",
    compact ? "encouragement-compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} role="status" style={{ "--streak-progress": `${progress}%` } as CSSProperties}>
      {tone === "correct" && safeStreak >= 7 ? <span className="encouragement-spark encouragement-spark-a">✦</span> : null}
      {tone === "correct" && safeStreak >= 15 ? <span className="encouragement-spark encouragement-spark-b">✧</span> : null}
      <span className="encouragement-kicker">{content.tag}</span>
      <div className="encouragement-copy">
        <strong>{content.message}</strong>
        {showComboMeter ? (
          <span className="encouragement-meter" aria-label={`距離下一個 10 題成就 ${progress}%`}>
            <span className="encouragement-meter-bar" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function getEncouragementContent(tone: EncouragementTone, seed: string | number, correctStreak: number): EncouragementContent {
  const seedHash = hashSeed(`${seed}:${correctStreak}:${tone}`);

  if (tone === "correct") {
    const displayStreak = Math.max(correctStreak, 1);
    const milestone = getMilestone(displayStreak);
    if (milestone) {
      return {
        tag: milestone >= 100 ? `👑 ${milestone} 題傳說成就` : `🏅 ${milestone} 題成就`,
        message: MILESTONE_MESSAGES[milestone] ?? `${milestone} 題達成，題庫今天被你照顧得非常周到。`,
        level: getTier(displayStreak).level,
        milestone,
      };
    }

    const activeTier = getTier(displayStreak);
    const messageFactory = activeTier.messages[seedHash % activeTier.messages.length] ?? activeTier.messages[0]!;
    return {
      tag: activeTier.tag(displayStreak),
      message: messageFactory(displayStreak),
      level: activeTier.level,
    };
  }

  if (tone === "wrong") {
    return {
      tag: WRONG_TAGS[seedHash % WRONG_TAGS.length] ?? WRONG_TAGS[0]!,
      message: WRONG_MESSAGES[seedHash % WRONG_MESSAGES.length] ?? WRONG_MESSAGES[0]!,
      level: "wrong",
    };
  }

  return {
    tag: NEUTRAL_TAGS[seedHash % NEUTRAL_TAGS.length] ?? NEUTRAL_TAGS[0]!,
    message: NEUTRAL_MESSAGES[seedHash % NEUTRAL_MESSAGES.length] ?? NEUTRAL_MESSAGES[0]!,
    level: "neutral",
  };
}

function getTier(streak: number): CorrectTier {
  return CORRECT_TIERS.find((tier) => streak >= tier.min) ?? CORRECT_TIERS[CORRECT_TIERS.length - 1]!;
}

function getMilestone(streak: number): number | undefined {
  if (streak >= 10 && streak <= 200 && streak % 10 === 0) {
    return streak;
  }
  return undefined;
}

function getStreakProgress(streak: number): number {
  if (streak <= 0) {
    return 0;
  }
  if (streak % 10 === 0) {
    return 100;
  }
  return Math.max(12, Math.min(92, (streak % 10) * 10));
}

function hashSeed(seed: string | number): number {
  const text = String(seed);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}
