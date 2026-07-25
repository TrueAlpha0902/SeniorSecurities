#!/usr/bin/env python3
from __future__ import annotations
import copy, hashlib, json, re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'source-materials/securities-text-ocr-candidates.json'
OUT=ROOT/'build-data/securities-text-final.json'
AUDIT=ROOT/'docs/securities-text-reconciliation-audit.json'
OVERRIDE_OUT=ROOT/'docs/securities-text-manual-overrides.json'

REPLACEMENTS=[
 ('$§','§'),('凈','淨'),('産','產'),('覈','核'),('纔','才'),('衹','只'),('祕','秘'),('閤','合'),('資産','資產'),('羣','群'),('收人','收入'),('進人','進入'),('投人','投入'),('自已','自己'),('轉人','轉入'),('輸人','輸入'),('記人','記入'),
 ('每股浮值','每股淨值'),('市價浮值比','市價淨值比'),('浮值市價比','淨值市價比'),('股票浮值','股票淨值'),('公司浮值','公司淨值'),('其浮值','其淨值'),('基金浮資產','基金淨資產'),
 ('浮變現價值','淨變現價值'),('控制權益浮利益','控制權益淨利益'),('營業浮利','營業淨利'),('稅後浮利','稅後淨利'),('稅前浮利','稅前淨利'),('本期浮利','本期淨利'),('浮利率','淨利率'),('浮利','淨利'),('浮損','淨損'),('浮現金','淨現金'),
 ('Mla','M1a'),('Mlb','M1b'),('組閤','組合'),('適閤','適合'),('另+外','另外'),('浮現值','淨現值'),('銷貨收入浮額','銷貨收入淨額'),('買人','買入'),('計人','計入'),('列人','列入'),('納人','納入'),('匯人','匯入'),('歸人','歸入'),('由借人市場資金','由借入市場資金'),('向客戶借人有價證券','向客戶借入有價證券'),('活期償芸存款','活期儲蓄存款'),('浮值報酬率','淨值報酬率'),('證芬投頁顧問','證券投資顧問'),('證券投頁顧問','證券投資顧問'),('證券投資信計事業','證券投資信託事業'),
 # OCR occasionally reads the horizontal subtraction bar as the Chinese character "一".
 # These replacements are deliberately limited to explicit arithmetic phrases found in the scans.
 ('上漲家數總和一累計','上漲家數總和－累計'),
 ('上漲累計家數一某段','上漲累計家數－某段'),
 ('上漲累計家數一某','上漲累計家數－某'),
 ('內累計上漲家數)一 2,480','內累計上漲家數）－2,480'),
 ('內累計上漲家數）一 2,480','內累計上漲家數）－2,480'),
 ('流動資產一流動負債','流動資產－流動負債'),
 ('本期進貨一期末存貨','本期進貨－期末存貨'),
 ('銷貨收入一銷貨成本','銷貨收入－銷貨成本'),
 ('銷貨成本一利息費用','銷貨成本－利息費用'),
 ('總資產一流動負債一長期負債','總資產－流動負債－長期負債'),
 ('流動負債一長期負債','流動負債－長期負債'),
 ('20億元一長期負債','20億元－長期負債'),
 ('$25,000一 $24,000','$25,000－$24,000'),
 (')一 $500,000','）－$500,000'),
 ('）一 $500,000','）－$500,000'),
 ('銷貨收入一變動成本','銷貨收入－變動成本'),
 ('銷貨收入一固定成本','銷貨收入－固定成本'),
 ('銷貨收入一損益兩平銷貨收入','銷貨收入－損益兩平銷貨收入'),
 ('淨利一特別股股利','淨利－特別股股利'),
 ('K一g','K－g'),
 ('K一P','K－P'),
 ('權益一本期淨利','權益－本期淨利'),
 ('收盤價一N 日移動平均線指數','收盤價－N日移動平均線指數'),
 ('開盤價一收盤價','開盤價－收盤價'),
 ('標的漲停價一標的開盤參考價','標的漲停價－標的開盤參考價'),
 ('前一日權證收盤價一(標的開盤參考價一標的跌停價)','前一日權證收盤價－（標的開盤參考價－標的跌停價）'),
 ('前一日權證收盤價一（標的開盤參考價一標的跌停價）','前一日權證收盤價－（標的開盤參考價－標的跌停價）'),
 ('速動資產一X','速動資產－X'),
 ('本期賒銷額一收現數','本期賒銷額－收現數'),
 ('營業利益一利息費用','營業利益－利息費用'),
 ('預期報酬率一股利成長率','預期報酬率－股利成長率'),
 # Directly verified against project scan crops during the final rare-glyph audit.
 ('隻','只'),
 ('幹擾','干擾'),
 ('攻許','攻訐'),
 ('人帳成本','入帳成本'),
 ('公允價值人帳','公允價值入帳'),
 ('自登載之日起證至少','自登載之日起至少'),
 ('NIS為純益率','NI/S為純益率'),
 ('AE為權益乘數','A/E為權益乘數'),
 ('·','、'),
 # English terminology spacing verified directly against the project scan crops.
 # These exact replacements repair OCR word-boundary loss only; codes such as
 # twA-1, MMoU and DDoS are intentionally excluded.
 ('CallOption','Call Option'),
 ('FundofFunds','Fund of Funds'),
 ('YieldCurve','Yield Curve'),
 ('CallableBond','Callable Bond'),
 ('DiscountFactor','Discount Factor'),
 ('BasisPoint','Basis Point'),
 ('RepurchaseAgreement','Repurchase Agreement'),
 ('TermStructure','Term Structure'),
 ('IndexRate','Index Rate'),
 ('SmoothingMoving','Smoothing Moving'),
 ('SecondaryMoves','Secondary Moves'),
 ('DirectionalMovement','Directional Movement'),
 ('DeclineRatio','Decline Ratio'),
 ('RetentionRatio','Retention Ratio'),
 ('MarketPortfolio','Market Portfolio'),
 ('Well-DiversifiedPortfolio','Well-Diversified Portfolio'),
 ('LiquidityRisk','Liquidity Risk'),
 ('MomentumLifeCycle','Momentum Life Cycle'),
 ('MomentumLife Cycle','Momentum Life Cycle'),
 ('EfficientPortfolio','Efficient Portfolio'),
 ('BorrowingPosition','Borrowing Position'),
 ('SmartBeta','Smart Beta'),
 ('JensenIndex','Jensen Index'),
 ('TrackingError','Tracking Error'),
 ('Top-DownStrategy','Top-Down Strategy'),
 ('HedgeFund','Hedge Fund'),
 ('FeasibleSet','Feasible Set'),
 ('EfficientFrontier','Efficient Frontier'),
 ('HighYieldNotes','High Yield Notes'),
 ('HighYield Notes','High Yield Notes'),
 ('CurrentYield','Current Yield'),
 ('UnrealizedForeignExchangeGains','Unrealized Foreign Exchange Gains'),
 ('UnrealizedForeign Exchange Gains','Unrealized Foreign Exchange Gains'),
 ('RequiredRateofReturn','Required Rate of Return'),
 ('Required Rate ofReturn','Required Rate of Return'),
 ('LongCall','Long Call'),
 ('ShortCall','Short Call'),
 ('FinancialPlanning','Financial Planning'),
 ('LayeringStage','Layering Stage'),
 ('OneTimePassword-OTP','One Time Password-OTP'),
 ('MobileID','Mobile ID'),
 ("Managers'Index","Managers' Index"),
]

def normalize(s:str)->str:
    s=str(s or '').replace('\u3000',' ').replace('—','－')
    for a,b in REPLACEMENTS:s=s.replace(a,b)
    s=s.replace('《解析》','').replace('〈解析〉','')
    s=s.replace('「不止唯」','「不正確」')
    s=re.sub(r'[ \t]+',' ',s)
    # Chinese scan OCR often inserts a false line-break space inside a word
    # (for example「證券經紀 商」or「負債 比率」). Chinese prose does not
    # use such inter-character spaces, so remove them only when both adjacent
    # characters are CJK. Spaces around Latin text, numbers and Markdown remain.
    s=re.sub(r'(?<=[\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])','',s)
    # Preserve intentional paragraph and Markdown-table line breaks. Only
    # trim horizontal OCR spacing around punctuation and brackets.
    s=re.sub(r'[ \t]+([，。；：？！、])',r'\1',s)
    s=re.sub(r'([，。；：？！、])[ \t]+',r'\1',s)
    s=re.sub(r'([（(])[ \t]+',r'\1',s)
    s=re.sub(r'[ \t]+([）)])',r'\1',s)
    # In the legal scan pages, OCR frequently confused the section symbol with
    # a dollar sign immediately after the quoted statute name. Monetary values
    # do not occur in this exact context.
    s=re.sub(r'(?<=」)\$(?=\d)', '§', s)
    return s.strip()

def question_clean(s:str, number:int)->str:
    s=normalize(s)
    # Page-column clipping often keeps only the suffix of the printed number
    # (for example question 144 becomes "44.", and question 10 becomes
    # "0."). Remove the prefix only when the captured token is an exact
    # suffix of the canonical question number.
    m=re.match(r'^\)?\s*(\d{1,4})\s*[\.、]\s*',s)
    if m and str(number).endswith(m.group(1)):
        s=s[m.end():]
    else:
        # A single scan crop lost the punctuation after the printed question
        # number ("41 資本額…"). Remove this only when the token exactly
        # equals the canonical question number; no other source text is used.
        m_plain=re.match(r'^\)?\s*(\d{1,4})\s+(?=[^0-9])',s)
        if m_plain and m_plain.group(1)==str(number):
            s=s[m_plain.end():]
    return s.strip()

# Only fields below were manually transcribed or reformatted from the project scan crops.
OVERRIDES={
'investment-ch01-pdf-0004':{
 'question':'上市公司買回自己之股份配給員工認購時，一定會使公司之：',
 'options':{'1':'每股淨值減少','2':'淨值總額增加','3':'發行股數不變','4':'每股淨值增加'},
},
'investment-ch01-pdf-0008':{
 'question':'請依據下表回答問題：假設小明於第一年5月1日買入甲公司股票，於第三年5月1日賣出，請問小明的資本利得收益率為何？\n\n| 項目 | 第一年 | 第二年 | 第三年 |\n|---|---:|---:|---:|\n| 5月1日甲公司之股價 | 25 | 40 | 35 |\n| 該年年底發放之現金股利 | 0 | 3 | 2 |',
 'explanation':'資本利得收益率＝（賣出價格－買入價格）÷買入價格＝（35－25）÷25＝40%。',
},
'investment-ch01-pdf-0012':{
 'options':{'4':'1.25'},
 'explanation':'變異係數＝標準差÷平均數＝√0.25÷0.4＝1.25。',
},
'investment-ch01-pdf-0027':{
 'explanation':'依發行量加權方式，昨日兩股票市值合計為30×200＋10×400＝10,000，已知昨日指數為500，故基值為10,000÷500＝20。今日兩股票市值合計為28×200＋12×400＝10,400，因此今日股價指數＝10,400÷20＝520。',
},
'investment-ch01-pdf-0111':{
 'explanation':'第二年發放每張200股股票股利後，持股數變為原來的1.2倍。投資報酬率＝（P×1.2＋0.3）÷45－1＞20%，解得P＞44.75元，因此第三年初至少須以45元賣出。',
},
'investment-ch01-pdf-0116':{
 'question':'依據下表，大雄於第二年8月8日買入甲公司股票，第三年8月8日賣出，請問大雄的報酬率為何？\n\n| 項目 | 第一年 | 第二年 | 第三年 |\n|---|---:|---:|---:|\n| 8月8日甲公司之股價 | 12 | 35 | 30 |\n| 該年年底發放之現金股利 | 2 | 7 | 5 |',
 'explanation':'股票報酬率＝資本利得收益率＋股利收益率。資本利得收益率＝（30－35）÷35＝－14.29%；股利收益率＝7÷35＝20%；故報酬率＝－14.29%＋20%＝5.71%。',
},
'investment-ch02-pdf-0006':{
 'explanation':'深度折價債券在到期期間很長時，存續期間可能先上升後下降。例如票面利率4%、殖利率18%的深度折價債券，16年期的存續期間約為8.06年，17年期反而約為8.04年。',
},
'investment-ch02-pdf-0009':{
 'options':{'4':'990,137元'},
 'explanation':'支付金額＝1,000,000×[1－4%×（90÷365）]＝990,137元。',
},
'investment-ch02-pdf-0010':{
 'explanation':'附買回利息＝500,000×3.5%×（30÷365）＝1,438元。',
},
'investment-ch02-pdf-0011':{
 'explanation':'94,787＝100,000÷（1＋YTM），解得YTM＝5.5%，故預期報酬率為5.5%。',
},
'investment-ch02-pdf-0013':{
 'explanation':'到期支付金額＝5,000,000×[1＋3.5%×（90÷365）]＝5,043,151元。',
},
'investment-ch02-pdf-0020':{
 'explanation':'債券價格＝300÷（1＋5%）＋10,500÷（1＋5%）²，約為9,810元。',
},
'investment-ch02-pdf-0021':{
 'explanation':'以半年為一期，存續期間＝{[300÷1.05]×1＋[10,500÷1.05²]×2}÷9,810＝1.971期；換算為年約為1.971÷2＝0.985年。',
},
'investment-ch02-pdf-0022':{
 'explanation':'債券價格約為9,810元，存續期間約為0.985年。修正存續期間約為0.985÷（1＋10%÷2）＝0.938年；利率下降1%時，價格約上升9,810×0.938×1%＝92元。',
},
'investment-ch02-pdf-0024':{
 'explanation':'914＝1,000÷（1＋y）²，解得年殖利率y約為4.60%。',
},
'investment-ch02-pdf-0067':{
 'explanation':'依債券評價公式，債券市價取決於每期利息、面額、到期前期數及市場利率，因此甲、乙、丙皆有關。',
},
'investment-ch02-pdf-0079':{
 'options':{'4':'以上皆非'},
 'explanation':'轉換比率＝100,000÷40＝2,500股；轉換價值＝2,500×60＝150,000元，低於可轉債市價160,000元，因此沒有套利空間。',
},
'investment-ch02-pdf-0086':{
 'options':{'4':'5.51%'},
 'explanation':'依預期理論近似計算，二年期利率＝（第一年利率＋一年後預期一年期利率）÷2，因此5.13%＝（4.8%＋i₂）÷2，解得i₂＝5.46%。',
},
'investment-ch02-pdf-0126':{
 'explanation':'現值PV＝終值FV÷（1＋利率）ⁿ＝100,000÷（1＋6%）³＝83,962元。',
},
'investment-ch02-pdf-0139':{
 'explanation':'利息保障倍數及流動比率愈高，通常愈有利於債券評等；負債比率愈低通常愈佳。股票週轉率與債券評等較無直接關係。',
},
'investment-ch02-pdf-0141':{
 'explanation':'已知dP/dY＝－49，殖利率上升100個基點即1%，則價格變動dP＝－49×1%＝－0.49元，故債券價格約下跌0.49元。',
},
'investment-ch02-pdf-0143':{
 'explanation':'半年期實質利率＝1,000÷980－1＝2.04%；換算一年期約為2.04%×2＝4.08%。',
},
'investment-ch03-pdf-0001':{'explanation':'零成長股利折現模式：P＝D÷k＝2÷10%＝20元。'},
'investment-ch03-pdf-0007':{'explanation':'股東權益報酬率＝淨利率×資產週轉率×（1÷自有資金比率）＝4%×3.6×（1÷60%）＝24%。'},
'investment-ch03-pdf-0011':{'explanation':'零成長股利折現模式：P＝D÷k＝4÷10%＝40元。'},
'investment-ch03-pdf-0016':{'explanation':'股利殖利率＝預期現金股利÷買入價格＝4÷40＝10%。'},
'investment-ch03-pdf-0023':{'explanation':'股利永續成長模式P＝D₁÷（k－g）；當g＝0時，P＝D÷k，與一般特別股的評價方式相同。'},
'investment-ch03-pdf-0026':{'options':{'4':'市場風險變化'}},
'investment-ch03-pdf-0027':{'explanation':'P＝D₁÷（k－g）＝3×（1＋5%）÷（12%－5%）＝45元。'},
'investment-ch03-pdf-0029':{'explanation':'依單期報酬率公式，40＝（1＋P₁）÷（1＋20%），解得一年後股價P₁＝47元。'},
'investment-ch03-pdf-0032':{'explanation':'第三年底開始發放股利，因此第二年底股價P₂＝D₃÷（k－g）＝3÷（10%－4%）＝50元；目前價格P₀＝50÷（1＋10%）²＝41.32元。'},
'investment-ch03-pdf-0033':{'options':{'4':'5元'},'explanation':'股利成長率g＝ROE×（1－股利發放率）＝ROE×（1－D₁÷EPS₁）。代入8%＝20%×（1－3÷EPS₁），解得EPS₁＝5元。'},
'investment-ch03-pdf-0038':{'explanation':'永續成長模式P＝D₁÷（k－g）。若股利成長率g高於或等於要求報酬率k，分母非正，不適合使用永續成長模式。'},
'investment-ch03-pdf-0039':{'explanation':'除權參考價＝100÷（1＋15%＋10%）＝80元。'},
'investment-ch03-pdf-0043':{'explanation':'合理本益比可由股利發放率、預期股利成長率及要求報酬率推估；公司已發行股數不是此公式的必要數據。'},
'investment-ch03-pdf-0044':{'explanation':'本益比P/E＝d×（1＋g）÷（k－g）。依序計算：甲為11.4倍、乙為8倍、丙為6.6倍，因此甲公司最高。'},
'investment-ch03-pdf-0045':{'explanation':'P＝D₁÷（k－g）＝3×（1＋6%）÷（10%－6%）＝79.5元。'},
'investment-ch03-pdf-0052':{'question':'甲公司股票淨值市價比（book-to-market ratio）為3倍，每股市價為5元，試問每股淨值為何？'},
'investment-ch04-pdf-0061':{'explanation':'道氏理論中，是以指數來告訴投資人主要的市場趨勢方向。'},
'investment-ch04-pdf-0082':{'question':'圖表型態解析的技術分析，是運用股價變化走勢所構成的各種圖形，以推測未來股價的變動趨勢。下列何者屬於圖表型態？','explanation':'KD、OBV、RSI皆為技術指標；W底屬於圖表型態。'},
'investment-ch04-pdf-0114':{'explanation':'當大盤下跌時，今日OBV應減去今日成交股數。'},
'investment-ch04-pdf-0117':{'explanation':'VR以一定期間內上漲日、下跌日及平盤日的成交值計算，用來研判市場超買或超賣。'},
'investment-ch04-pdf-0128':{'explanation':'日K線若開盤價高於收盤價，實體為黑色，因此選項（3）的描述不正確。'},
'investment-ch05-pdf-0001':{'question':'供給面經濟學強調：'},
'investment-ch05-pdf-0028':{'options':{'4':'活期儲蓄存款'},'explanation':'M1a＝通貨發行淨額＋活期存款＋支票存款；M1b＝M1a＋活期儲蓄存款。'},
'investment-ch05-pdf-0037':{'options':{'4':'25'},'explanation':'利息保障倍數＝息前稅前純益（EBIT）÷利息費用＝200萬元÷50萬元＝4倍。'},
'investment-ch05-pdf-0071':{'explanation':'以美元計價的GNP成長率，約等於以新臺幣計價的GNP成長率減去新臺幣貶值率。當貶值幅度大於經濟成長率時，以美元計算的每人GNP會減少。'},
'investment-ch05-pdf-0087':{'explanation':'單期報酬率＝（賣出價格－買入價格＋股利）÷買入價格＝（64－60＋2）÷60＝10%。'},
'investment-ch05-pdf-0101':{'question':'假設汪洋公司之淨利率為5%、資產週轉率為1.2、自有資金比率為50%，請問目前該公司之股東權益報酬率為何？','explanation':'股東權益報酬率＝淨利率×資產週轉率×（1÷自有資金比率）＝5%×1.2×（1÷50%）＝12%。'},
'investment-ch05-pdf-0113':{'options':{'4':'甲、乙、丙都不需要考慮'},'explanation':'現金增資除權參考價須考慮除權前一日收盤價、現金增資發行價格及現金增資配股率；題目所稱「除權日之收盤價」不是計算基礎。'},
'investment-ch05-pdf-0125':{'options':{'4':'股東權益報酬率／資產報酬率'},'explanation':'權益乘數＝資產÷股東權益；又ROE＝ROA×權益乘數，因此權益乘數＝ROE÷ROA。'},
'investment-ch05-pdf-0128':{'options':{'1':'稅後淨利／股東權益'},'explanation':'股東權益報酬率（ROE）＝稅後淨利÷平均股東權益。依杜邦分析，ROE與淨利率、資產週轉率及財務槓桿均有關，因此總資產報酬率的高低也會影響ROE。'},
'investment-ch06-pdf-0005':{'options':{'4':'－0.04'},'explanation':'共變異數＝相關係數×甲標準差×乙標準差＝－1×0.20×0.10＝－0.02。'},
'investment-ch06-pdf-0006':{'explanation':'完全負相關時，無風險組合須使W甲×0.20＝W乙×0.10，且W甲＋W乙＝1，解得W甲＝1/3、W乙＝2/3，因此比重為1：2。'},
'investment-ch06-pdf-0009':{'options':{'4':'－0.46'},'explanation':'相關係數的範圍為－1至＋1，因此1.84不可能。'},
'investment-ch06-pdf-0012':{'options':{'4':'無任何限制'},'explanation':'β＝Cov（Ri，Rm）÷Var（Rm）。β可能大於、等於或小於1，也可能為負值，因此沒有固定範圍限制。'},
'investment-ch06-pdf-0040':{'explanation':'標準差衡量資料相對平均值的離散程度。無風險資產的報酬固定，因此報酬率標準差為0。'},
'investment-ch06-pdf-0053':{'question':'請依據下表判斷甲、乙、丙、丁四個投資組合中，哪一個是無效率投資組合？\n\n| 投資組合 | 甲 | 乙 | 丙 | 丁 |\n|---|---:|---:|---:|---:|\n| 預期報酬率 | 10% | 12.5% | 15% | 17% |\n| 標準差 | 0.18 | 0.20 | 0.25 | 0.23 |','options':{'4':'丁'},'explanation':'比較丙與丁，丁的預期報酬率較高且標準差較低，表示丙被丁支配，因此丙為無效率投資組合。'},
'investment-ch06-pdf-0062':{'options':{'4':'1.33'},'explanation':'β＝相關係數×個股報酬率標準差÷市場報酬率標準差＝1×15%÷10%＝1.5。'},
'investment-ch06-pdf-0067':{'explanation':'相關係數介於－1與＋1之間；高度正相關應為接近＋1的正數，因此0.85最能代表。'},
'investment-ch06-pdf-0077':{'options':{'4':'0.5'},'explanation':'市場投資組合與自身的共變異數等於市場報酬率變異數，因此其β係數為1。'},
'investment-ch06-pdf-0078':{'explanation':'同一證券與自身的報酬率相關係數必為1。'},
'investment-ch06-pdf-0092':{'explanation':'兩種股票報酬率的相關係數ρ＝1時，所有投資組合點落在一直線上；－1＜ρ＜1時通常形成曲線。'},
'investment-ch07-pdf-0010':{'explanation':'依CAPM：E（Ri）＝Rf＋βi[E（Rm）－Rf]。代入13%＝5%＋βi（15%－5%），解得βi＝0.8。'},
'investment-ch07-pdf-0032':{'explanation':'效率投資組合位於資本市場線。市場標準差＝√0.04＝0.2，投資組合P標準差＝√0.16＝0.4；E（Rp）＝2%＋[(12%－2%)÷0.2]×0.4＝22%。'},
'investment-ch07-pdf-0034':{'explanation':'高度相關表示投資組合與市場報酬率的相關係數高，但不能直接推出β、標準差或期望報酬率一定高。高度分散的投資組合通常非系統風險較小。'},
'investment-ch07-pdf-0036':{'explanation':'依CAPM，E（Ri）＝Rf＋βi[E（Rm）－Rf]。若期望報酬率低於無風險利率，βi必須為負。'},
'investment-ch07-pdf-0074':{'question':'某股票與股價指數過去6年之報酬率資料如下，請問該股票的β係數及其與市場報酬率的相關係數，分別最接近哪一組數值？\n\n| 年度 | 1 | 2 | 3 | 4 | 5 | 6 |\n|---|---:|---:|---:|---:|---:|---:|\n| 股票報酬率 | －4% | 4% | －5% | 2% | －5% | －4% |\n| 股票指數報酬率 | 8% | －8% | 10% | －5% | 12% | 7% |','options':{'4':'－1.0、＋1.0'},'explanation':'股票報酬率約為市場報酬率的－0.5倍，因此β約為－0.5；兩者方向完全相反，相關係數約為－1。'},
'investment-ch07-pdf-0084':{'options':{'4':'證券市場線'},'explanation':'在報酬率－標準差圖中，連接無風險利率與市場投資組合的直線為資本市場線（CML）。'},
'investment-ch07-pdf-0088':{'question':'假設有一效率投資組合之預期報酬率為12%、報酬率標準差為15%，請問下表哪一項投資組合也可能是效率投資組合？\n\n| 投資組合 | 甲 | 乙 | 丙 |\n|---|---:|---:|---:|\n| 預期報酬率 | 12% | 10% | 15% |\n| 報酬率標準差 | 18% | 15% | 18% |','options':{'4':'甲、乙、丙皆非'},'explanation':'甲在相同報酬下風險較高，乙在相同風險下報酬較低，皆非效率組合；丙的報酬與風險均較高，可能位於效率前緣。'},
'investment-ch07-pdf-0095':{'question':'何者「不是」資本資產定價模式（CAPM）的基本假設？甲、存在無風險利率的情形；乙、證券具有不可分割特性；丙、證券資訊取得沒有成本；丁、沒有稅賦存在。','explanation':'CAPM的基本假設包括：沒有交易成本、資產可無限分割、可用無風險利率無限制地借貸、沒有稅賦，以及投資人具有理性。因此「證券具有不可分割特性」不是其基本假設。'},
'investment-ch07-pdf-0103':{'options':{'4':'小於0'},'explanation':'資本市場線上介於無風險利率與市場投資組合之間的組合，是由無風險資產與市場投資組合共同構成，因此市場投資組合的權重介於0與100%之間。'},
'investment-ch07-pdf-0109':{'question':'對一位風險趨避（Risk Aversion）的投資者而言，投資一風險性投資組合：'},
'investment-ch07-pdf-0114':{'options':{'4':'16.25%'},'explanation':'市場標準差＝√16%＝40%，甲的標準差＝√25%＝50%。依資本市場線，E（R甲）＝6%＋[(12%－6%)÷40%]×50%＝13.5%。'},
'investment-ch07-pdf-0117':{'options':{'4':'CML是用總風險，SML是用系統風險'},'explanation':'資本市場線（CML）以報酬率標準差衡量總風險；證券市場線（SML）以β衡量系統風險。'},
'investment-ch07-pdf-0118':{'question':'關於效率投資組合之敘述，何者「不正確」？','options':{'1':'效率投資組合必落於SML上','2':'效率投資組合必落於CML上','3':'在SML上之投資組合皆為效率投資組合','4':'在CML上之投資組合皆為效率投資組合'},'explanation':'SML上的投資組合可能是非效率投資組合，因此在SML上的投資組合不一定都是效率投資組合。'},
'investment-ch08-pdf-0021':{'options':{'4':'混合型'}},
'investment-ch08-pdf-0043':{'options':{'4':'超額報酬／無風險利率'},'explanation':'夏普指標＝（投資組合報酬率－無風險利率）÷投資組合報酬率標準差，即超額報酬除以總風險。'},
'investment-ch08-pdf-0044':{'explanation':'選股時配置性質不同的股票，可分散非系統風險，避免投資組合風險過度集中。'},
'investment-ch08-pdf-0107':{'explanation':'本基金受益憑證的漲跌幅限制為20%，因此「漲跌幅限制為10%」不正確。'},
'investment-ch08-pdf-0114':{'options':{'4':'2%'},'explanation':'臺灣50指數先跌10%再漲10%，100×0.9×1.1＝99，指數累計報酬率為－1%；反向1倍ETF的每日報酬方向相反，兩日淨值為100×1.1×0.9＝99，累計報酬率亦為－1%。'},
'investment-ch08-pdf-0117':{'explanation':'選項（2）（3）（4）皆為開放型基金的特點；開放型基金的發行規模並非固定。'},
'financial-analysis-ch01-pdf-0005':{'options':{'4':'基期與比較年的金額相當接近'}},
'financial-analysis-ch01-pdf-0021':{'explanation':'財務報表的五項基本要素為資產、負債、權益、收益及費損；來自營業活動的現金流量不是財務報表要素。'},
'financial-analysis-ch02-pdf-0050':{'question':'下列敘述何者正確？','options':{'1':'商店於籌備期間購買設備應記入「開辦費」帳戶','2':'應付費用是指已發生且已付現的費用','3':'有追索權之應收票據貼現會產生負債','4':'將資本支出誤作為收益支出，將使該期間淨利增加'}},
'financial-analysis-ch02-pdf-0051':{'options':{'4':'8'},'explanation':'短期涵蓋比率＝速動資產÷平均每天現金費用＝7,000÷[（285,000＋100,000－20,000）÷365]＝7。'},
'financial-analysis-ch02-pdf-0070':{'question':'甲公司所持有以外幣計價之存貨，以現時匯率及歷史匯率轉換為功能性貨幣後之金額如下：存貨成本以現時匯率換算為78,000元、以歷史匯率換算為81,250元；存貨淨變現價值以現時匯率換算為75,000元、以歷史匯率換算為71,500元。請問甲公司當年底資產負債表中存貨之餘額應為多少？'},
'financial-analysis-ch04-pdf-0044':{'options':{'4':'$23,475,000'}},
'financial-analysis-ch06-pdf-0026':{'question':'某公司的負債比率為0.6，總資產週轉率為3。若公司的權益報酬率為15%，公司的淨利率為何？','options':{'4':'5%'},'explanation':'權益報酬率＝淨利率×總資產週轉率×（平均資產總額÷平均權益）。負債比率為0.6，故權益比率為0.4。15%＝淨利率×3×（1÷0.4），解得淨利率＝2%。'},
'financial-analysis-ch07-pdf-0080':{'explanation':'「本期損益」應在期末結轉入保留盈餘。'},
'financial-analysis-ch07-pdf-0081':{'options':{'1':'本期淨損'},'explanation':'前期淨利低估應作前期損益調整，增加期初保留盈餘。'},
'financial-analysis-ch07-pdf-0110':{'explanation':'銷貨折扣應列為銷貨收入的減項，而非銷售費用。'},
'financial-analysis-ch07-pdf-0122':{'explanation':'以前年度損益錯誤的更正列入前期損益調整，不列入本期損益，因此不影響本期淨利率。'},
'financial-analysis-ch07-pdf-0128':{'explanation':'停業單位損益在損益表上以稅後金額表達。'},
'financial-analysis-ch07-pdf-0129':{'options':{'4':'選項（1）（2）（3）皆非'},'explanation':'邊際貢獻率＝邊際貢獻÷銷貨收入×100%。邊際貢獻＝100,000×60%＝60,000元。令固定成本及費用為X，營運槓桿度＝60,000÷（60,000－X）＝2，解得X＝30,000元。'},
'financial-analysis-ch08-pdf-0002':{'options':{'4':'$2.95'},'explanation':'X0年加權平均流通在外股數，須追溯調整11月1日的1.5倍股票分割，計算為335,000股；每股盈餘＝800,000÷335,000＝2.39元。'},
'financial-analysis-ch09-pdf-0007':{'explanation':'日常銷貨及購買生產用原料屬經常性活動；地震損失與折舊方法改變屬非經常性項目，因此為甲、丙。'},
'financial-analysis-ch09-pdf-0015':{'options':{'1':'稅後淨利','2':'營業淨利'}},
'financial-analysis-ch10-pdf-0002':{'question':'下列何者不影響每期淨現金流量？'},
'financial-analysis-ch10-pdf-0060':{'options':{'4':'甲和乙都對'},'explanation':'本益比＝每股市價÷每股盈餘。折舊政策與利息是否資本化都會影響每股盈餘，因此都會影響本益比。'},
'financial-analysis-ch10-pdf-0126':{'options':{'4':'淨利的增加'}},
'financial-analysis-ch10-pdf-0153':{'explanation':'每股現金股利＝EPS×股利分配率＝8×40%＝3.2元。'},
'financial-analysis-ch10-pdf-0154':{'options':{'4':'可轉換公司債轉換股票之權證'}},
'securities-trading-regulations-ch01-pdf-0147':{'question':'股份有限公司之少數股東在具備以下何項資格時，得以書面記明提議事項及理由，請求董事會召集股東臨時會？','options':{'1':'繼續一年以上，持有已發行股份總數3%以上股份','2':'繼續六個月以上，持有已發行股份總數3%以上股份','3':'繼續一年以上，持有已發行股份總數1%以上股份','4':'繼續六個月以上，持有已發行股份總數1%以上股份'}},
'securities-trading-practice-ch01-pdf-0032':{'options':{'3':'兩年'}},
'securities-trading-practice-ch09-pdf-0077':{'options':{'1':'五百單位'}},
'securities-trading-practice-ch10-pdf-0085':{'options':{'4':'選項（1）（2）（3）皆是'}},
'investment-ch02-pdf-0067':{'options':{'4':'甲、乙、丙'}},
'investment-ch02-pdf-0126':{'options':{'4':'79,383元'}},
'investment-ch02-pdf-0141':{'options':{'4':'上漲4.9元'}},
'investment-ch03-pdf-0007':{'options':{'4':'40%'}},
'investment-ch03-pdf-0016':{'options':{'4':'5%'}},
'investment-ch03-pdf-0023':{'options':{'4':'零息債券'}},
'investment-ch03-pdf-0027':{'options':{'4':'16.67元'}},
'investment-ch03-pdf-0043':{'options':{'4':'速動比率'}},
'investment-ch03-pdf-0044':{'options':{'4':'無法比較'}},
'investment-ch03-pdf-0045':{'options':{'4':'79.5元'}},
'investment-ch04-pdf-0023':{'options':{'4':'屬強烈之反轉下跌訊號'}},
'investment-ch07-pdf-0086':{'options':{'4':'選項（1）（2）（3）皆非'}},
'financial-analysis-ch07-pdf-0001':{'options':{'4':'選項（1）（2）（3）皆非'},'explanation':'綜合槓桿度＝Q（P－V）÷[Q（P－V）－F－I]＝56,000×（10－7）÷[56,000×（10－7）－80,000－5,000]＝2.02。'},
'financial-analysis-ch07-pdf-0072':{'options':{'4':'兩年間，平均每年成長100%'},'explanation':'兩年間平均年成長率＝√（80億元÷40億元）－1＝√2－1，約為41%。'},
'financial-analysis-ch04-pdf-0073':{'explanation':'成本法處理庫藏股時，以買回股票的成本借記「庫藏股」，列為權益減項，因此投入資本總額會減少。'},
'financial-analysis-ch06-pdf-0009':{'explanation':'權益報酬率＝總資產報酬率＋（總資產報酬率－舉債成本）×負債權益比＝22%＋（22%－2%）×0.2＝26%。'},
'financial-analysis-ch10-pdf-0049':{'explanation':'公司整體β＝負債權重×負債β＋權益權重×權益β＝（200÷500）×0.6＋（300÷500）×1.5＝1.14。'},
'financial-analysis-ch10-pdf-0057':{'options':{'4':'$1,000'}},
'securities-trading-practice-ch09-pdf-0038':{
 'question':'若一檔證券最佳五檔價量如下表，在逐筆交易時段內某人以市價買入20張，若此期間內沒有其他人下單或取消下單，某人交易結果為何？\n\n| 買進價格 | 買進張數 | 賣出價格 | 賣出張數 |\n|---:|---:|---:|---:|\n| 18.62 | 17 | 18.63 | 17 |\n| 18.61 | 7 | 18.64 | 8 |\n| 18.60 | 5 | 18.65 | 6 |\n| 18.59 | 2 | 18.66 | 3 |\n| 18.58 | 1 | 18.67 | 1 |',
 'options':{'1':'僅17張以18.63元成交','2':'僅17張以18.62元成交','3':'17張以18.63元成交、3張以18.64元成交','4':'17張以18.62元成交、3張以18.61元成交'}},
'securities-trading-practice-ch09-pdf-0039':{
 'question':'若一檔證券最佳五檔價量如下表，在逐筆交易時段內某人以市價賣出20張，若此期間內沒有其他人下單或取消下單，某人交易結果為何？\n\n| 買進價格 | 買進張數 | 賣出價格 | 賣出張數 |\n|---:|---:|---:|---:|\n| 18.62 | 17 | 18.63 | 17 |\n| 18.61 | 8 | 18.64 | 7 |\n| 18.60 | 6 | 18.65 | 5 |\n| 18.59 | 3 | 18.66 | 2 |\n| 18.58 | 1 | 18.67 | 1 |',
 'options':{'1':'僅17張以18.63元成交','2':'僅17張以18.62元成交','3':'17張以18.63元成交、3張以18.64元成交','4':'17張以18.62元成交、3張以18.61元成交'}},
'securities-trading-practice-ch09-pdf-0042':{
 'question':'若一檔證券最佳五檔價量如下表，在逐筆交易時段內甲以市價賣出18張，乙同時以限價18.60元賣出5張，若此期間內沒有其他人下單或取消下單，乙之成交價格將為何？\n\n| 買進價格 | 買進張數 | 賣出價格 | 賣出張數 |\n|---:|---:|---:|---:|\n| 18.62 | 17 | 18.63 | 17 |\n| 18.61 | 8 | 18.64 | 7 |\n| 18.60 | 6 | 18.65 | 5 |\n| 18.59 | 3 | 18.66 | 2 |\n| 18.58 | 1 | 18.67 | 1 |',
 'options':{'4':'18.60元'}},
'securities-trading-practice-ch09-pdf-0043':{
 'question':'若一檔證券最佳五檔價量如下表，在逐筆交易時段內甲以市價賣出20張，乙同時以限價18.61元賣出15張，若此期間內沒有其他人下單或取消下單，乙可立即成交幾張？\n\n| 買進價格 | 買進張數 | 賣出價格 | 賣出張數 |\n|---:|---:|---:|---:|\n| 18.62 | 17 | 18.63 | 17 |\n| 18.61 | 8 | 18.64 | 7 |\n| 18.60 | 6 | 18.65 | 5 |\n| 18.59 | 3 | 18.66 | 2 |\n| 18.58 | 1 | 18.67 | 1 |',
 'options':{'4':'15張'}},
}


# Additional fields transcribed directly from the same project scan crops during
# the final high-risk review.  These replace formula/table OCR artifacts and
# page-number noise; no external text source is used.
def merge_overrides(patch: dict[str, dict]) -> None:
    for question_id, fields in patch.items():
        current = OVERRIDES.setdefault(question_id, {})
        for field, value in fields.items():
            if field == "options":
                current.setdefault("options", {}).update(value)
            else:
                current[field] = value


merge_overrides({
'investment-ch04-pdf-0011': {
 'question': '下列有關MACD（Moving Average Convergence and Divergence）之敘述何者「不正確」？',
 'options': {
   '1': 'MACD是收斂與發散的移動平均線',
   '2': '其功能在於運用短期移動平均線和長期移動平均線二者間之關係，來研判買賣的時機',
   '3': '其值大於零時表示熊市',
   '4': '當市場行情有所轉折時，DIF（差離值）之絕對值均會縮小',
 },
 'explanation': 'MACD利用兩條速度不同的指數平滑移動平均線EMA（Exponential Moving Average），計算兩者之間的差離作為研判行情的基礎。EMAₜ＝[(t－1)÷t]×EMAₜ₋₁＋(1÷t)×Pₜ，其中Pₜ＝C×1/2＋H×1/4＋L×1/4（C為收盤價、H為最高價、L為最低價）；DIF（差離值）＝12日EMA－26日EMA。MACD值為DIF的9日平均值，其值大於零時表示牛市。',
},
'investment-ch04-pdf-0023': {
 'question': '關於下列圖型之敘述，何者「不正確」？\n\n【圖形文字描述】股價高低點在先擴張、後收斂的兩條虛線趨勢線內反覆波動，整體外形呈菱形（鑽石形）。',
 'options': {
   '1': '此為箱型整理圖',
   '2': '此為菱形，又稱鑽石形',
   '3': '多出現在漲升之後的高檔價位',
   '4': '屬強烈之反轉下跌訊號',
 },
 'explanation': '圖中為菱形（鑽石形）反轉型態，多出現在上漲後的高檔區，通常屬較強烈的反轉下跌訊號；不是箱型整理圖。',
},
'investment-ch06-pdf-0029': {
 'question': '下列何者可衡量投資風險？',
 'options': {'1': '標準差', '2': '報酬率', '3': '本益比', '4': '移動平均數'},
 'explanation': '標準差可衡量報酬率相對平均值的離散程度，用於衡量投資的總風險。報酬率是投資收益率；本益比為每股市價÷每股盈餘（EPS）；移動平均數則是技術分析工具。',
},
'investment-ch07-pdf-0109': {
 'question': '對一位風險趨避（Risk Aversion）的投資者而言，投資一風險性投資組合：',
 'options': {
   '1': '會要求風險溢酬（Risk Premium）',
   '2': '只要求無風險報酬率',
   '3': '只要求與市場相同之報酬率',
   '4': '根本不會投資任何風險性資產',
 },
 'explanation': '投資理論通常假設投資人為風險趨避者。依CAPM，E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]；對βᵢ＞0的風險性資產，投資人會要求βᵢ[E（R_m）－R_f]的風險溢酬。',
},
'financial-analysis-ch05-pdf-0022': {
 'question': '甲公司X1年底之負債、權益及X1年損益資料如下，則其X1年利息保障倍數（Times Interest Earned）為若干？\n\n| 項目 | 金額／比率 | 項目 | 金額／比率 |\n|---|---:|---|---:|\n| 應付公司債，8% | $1,000,000 | 稅前淨利 | $200,000 |\n| 特別股，10%，面額$10（不可贖回，無積欠股利） | $200,000 | 所得稅率 | 17% |\n| 普通股，面額$10 | $500,000 | 稅後淨利 | $166,000 |\n| 保留盈餘 | $350,000 |  |  |',
 'options': {'1': '3.5', '2': '2.5', '3': '2.33', '4': '1.875'},
 'explanation': '利息費用＝$1,000,000×8%＝$80,000。利息保障倍數＝（稅前淨利＋利息費用）÷利息費用＝（$200,000＋$80,000）÷$80,000＝3.5。',
},
'financial-analysis-ch08-pdf-0016': {
 'question': '田中公司於X1年1月1日按溢價20%發行20,000股、每股面值$10的普通股。若X1年12月14日發放10%股票股利，則該項股票股利將造成12月31日結帳時：',
 'options': {
   '1': '流動負債增加與保留盈餘減少',
   '2': '權益不變與股本增加',
   '3': '權益增加與保留盈餘減少',
   '4': '每股面值下跌與流通在外股數增加',
 },
 'explanation': 'X1年12月14日發放10%股票股利，因低於20%（或25%），屬小額股票股利。分錄會以市價減少保留盈餘，並以面值增加分配股票股利、以差額增加資本公積—股票股利；權益內部重分類，權益總額不變，股本增加。',
},
'financial-analysis-ch10-pdf-0006': {
 'question': '今有一投資計畫之現金流量與獲利指數如下：\n\n| t＝1 | t＝2 | t＝3 | PI |\n|---:|---:|---:|---:|\n| －2 | 9 | 3 | 0.8 |\n\n若資金成本為12%，請問公司應：',
 'options': {'1': '接受該計畫', '2': '無法判斷', '3': '拒絕該計畫', '4': '接受或拒絕對股東財富並無影響'},
 'explanation': '獲利指數PI小於1時，表示現金流入現值小於投資成本，淨現值為負，因此應拒絕該投資計畫。',
},
'securities-trading-practice-ch05-pdf-0013': {
 'question': '在美國紐約證券交易所上市交易之存託憑證為何？',
 'options': {'1': '全球存託憑證', '2': '臺灣存託憑證', '3': '新加坡存託憑證', '4': '美國存託憑證'},
 'explanation': '在美國紐約證券交易所上市交易之存託憑證為美國存託憑證（ADR）。',
},
'securities-trading-practice-ch13-pdf-0015': {
 'question': '有關證券經紀商手續費敘述，以下何者正確？',
 'options': {'1': '只對賣出收取', '2': '收取上限為3.0‰', '3': '只對買進收取', '4': '可以有折扣空間'},
 'explanation': '證券經紀商收取證券交易手續費，得按客戶成交金額自行訂定費率標準，另得訂定折讓及每筆委託最低費用，但上限為1.425‰；買進與賣出時各計算一次。',
},
# Resolve scan-printed cross-references into self-contained learner text.
'securities-trading-practice-ch01-pdf-0021': {
 'explanation': '依「證券商提供數位服務作業指引」第4條，數位服務得提供客戶諮詢、處理消費爭議與建言，並被動提供金融商品、交易平臺、證券業務活動及市場訊息；不得提供投資組合建議、接受客戶委託買賣有價證券，亦不得接受客戶親臨申辦或洽談業務。',
},
'securities-trading-practice-ch07-pdf-0007': {
 'explanation': '依「公開發行公司出席股東會使用委託書規則」，徵求人違反主管機關處分未逾三年者不得擔任徵求人；徵求人應依股東委託出席股東會。委託書應由委託人親自填具徵求人或受託代理人姓名；徵求人應於徵求委託書上簽名或蓋章，並加蓋徵求場所章戳，由辦理徵求事務之人員簽名或蓋章，且不得轉讓他人使用。',
},
'securities-trading-practice-ch09-pdf-0022': {
 'explanation': '依「臺灣證券交易所有價證券上市審查準則」第26條，外國發行人依註冊地國法律發行之股票或表彰其股票之有價證券，在申請臺灣存託憑證上市前，若已於主管機關核定之海外證券市場主板掛牌交易，並無上市滿一定期間之限制。',
},
'securities-trading-practice-ch09-pdf-0047': {
 'explanation': '依「臺灣證券交易所營業細則」第58條之8，限價買進得在限價或更低價格成交，限價賣出得在限價或更高價格成交；市價委託未限定價格，得在當日升降幅度內成交。當日有效委託未一次全部成交時，未成交餘量在當日仍有效；立即成交否則取消委託若未能於當次撮合全部成交，未成交餘量即取消。',
},
'securities-trading-practice-ch10-pdf-0090': {
 'explanation': '依「櫃買中心證券商營業處所買賣有價證券業務規則」第79條，證券自營商辦理債券附條件買賣時，應在買賣成交單約定買回或賣回日期及價格。除兼營證券業務之金融機構另依銀行法辦理外，附買回及附賣回交易餘額各不得超過該證券商淨值六倍，約定期間不得超過一年。',
},
'securities-trading-practice-ch11-pdf-0028': {
 'explanation': '依「證券商辦理有價證券買賣融資融券業務操作辦法」第70條，委託人應事先與證券商簽訂概括授權同意書，始得就同日融資買進與融券賣出同種上市（櫃）有價證券採資券相抵交割。若不欲就相抵後餘額交割，須於成交當日收盤前以書面向證券商說明。相抵部分不計算融資融券利息，融券仍計收融券手續費或融券費；依同辦法第71條，資券相抵交易仍列入單日買賣額度計算。',
},
})


# Merge fields that appeared in separate scan-review passes.  A Python dict
# literal keeps only its last duplicate key, so the complete merged records are
# applied here explicitly.
merge_overrides({
'investment-ch02-pdf-0067': {'options': {'4': '甲、乙、丙'}, 'explanation': '依債券評價公式，債券市價取決於每期利息、面額、到期前期數及市場利率，因此甲、乙、丙皆有關。'},
'investment-ch02-pdf-0126': {'options': {'4': '79,383元'}, 'explanation': '現值PV＝終值FV÷（1＋利率）ⁿ＝100,000÷（1＋6%）³＝83,962元。'},
'investment-ch02-pdf-0141': {'options': {'4': '上漲4.9元'}, 'explanation': '已知dP/dY＝－49，殖利率上升100個基點即1%，則價格變動dP＝－49×1%＝－0.49元，故債券價格約下跌0.49元。'},
'investment-ch03-pdf-0007': {'options': {'4': '40%'}, 'explanation': '股東權益報酬率＝淨利率×資產週轉率×（1÷自有資金比率）＝4%×3.6×（1÷60%）＝24%。'},
'investment-ch03-pdf-0016': {'options': {'4': '5%'}, 'explanation': '股利殖利率＝預期現金股利÷買入價格＝4÷40＝10%。'},
'investment-ch03-pdf-0023': {'options': {'4': '零息債券'}, 'explanation': '股利永續成長模式P＝D₁÷（k－g）；當g＝0時，P＝D÷k，與一般特別股的評價方式相同。'},
'investment-ch03-pdf-0027': {'options': {'4': '16.67元'}, 'explanation': 'P＝D₁÷（k－g）＝3×（1＋5%）÷（12%－5%）＝45元。'},
'investment-ch03-pdf-0043': {'options': {'4': '速動比率'}, 'explanation': '合理本益比可由股利發放率、預期股利成長率及要求報酬率推估；公司已發行股數不是此公式的必要數據。'},
'investment-ch03-pdf-0044': {'options': {'4': '無法比較'}, 'explanation': '本益比P/E＝d×（1＋g）÷（k－g）。依題目資料計算：甲公司為40%×（1＋14%）÷（18%－14%）＝11.4倍；乙公司為50%×（1＋12%）÷（18%－12%）＝9.33倍；丙公司為60%×（1＋10%）÷（18%－10%）＝8.25倍，因此甲公司最高。'},
'investment-ch03-pdf-0045': {'options': {'4': '79.5元'}, 'explanation': 'P＝D₁÷（k－g）＝3×（1＋6%）÷（10%－6%）＝79.5元。'},
'securities-trading-practice-ch13-pdf-0012': {'explanation': '依「證券交易稅條例」第2條第1款，股票交易稅稅率為3‰。應繳證券交易稅＝10,000股×每股30元×3‰＝900元。'},
})


# Final direct scan transcriptions and formula repairs.  Every string below was
# read from the project-owned crop generated from public/pdf-pages; no external
# notes or question bank was consulted.
merge_overrides({
'investment-ch01-pdf-0039': {
 'explanation': '對於風險規避者、風險愛好者、風險中立者，可分別以圖形表示。風險規避者：當風險增加時，其所要求的新增報酬率會增加。風險愛好者：當風險增加時，其所要求的新增報酬率會減少。風險中立者：當風險增加時，其所要求的新增報酬率會不變。',
},
'investment-ch02-pdf-0002': {
 'explanation': '國庫券報價為95.30，代表其貼現率＝100%－95.30%＝4.7%。國庫券價格＝1,000,000×[1－4.7%×（90／365）]＝988,411元。',
},
'investment-ch03-pdf-0025': {
 'explanation': '股利折現模式中，通常由CAPM所算出之預期報酬率來決定折現率，即R＝R_f＋β（R_m－R_f），因此無風險利率、市場風險溢酬、股票之貝它係數皆會影響折現率。',
},
'investment-ch03-pdf-0026': {
 'question': '哪一因素較不會影響股票的理論價值？',
 'options': {'1':'盈餘成長率變化','2':'預期通貨膨脹變化','3':'立委選舉事件','4':'市場風險變化'},
 'explanation': '由股利折現模式P＝D₁／（K－g）得知，盈餘成長率變化會影響股利成長率g，預期通貨膨脹變化及市場風險變化會影響到預期報酬率K。',
},
'investment-ch04-pdf-0003': {
 'question': '昨日DIF＝25、昨日MACD＝35，今日DIF＝30，下列何者敘述為真？',
 'options': {'1':'MACD上升','2':'今日柱線為正','3':'買點浮現','4':'12日EMA大於26日EMA'},
 'explanation': 'DIF＝EMA（12）－EMA（26）＝30＞0，所以EMA（12）＞EMA（26）。MACDₜ＝0.2×DIFₜ＋0.8×MACDₜ₋₁；今日DIF小於昨日MACD，所以今日MACD會下降。今日DIF小於今日MACD，柱線仍為負。',
},
'investment-ch04-pdf-0070': {
 'explanation': '計算DMI時，必須找出真實波幅（True Range，簡稱TR）。TR為當日股價與前一日股價比較後最大的變動值，比較三種差距之絕對值，數值最大者即當日真正波幅：TR＝MAX（Hₜ－Lₜ，Hₜ－Cₜ₋₁，Lₜ－Cₜ₋₁）。因此同時用到最高價、最低價及收盤價。',
},
'investment-ch04-pdf-0140': {
 'explanation': '一般所謂的「盤整」，通常稱為「技術修正」，係屬次級波動。',
},
'investment-ch05-pdf-0004': {
 'explanation': '股東權益報酬率＝（淨利－特別股股利）／銷貨收入×銷貨收入／平均總資產×平均總資產／平均股東權益。',
},
'investment-ch05-pdf-0039': {
 'explanation': '速動比率＝速動資產／流動負債＝（流動資產－存貨－預付費用）／流動負債＝（700萬－100萬）／200萬＝3。',
},
'investment-ch05-pdf-0134': {
 'question': '小玲觀察到新臺幣一年期定存的利率較美元利率高出3%時，則小玲應預期新臺幣對美元之遠期匯率會：',
 'options': {'1':'升值','2':'貶值','3':'不變','4':'利率與匯率沒有直接關係'},
 'explanation': '利率平價理論說明名目利率與匯率之間的相關性，其公式為F₁／S₀＝（1＋R_d）／（1＋R_f）。因此提高利率的國家，其貨幣遠期匯率將會貶值。',
},
'investment-ch05-pdf-0151': {
 'explanation': '失業率＝失業人數／勞動力；勞動力＝就業人數＋失業人數；非勞動力包括學生、殘障、料理家務者等。',
},
'investment-ch06-pdf-0004': {
 'explanation': '相關係數＝1時，投資組合標準差σₚ＝W₁σ₁＋W₂σ₂。',
},
'investment-ch06-pdf-0097': {
 'explanation': '當個別資產相關係數＝－1時，投資組合標準差σₚ＝|W₁σ₁－W₂σ₂|＝|0.4×20%－0.6×10%|＝2%。',
},
'investment-ch07-pdf-0035': {
 'explanation': '已充分分散風險之投資組合，表示已藉由多角化消除非系統風險，因此只剩系統風險，可利用貝它係數衡量。依CAPM，E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]，預期報酬率大小視βᵢ而定。',
},
'investment-ch07-pdf-0037': {
 'explanation': '依CAPM，E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。當βᵢ＝1時，E（Rᵢ）＝E（R_m）；當βᵢ＞1時，E（Rᵢ）＞E（R_m），即預期報酬率大於市場報酬率。',
},
'investment-ch07-pdf-0041': {
 'explanation': '依CAPM，E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。當βᵢ＞0時，E（Rᵢ）＞R_f（6%），故折現所用的預期報酬率大於6%，目前合理價格應低於100元。',
},
'investment-ch07-pdf-0044': {
 'explanation': '依CAPM，E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]，風險溢酬為βᵢ[E（R_m）－R_f]＝1.6×6%＝9.6%。',
},
'investment-ch07-pdf-0045': {
 'explanation': '依CAPM，預期報酬率E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]，即無風險利率加上資產的風險溢酬βᵢ[E（R_m）－R_f]。',
},
'investment-ch07-pdf-0050': {
 'explanation': '依CAPM，rᵢ＝r_f＋βᵢ（r_m－r_f）＝r_f，所以βᵢ＝0。又βᵢ＝Cov（Rᵢ，R_m）／Var（R_m），故Cov（Rᵢ，R_m）＝0，該資產與市場投資組合零相關。',
},
'investment-ch07-pdf-0054': {
 'explanation': '依CAPM，E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。當βᵢ＝0時，預期報酬率E（Rᵢ）等於無風險利率R_f。',
},
'investment-ch07-pdf-0059': {
 'explanation': '依CAPM，E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。只有當βᵢ大於1時，E（Rᵢ）纔有可能大於E（R_m）。',
},
'investment-ch07-pdf-0066': {
 'explanation': '證券市場線SML：E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。R_f＝6%，E（R_m）＝11%，故市場風險溢酬為5%，SML為E（Rᵢ）＝6%＋βᵢ×5%。',
},
'investment-ch07-pdf-0076': {
 'explanation': 'Jensen指標＝E（Rᵢ）－{R_f＋βᵢ[E（R_m）－R_f]}。當證券被合理評價時，E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]，因此Jensen指標等於0。',
},
'investment-ch07-pdf-0106': {
 'explanation': '依CAPM，E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。因βᵢ＜0，故E（Rᵢ）＜R_f，也就是期望報酬率小於無風險利率。',
},
'investment-ch07-pdf-0110': {
 'explanation': 'X股票的貝它係數為Y股票的2倍，表示X股票的系統風險為Y股票的2倍，但總風險大小沒有一定。由E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]可知，X的期望報酬率也不是Y的2倍。',
},
'investment-ch09-pdf-0029': {
 'question': '其他條件不變下，權證價值之敘述何者正確？甲、股價上漲，認售權證價值下跌；乙、履約價格越高，認購權證價值越高；丙、存續期間愈長，認購權證價值愈高，認售權證價值愈低；丁、股價波動大，認購權證及認售權證價值提高。',
 'explanation': '| 因素 | 認購權證 | 認售權證 |\n|---|---|---|\n| 標的股價 | 股價上漲，權證價值提高 | 股價上漲，權證價值降低 |\n| 履約價格 | 履約價格愈高，權證價值愈低 | 履約價格愈高，權證價值愈高 |\n| 標的波動 | 波動愈大，價值愈高 | 波動愈大，價值愈高 |\n| 存續期間 | 期間愈長，價值愈大 | 期間愈長，價值愈大 |',
},
'investment-ch09-pdf-0057': {
 'question': '某證券公司發行一年期結構型債券（Structured Notes）的贖回金額公式如下：贖回金額＝投資本金×{1＋Max[5%，（10%×S&P 500指數成長率）]}，下列有關此債券的敘述，何者為正確？',
},
'financial-analysis-ch02-pdf-0004': {
 'explanation': '營業循環＝存貨週轉期間＋應收帳款週轉期間；40＝365／存貨週轉率＋365／20，存貨週轉率＝16.78。',
},
'financial-analysis-ch02-pdf-0033': {
 'question': '彰化公司於X1年12月31日的期末存貨明細如下，試以成本與淨變現價值孰低法評價，該公司商品之期末存貨評價為多少？\n\n| 產品 | 數量 | 單位成本 | 單位淨變現價值 |\n|---|---:|---:|---:|\n| 登山腳踏車 | 11 | $14,400 | $13,200 |\n| 滑板 | 13 | $8,400 | $10,200 |\n| 滑翔翼 | 26 | $19,200 | $16,800 |',
 'explanation': '$13,200×11＋$8,400×13＋$16,800×26＝$691,200。',
},
'financial-analysis-ch02-pdf-0049': {
 'question': '流動比率愈高，則流動性指數：（以天數表示）',
 'explanation': '流動性指數是以各流動資產之構成項目的金額乘以該項目轉換成現金所需之天數，再以各乘積之和除以流動資產總額所得，與流動比率（流動資產÷流動負債）無直接關係。',
},
'financial-analysis-ch03-pdf-0017': {
 'explanation': '營業活動淨現金流量＝$25,000＋$25,000＝$50,000。營業淨現金流量對流動負債比率＝營業活動淨現金流量／平均流動負債＝$50,000／$100,000＝0.5。',
},
'financial-analysis-ch05-pdf-0035': {
 'explanation': '第二優先債券盈餘支付利息倍數＝（$200,000＋$30,000＋$10,000＋$20,000）／（$30,000＋$10,000）＝6.5。',
},
'financial-analysis-ch05-pdf-0036': {
 'explanation': '速動比率＝（流動資產－存貨－預付費用）／流動負債＝流動資產×（1－0.2－0.1）／流動負債＝1.4。流動比率＝流動資產／流動負債＝1.4／（1－0.2－0.1）＝2。',
},
'financial-analysis-ch05-pdf-0057': {
 'explanation': '[$664,000／（1－17%）＋$200,000]／$200,000＝5。',
},
'financial-analysis-ch06-pdf-0004': {
 'explanation': '本益比＝股利支付率／股利收益率＝75%／股利收益率＝60，故股利收益率＝75%／60＝0.0125。又股利收益率＝普通股每股股利／普通股每股市價＝$8／普通股每股市價，所以普通股每股市價＝$8／0.0125＝$640。',
},
'financial-analysis-ch06-pdf-0007': {
 'explanation': '總資產報酬率＝利息前淨利率×總資產週轉率＝12.5%×（$60,000／$150,000）＝5%。',
},
'financial-analysis-ch06-pdf-0015': {
 'explanation': '權益報酬率＝淨利率×總資產週轉率×平均財務槓桿比率＝（$25,000／$50,000）×（$50,000／$160,000）×2＝31.25%。',
},
'financial-analysis-ch06-pdf-0024': {
 'question': '甲公司X1年度財務資料如下，試問其權益報酬率為何？\n\n| 項目 | X1年度／X1年12月31日 | X1年1月1日 |\n|---|---:|---:|\n| 資產總額 | $200,000 | $150,000 |\n| 負債總額 | $100,000 | $75,000 |\n| 銷貨收入 | $500,000 |  |\n| 利息費用 | $8,000 |  |\n| 稅前淨利 | $10,000 |  |\n| 所得稅率 | 25% |  |',
 'explanation': '權益報酬率＝$10,000×（1－25%）／{[（$200,000－$100,000）＋（$150,000－$75,000）]／2}＝8.57%。',
},
'financial-analysis-ch06-pdf-0044': {
 'explanation': '總資產報酬率＝淨利率×（銷貨收入淨額／平均資產總額）。12%＝6%×（$200,000／平均資產總額），故平均資產總額＝$100,000。',
},
'financial-analysis-ch07-pdf-0006': {
 'explanation': '營運槓桿度＝90%／30%＝3。又營運槓桿度＝邊際貢獻／EBIT，故邊際貢獻＝3×（$124,500／0.83）＝$450,000。變動成本及費用＝$500,000－$450,000＝$50,000。',
},
'financial-analysis-ch07-pdf-0054': {
 'explanation': '營運槓桿度＝（$2,000,000－$600,000）／$400,000＝3.5。',
},
'financial-analysis-ch07-pdf-0117': {
 'explanation': '| 保留盈餘減少 | 保留盈餘增加 |\n|---|---|\n| 本期淨損 | 本期淨利 |\n| 前期損益調整（分錄借記者） | 前期損益調整（分錄貸記者） |\n| 支付股利（不包括清算股利之支付） | 公司重整（準改組）之調整（分錄貸記者） |\n| 庫藏股票交易造成淨資產減少 |  |\n\n清算股利之宣告支付係借記「資本公積（或股本）」、貸記「現金」，不會造成保留盈餘減少，故答案為選項（4）。',
},
'financial-analysis-ch07-pdf-0146': {
 'explanation': '期末存貨數量＝60＋90－105＝45件；加權平均單位成本＝$2,538／45＝$56.4。$60×（60／150）＋進貨單位成本×（90／150）＝$56.4，解得進貨單位成本＝$54。',
},
'financial-analysis-ch08-pdf-0019': {
 'explanation': '認股權行使所增加股數＝120,000－（$40×120,000／$50）＝24,000股。稀釋每股盈餘＝$477,000／[300,000＋24,000×（9／12）]＝$1.5。',
},
'financial-analysis-ch08-pdf-0047': {
 'explanation': '基本每股盈餘＝[$6,000,000－（$100×600,000×5%）]／400,000＝$7.5。',
},
'financial-analysis-ch10-pdf-0010': {
 'explanation': '依股利成長模式：每股市價＝次期股利／（折現率－股利成長率）。整理得折現率＝次期股利／目前每股市價＋股利成長率＝股利殖利率＋股利成長率。',
},
'financial-analysis-ch10-pdf-0025': {
 'explanation': '企業報稅時採用加速折舊法，可在早期繳納較少稅額，故可鼓勵企業從事投資。',
},
'securities-trading-regulations-ch02-pdf-0038': {
 'question': '依「證券交易法」規定，如有正當理由致審計委員會無法召開時，涉及董事自身利害關係之事項應以全體董事＿＿以上同意行之。',
 'options': {'1':'三分之一','2':'二分之一','3':'三分之二','4':'四分之三'},
 'explanation': '依「證券交易法」§14-5第1項第4款規定，已依本法發行股票之公司設置審計委員會者，下列事項應經審計委員會全體成員二分之一以上同意，並提董事會決議，不適用第十四條之三規定：四、涉及董事自身利害關係之事項。第3項規定，如有正當理由致審計委員會無法召開時，第一項各款事項應以全體董事三分之二以上同意行之。',
},

'investment-ch02-pdf-0010': {
 'options': {'4':'17,260元'},
},
'investment-ch02-pdf-0081': {
 'question': '在其他條件不變下，下表中之債券存續期間依序為：\n\n| 券種 | 甲 | 乙 | 丙 |\n|---|---:|---:|---:|\n| 票面利率 | 6.5% | 6.5% | 6.2% |\n| 到期期間 | 3年 | 4年 | 4年 |',
 'options': {'1':'甲＞乙＞丙','2':'丙＞乙＞甲','3':'甲＞丙＞乙','4':'乙＞丙＞甲'},
},
'investment-ch02-pdf-0084': {
 'explanation': 'E（Rᵢ）＝R_f＋0×[E（R_m）－R_f]＝R_f。',
},
'investment-ch03-pdf-0005': {
 'explanation': '根據CAPM，要求報酬率＝無風險利率＋公司β×（市場報酬率－無風險利率）＝5%＋1.25×（13%－5%）＝15%。股價＝明年總收入÷（1＋折現率）＝（股利＋一年後股價）÷（1＋要求報酬率）＝（1.3＋24）÷（1＋15%）＝22元。',
},
'investment-ch04-pdf-0061': {
 'options': {'4':'指數'},
},
'investment-ch07-pdf-0063': {
 'explanation': '根據CAPM，當βᵢ＝0時，Rᵢ＝R_f，此時只能賺得無風險報酬，並無法賺到市場平均報酬率；且不表示沒有任何風險，只能說沒有系統風險。',
},
'investment-ch07-pdf-0099': {
 'options': {'4':'僅丙、丁'},
},
'investment-ch09-pdf-0045': {
 'explanation': '（1）可轉債發行公司提前贖回：當可轉債發行公司提前贖回時，即抵觸到贖回條件時，公司可以提前贖回，此時將迫使可轉債持有人於市場賣出或進行轉換的動作。因此就交易商而言，將會提前解約並執行債券買回權，以進行轉換或賣出；（2）可轉債價格上漲：當可轉債價格上漲時，券商將有提前解約並執行債券買回權以出售可轉債賺取資本利得之誘因，因此可能會提前解約；（3）可轉債發行公司發生違約情事：當可轉債發行公司發生違約時，其信用狀況可能發生問題，此時證券商手中所持有的可轉債所將產生之現金流量，將有可能無法實現，因此證券商將有可能提前解除交換契約，並不執行債券買回權。在證券商選擇不執行債券買回權的情況下，將由投資人承擔信用風險。',
},
'securities-trading-practice-ch11-pdf-0002': {
 'explanation': '依「證券商辦理有價證券買賣融資融券業務操作辦法」§4第2項規定，零股、鉅額交易及依證券交易所營業細則§74、「櫃買中心證券商營業處所買賣有價證券業務規則」§39所定之交易，不得融資融券。',
},
'securities-trading-regulations-ch05-pdf-0080': {
 'explanation': '依「證券交易法」§150第3款規定，私人間之直接讓受，其數量不超過該證券一個成交單位；前後兩次之讓受行為，相隔不少於三個月者。',
},
'securities-trading-regulations-ch06-pdf-0061': {
 'question': '投資人與證券投資顧問公司簽訂之「契約」，在法律上，其性質屬於：',
},
'securities-trading-practice-ch01-pdf-0005': {
 'explanation': '我國目前在貨幣市場流通之信用工具主要有：國庫券、商業本票、銀行承兌匯票及可轉讓定期存單等。',
},
'securities-trading-practice-ch08-pdf-0023': {
 'question': '如果公司股東會未以實體召開，僅召開視訊會議，應經董事會以董事＿＿出席及出席董事＿＿同意。',
 'options': {'1':'三分之二以上、過半數','2':'二分之一以上、三分之二以上','3':'全體、過半數','4':'全體、三分之二以上'},
 'explanation': '依「公開發行股票公司股務處理準則」§44-9第3項規定，公司召開股東會視訊會議，除本準則另有規定外，應以章程載明，並經董事會決議，且視訊股東會應經董事會以董事三分之二以上之出席及出席董事過半數同意之決議行之。',
},
'securities-trading-practice-ch09-pdf-0113': {
 'explanation': '依「證交所證券商交割結算基金管理辦法」§2規定，證券經紀商及證券自營商，應依金管會所定之標準，向證交所繳存交割結算基金。',
},
'securities-trading-practice-ch11-pdf-0003': {
 'question': '證券商辦理融資融券業務，取得融券賣出價款及融券保證金，不得為下列何項之運用？',
 'options': {'1':'作為其辦理融資業務之資金來源','2':'銀行存款','3':'作為向證券交易所借券系統之擔保','4':'從事放款業務'},
 'explanation': '依「證券商辦理有價證券買賣融資融券業務操作辦法」§7第1項規定，證券商辦理有價證券買賣融資融券，對所留存之融券賣出價款及融券保證金，除作下列之運用外，不得移作他用：一、作為辦理融資業務之資金來源。二、作為向證券金融事業轉融通證券之擔保。三、作為辦理證券業務借貸款項之資金來源。四、作為向證券交易所借券系統借券之擔保。五、銀行存款。六、購買短期票券。',
},
})


# Final punctuation repairs verified directly against the corresponding scan
# explanation crops.  These are content-preserving bracket corrections only.
merge_overrides({
'investment-ch04-pdf-0151': {
 'explanation': '14日ADL＝累計14日內股票上漲家數總和－累計14日內股票下跌家數總和，本題14日ADL＝270＝（14日內累計上漲家數）－2,480，故14日內累計上漲家數＝2,750家。',
},
'financial-analysis-ch04-pdf-0074': {
 'explanation': '不具商業實質之資產交換，換入資產按換出資產之帳面金額調整現金收付之金額入帳，新機器入帳成本＝（$3,500,000－$2,000,000）－$500,000＝$1,000,000。',
},
})


# Final continuation repairs from direct inspection of the project scan crops.
# These records had clipped multi-page crops, next-question contamination, or
# formula/Latin-character OCR artifacts.  No external source was used.
merge_overrides({
'securities-trading-practice-ch02-pdf-0011': {
 'question': '發行人募集與發行有價證券，自申報生效通知到達之日起，逾三個月尚未募足並收足現金款項，如要延長期限，以下何敘述與規定不符？',
 'options': {'1':'申請不須提出理由','2':'須向金管會申請核准','3':'最多只能申請延期一次','4':'延長期限為三個月'},
 'explanation': '依「發行人募集與發行有價證券處理準則」§11第1項規定，發行人募集與發行有價證券，經發現有下列情形之一，金管會得撤銷或廢止其申報生效或核准：二、前款以外之案件，自申報生效通知到達之日起，逾三個月尚未募足並收足現金款項者。但其有正當理由申請延期，經金管會核准者，得再延長三個月，並以一次為限。',
},
'securities-trading-practice-ch02-pdf-0012': {
 'question': '甲上市公司現金增資發行新股於4/1申報生效，請問甲公司應於何時募集完成？',
 'options': {'1':'5/1以前','2':'6/1以前','3':'7/1以前','4':'8/1以前'},
},
'securities-trading-practice-ch02-pdf-0013': {
 'question': '有價證券募集與發行之申報案，經撤銷或廢止申報生效時，對已收取之有價證券價款，發行人或持有人應於接獲撤銷或廢止通知之日起幾日內，依法加算利息返還該價款，並負損害賠償責任？',
 'options': {'1':'5日內','2':'10日內','3':'15日內','4':'30日內'},
 'explanation': '依「發行人募集與發行有價證券處理準則」§11第4項規定，經撤銷或廢止申報生效時，已收取有價證券價款者，發行人或持有人應於接獲金管會撤銷或廢止通知之日起10日內，依法加算利息返還該價款，並負損害賠償責任。',
},
'securities-trading-practice-ch02-pdf-0014': {
 'question': '有價證券之募集與發行案件經撤銷申報生效或核准，已收取有價證券價款者，發行人或持有人有下列何種責任？',
 'options': {'1':'返還本金','2':'返還利息','3':'返還本息並負損害賠償責任','4':'返還本息並負民事及刑事責任'},
},
'securities-trading-practice-ch04-pdf-0032': {
 'explanation': '依「承銷或再行銷售有價證券處理辦法」§56規定，申購人就每一種有價證券之公開申購僅能選擇一家經紀商辦理申購，不得重複申購，且每一申購人限申購一銷售單位，每件處理費新臺幣20元。',
},
'securities-trading-practice-ch04-pdf-0033': {
 'question': '公開申購配售制度，假設有一投資人擬申購以三張為一配售單位，每一配售單位承銷價60元之上市股票，請問其最多申購張數？',
 'options': {'1':'一張','2':'二張','3':'三張','4':'沒有限制'},
 'explanation': '同第31題解析。本題一銷售單位為三張。',
},
'financial-analysis-ch06-pdf-0019': {
 'question': '下列敘述何者不正確？',
 'options': {'1':'現金是流動性較高之資產','2':'現金週轉率低表示營業所需現金充裕','3':'現金是收益能力較高之資產','4':'現金週轉率高可能有現金短缺之虞'},
 'explanation': '現金僅代表流動性，無法代表收益能力。',
},
'securities-trading-practice-ch09-pdf-0001': {
 'question': '發行人與其證券承銷商有下列何項情事時，證交所拒絕接受該證券承銷商所出具之評估報告？',
 'options': {
   '1':'非屬同一集團企業',
   '2':'任何一方股份總額5%之股份為相同之股東持有',
   '3':'任何一方董事長與對方之董事長具有三親等親屬關係',
   '4':'雙方互為有價證券初次上市或上櫃評估報告之評估',
 },
},
'investment-ch07-pdf-0030': {
 'question': '某投資者寧願投資貝它係數等於0的股票，也不願投資無風險國庫券，請問該投資者可能是屬於何種風險特質？',
},
'investment-ch07-pdf-0002': {
 'explanation': '擁有股價指數型基金，相當於擁有市場投資組合，其貝它係數為1。而售出相當數量的股價指數期貨，則會將剩下的系統風險也完全分散掉。由Rᵢ＝R_f＋βᵢ（R_m－R_f）可看出，當βᵢ＝0時，Rᵢ＝R_f。',
},
'investment-ch06-pdf-0010': {
 'question': '貝它（Beta）係數為負的證券最能：',
 'explanation': '貝它係數為負，表示該證券報酬率的波動和市場報酬率波動呈反方向的關係。根據投資組合分散風險的原理，投資組合標的間的波動相關係數愈低，甚至為負，愈能達到風險分散的效果。βᵢ＝Cov（Rᵢ，R_m）／Var（R_m）＝ρᵢ,m×σᵢ／σ_m。',
},
'investment-ch07-pdf-0018': {
 'explanation': '貝它係數是用來衡量系統風險的大小，因此值愈大，表示系統風險愈大。從CAPM可得：E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]；一旦β上升，在其他條件不變下，Rᵢ會增加，即預期報酬率增加。',
},
'investment-ch07-pdf-0042': {
 'explanation': '根據CAPM可知：E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。決定一股票的預期報酬率，要視貝它係數的大小而定，而不是總風險（報酬率標準差）來決定。',
},
'investment-ch02-pdf-0027': {
 'explanation': '永續債券價格＝票面利息／要求報酬率。第3年年初債券價格＝$5,000／5%。債券價格＝（$5,000／0.05）×[1／（1.05）²]＝$90,703。',
},
'investment-ch07-pdf-0122': {
 'options': {'4':'小數法則（law of small numbers）是指人們誤以為小樣本下也能代表整體結果'},
},
})


# Additional direct scan reconciliation for page-number bleed, omitted blanks,
# short option clipping and finance-formula OCR.  The wording below follows the
# project scan crops and preserves their substantive content.
merge_overrides({
'investment-ch01-pdf-0067': {
 'explanation': '普通股股東享有的權利有：1.優先認股權；2.參加股東會行使投票權；3.盈餘分配權（如現金股利）。而認購權證、可轉換公司債所表現的僅是轉換成普通股的權利，在其尚未執行或轉換時，並不具有普通股股東的權利。特別股發行之目的係為限制特別股股東其權利之行使，不希望公司之決策方向受影響，故乃發行股息紅利分配具有優先分配權，但表決權受限制之特別股。',
},
'investment-ch02-pdf-0010': {
 'explanation': '附買回利息＝500,000×3.5%×（30／365）＝1,438元。',
},
'financial-analysis-ch10-pdf-0077': {
 'explanation': '利潤指數＝現金流量現值／期初投資成本。當大於1時，表示NPV大於0，值得投資此投資計畫。',
},
'financial-analysis-ch11-pdf-0013': {
 'explanation': '根據IFRS 10，非控制權益應在合併財務報表的股東權益部分單獨列示，反映母公司對子公司的控制權益以外的部分。',
},
'securities-trading-regulations-ch02-pdf-0140': {
 'options': {'4':'組織型態並無限制，故財團法人亦可'},
 'explanation': '依「信用評等事業管理規則」§4規定，信用評等事業除本規則另有規定外，以股份有限公司組織為限。信用評等事業實收資本額不得少於新臺幣五千萬元，發起人並應於發起時一次認足之。',
},
'securities-trading-regulations-ch03-pdf-0027': {
 'explanation': '依「證券交易法」§43-1第1項規定，任何人單獨或與他人共同取得任一公開發行公司已發行股份總額超過百分之五之股份者，應向主管機關申報及公告；申報事項如有變動時，亦同。',
},
'securities-trading-regulations-ch03-pdf-0028': {
 'explanation': '依「證券交易法」§43-1第1項規定，任何人單獨或與他人共同取得任一公開發行公司已發行股份總額超過百分之五之股份者，應向主管機關申報及公告；申報事項如有變動時，亦同。另有關申報取得股份之股數、目的、資金來源、變動事項、公告、期限及其他應遵行事項之辦法，由主管機關定之。',
},
'securities-trading-regulations-ch03-pdf-0058': {
 'explanation': '依「證券交易法」§157-1第4項規定，第一項第五款之人，對於前項損害賠償，應與第一項第一款至第四款提供消息之人，負連帶賠償責任。但第一項第一款至第四款提供消息之人有正當理由相信消息已公開者，不負賠償責任。',
},
'securities-trading-practice-ch11-pdf-0020': {
 'explanation': '依「證券商辦理有價證券買賣融資融券業務操作辦法」§54第1項規定，委託人信用帳戶之整戶擔保維持率低於130%，證券商應即通知委託人就各該筆不足擔保維持率之融資融券，於通知送達之日起二個營業日內補繳融資自備款或融券保證金差額。',
},
'securities-trading-practice-ch13-pdf-0005': {
 'explanation': '依「證交所營業細則」§121規定，證交所於每月終依據各證券商當月買賣金額按前條費率計算應收經手費金額開具帳單分送各證券商，各證券商應於次月十日前繳清。',
},
'securities-trading-regulations-ch06-pdf-0127': {
 'question': '證券商發行指數投資證券總額，不得超過最近期經會計師查核簽證之財務報告淨值之百分之＿＿。',
},
'securities-trading-regulations-ch06-pdf-0129': {
 'question': '依「境外資金匯回管理運用及課稅條例」匯回之資金，其信託專戶或證券全權委託專戶從事有價證券投資，運用資金於任一上市、櫃或興櫃公司股票之股份總額，不得超過該公司已發行股份總數之百分之＿＿。',
},
'securities-trading-practice-ch08-pdf-0027': {
 'question': '轉換公司債及附認股權公司債之發行人應於辦理變更股票每股面額，向經濟部申請變更登記日之前＿＿個營業日，將債券停止轉換（認購）期間等相關事項，在櫃買中心指定之網際網路資訊申報系統辦理公告。',
},
'securities-trading-practice-ch08-pdf-0028': {
 'question': '轉換公司債及附認股權公司債之發行人應於無償配股停止過戶日、現金股息停止過戶日、現金增資認股停止過戶日或其他依法暫停止過戶日前＿＿個營業日，將債券停止轉換（認購）期間等相關事項，在櫃買中心指定之網際網路資訊申報系統辦理公告。',
},
'investment-ch07-pdf-0105': {
 'options': {'4':'1.2'},
 'explanation': '由CAPM可知：E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。將R_f＝8%、E（R_m）＝18%、E（Rᵢ）＝20%代入，20%＝8%＋βᵢ（18%－8%），解得βᵢ＝1.2。',
},
'financial-analysis-ch06-pdf-0051': {
 'options': {'4':'5'},
 'explanation': '總資產週轉率＝$1,000,000／$400,000＝2.5。',
},
'securities-trading-practice-ch11-pdf-0032': {
 'options': {'4':'前四個營業日'},
 'explanation': '依「證券商辦理有價證券買賣融資融券業務操作辦法」§79規定，證券商應於有價證券停止過戶前一個營業日，將委託人信用帳戶融資買進及提供抵繳之有價證券，編製過戶或領息清冊連同媒體資料送交證券集中保管事業代向發行公司或其股務代理機構辦理過戶。',
},
'investment-ch07-pdf-0008': {
 'explanation': 'E（Rᵢ）＝R_f＋λ₁b₁＋λ₂b₂＝6%＋0.6×1.5%＋1.5×4%＝12.9%。',
},
'investment-ch07-pdf-0052': {
 'explanation': '在CAPM中，SML為E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]，其中E（R_m）－R_f為其斜率。所以在其他條件不變下，市場預期報酬率E（R_m）減少，則E（R_m）－R_f亦減少，SML的斜率會變平緩。',
},
'investment-ch07-pdf-0062': {
 'explanation': '要風險趨避者承擔愈高的風險，便要給其更高的預期報酬，可用CAPM來決定，即E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。',
},
'investment-ch07-pdf-0070': {
 'explanation': '在CAPM中，SML（證券市場線）為E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。斜率為E（R_m）－R_f，截距為R_f。因此當R_f上升3%，整條SML的截距也會上移3%。',
},
'investment-ch07-pdf-0094': {
 'explanation': '假設E（Rᵢ）＝R_f＋二因素的風險溢酬，16%＝R_f＋（1.5×6%）＋（0.6×3%），解得R_f＝5.2%。',
},
'investment-ch07-pdf-0097': {
 'explanation': '可由CAPM求得：E（R甲）＝R_f＋β甲[E（R_m）－R_f]。當E（R甲）＝7%、R_f＝5%、R_m＝10%時，7%＝5%＋β甲（10%－5%），解得β甲＝0.4。',
},
'investment-ch07-pdf-0108': {
 'explanation': '證券市場線（SML）為E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。其中E（Rᵢ）為預期報酬率，βᵢ為貝它係數。',
},
'investment-ch07-pdf-0112': {
 'explanation': '由CAPM可知E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。只要分散風險良好，則Rᵢ是R_m的函數，即預期報酬率只受到市場風險的影響。',
},
'investment-ch07-pdf-0116': {
 'explanation': '證券市場線（SML）：E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]。它不僅可用於個別證券，也可適用於投資組合，皆可用來衡量系統風險的大小。',
},
'investment-ch07-pdf-0121': {
 'explanation': '根據CAPM，當βᵢ＝0時，Rᵢ＝R_f，此時只能賺得無風險報酬，並無法賺到市場平均報酬率，且不表示沒有任何風險，只能說沒有系統風險。',
},
'investment-ch02-pdf-0145': {
 'explanation': '7×（1.06）²＋7×1.06＋107＝122。',
},
'investment-ch03-pdf-0049': {
 'explanation': 'P＝D₁／（K－g）＝D₀×（1＋g）／（K－g）；P₃＝$0.60×（1.04）³／（0.12－0.04）＝$8.44。',
},
})



# Final formula and page-noise transcriptions read directly from the project
# scan crops in docs/review-crops/remaining-formulas. No external source is used.
merge_overrides({
'investment-ch01-pdf-0059': {
 'question': '假設小何所擁有的資金在過去一年賺取了8%的名目利率，該期間通貨膨脹率為4%，請問小何的實際購買力成長了多少？',
 'explanation': '實質報酬率r＝（1＋R）÷（1＋I）－1＝1.08÷1.04－1＝3.8%。',
},
'investment-ch02-pdf-0012': {
 'question': '小何目前投資100,000元於某債券，期間不支付利息，到期期間3年，殖利率（YTM）為4.5%，則經過3年之後，小何可領回多少？（忽略交易成本）',
 'options': {'1':'117,424元','2':'114,117元','3':'106,833元','4':'99,526元'},
 'explanation': 'FV＝100,000×（1＋0.045）³＝114,117元。',
},
'investment-ch02-pdf-0014': {
 'question': '一個兩年期零息公司債目前的殖利率為2.1%，而相同期限零息公債的殖利率為1.8%。在違約損失率為65%的情況下，請估計該公司債兩年內預期違約損失（Expected Loss from Default）金額約為多少（假設債券面額為$1,000）？',
 'explanation': '預期違約損失相當於同期限無風險與有風險零息債券價格的差異：$1,000÷（1＋1.8%）²－$1,000÷（1＋2.1%）²＝$5.66。',
},
'investment-ch02-pdf-0019': {
 'question': '假設有一債券的存續期間為10，當時的殖利率（YTM）為5%，請問當其YTM變動1bp時，該債券價格變動的百分比為何？',
 'explanation': '將存續期間除以（1＋YTM），即可得出修正的存續期間；其值除以100後可用來衡量利率變動1bp時債券價格變動的百分比。修正的存續期間＝10÷（1＋5%）＝9.5238，因此YTM每變動1bp（0.01%），債券價格將變動9.5238%÷100＝0.095238%。',
},
'investment-ch02-pdf-0142': {
 'question': '面額10,000元、票面利率8.875%、到期日為民國99年7月15日之債券，付息日為1月15日與7月15日，小何在96年8月15日向小敏買該債券，則小何應支付小敏的應計利息（Accrued Interest）約為（一年以365天計）：',
 'explanation': '應計利息（AI）＝每期債息×持有期間。AI＝10,000×（8.875%÷2）×（31÷183）＝75.17，約為75元。',
},
'investment-ch02-pdf-0162': {
 'question': '4年期面額10,000元之零息債券（Zero-Coupon Bonds），其價格為6,830元，該債券之年報酬率為：',
 'explanation': '6,830×（1＋r）⁴＝10,000，解得r＝10%。',
},
'investment-ch02-pdf-0169': {
 'question': '已知一永續債券每年付息一次，其殖利率為5%，則此永續債券之存續期間（Duration）為幾年？',
 'explanation': '永續債券存續期間的計算方式為Duration＝1＋1／r，其中r為殖利率。本題Duration＝1＋（1÷0.05）＝21年。',
},
'investment-ch03-pdf-0009': {
 'question': '甲公司預期明年可發放2元現金股利，且每年成長8%。假設目前無風險利率為6%、市場風險溢酬為8%，若友好公司股票之貝它（Beta）係數為0.75，在CAPM與股利折現模式同時成立，請問其股價應為何？',
 'explanation': 'Rᵢ＝R_f＋βᵢ（R_m－R_f）＝6%＋0.75×8%＝12%；P＝2÷（12%－8%）＝50元。',
},
'investment-ch03-pdf-0012': {
 'question': '甲公司目前股價是50元，已知該公司今年每股可賺2.5元，試求該公司目前本益比倍數是多少？',
 'explanation': 'P／E Ratio＝股價÷每股盈餘＝50÷2.5＝20。',
},
'investment-ch03-pdf-0020': {
 'question': '甲公司今年剛發放2元現金股利，若預期其現金股利每年將固定成長3%，且投資人對該公司股票的要求報酬率為10%，請問該公司股票的合理價格最近似下列何選項？',
 'explanation': '股利固定成長模式：P＝D₁÷（K－g）＝D₀（1＋g）÷（K－g）＝2×（1＋3%）÷（10%－3%）＝29.43元。',
},
'investment-ch08-pdf-0111': {
 'question': '假設臺灣50指數昨日收盤價為100，今日下跌3%，明日再下跌3%，以槓桿型ETF具有複利效果的特性，請問累計2日下來，臺灣50正2 ETF之複利效果為何？（前述複利效果指槓桿型ETF長期報酬率偏離標的指數正向倍數表現之情形）',
 'explanation': '指數報酬：100×（1－3%）＝97，97×（1－3%）＝94.09，故2日累計跌幅＝（94.09－100）÷100＝－5.91%；2倍指數報酬＝－5.91%×2＝－11.82%。2倍ETF報酬：100×（1－6%）＝94，94×（1－6%）＝88.36，故2日累計跌幅＝（88.36－100）÷100＝－11.64%。因此複利效果＝－11.64%－（－11.82%）＝0.18%。',
},
'financial-analysis-ch02-pdf-0065': {
 'question': '根據下列資料，銷貨毛利金額應為多少？期初存貨$18、進貨折扣$3、銷貨折扣$8、期末存貨$23、進貨總額$215、進貨運費$4、銷貨運費$7、進貨退回$2、銷貨退回$6、銷貨總額$440。',
 'options': {'1':'$210','2':'$212','3':'$217','4':'$221'},
 'explanation': '銷貨淨額＝銷貨總額－銷貨折扣－銷貨退回＝$440－$8－$6＝$426。進貨淨額＝進貨總額＋進貨運費－進貨折扣－進貨退回＝$215＋$4－$3－$2＝$214。銷貨成本＝期初存貨＋本期進貨－期末存貨＝$18＋$214－$23＝$209。毛利＝$426－$209＝$217。',
},
'financial-analysis-ch07-pdf-0133': {
 'question': '某企業今年度的銷貨收入為300萬元，變動成本為180萬元，固定成本為90萬元，預估明年度固定成本為120萬元，邊際貢獻率不變，但企業希望明年度的淨利能達50萬元，請問其目標銷貨收入成長率應為多少？',
 'explanation': '邊際貢獻率＝（300萬元－180萬元）÷300萬元＝40%。目標銷貨收入＝（120萬元＋50萬元）÷40%＝425萬元。銷貨收入成長率＝（425萬元－300萬元）÷300萬元＝41.7%。',
},
'investment-ch06-pdf-0055': {
 'question': '假設一投資組合由甲、乙兩股票組成，甲占投資組合比重40%，乙占60%，甲的預期報酬率標準差為6%，乙的預期報酬率標準差為18%，甲與乙的報酬率相關係數為0.4。請問此一投資組合報酬率變異數為何？',
 'explanation': '投資組合變異數＝W₁²×Var（R₁）＋W₂²×Var（R₂）＋2×W₁×W₂×ρ₁₂×√Var（R₁）×√Var（R₂）＝（0.4）²×（0.06）²＋（0.6）²×（0.18）²＋2×0.4×0.6×0.4×0.06×0.18＝1.43%。',
},
'investment-ch06-pdf-0089': {
 'question': '在不可賣空前提下，各證券報酬率之間關係為何，最無法達到分散風險之效果？',
 'explanation': '假設R_p＝X_A R_A＋X_B R_B，且X_A＋X_B＝1。投資組合變異數σ_p²＝X_A²σ_A²＋X_B²σ_B²＋2X_A X_Bρ_ABσ_Aσ_B。當ρ_AB＝1（高度正相關）時，σ_p²＝（X_Aσ_A＋X_Bσ_B）²，因此σ_p＝X_Aσ_A＋X_Bσ_B，即為兩證券風險的加權平均，所以沒有風險分散效果。',
},
'investment-ch07-pdf-0080': {
 'question': '持有一貝它係數為2之股票，在市場平均報酬率為12%時，其要求報酬率為18%；若無風險利率不變，且市場平均報酬率增加為14%，則該股票要求報酬率將為：',
 'explanation': '18%＝R_f＋2（12%－R_f），解得R_f＝6%。因此當R_f不變且E（R_m）＝14%時，E（Rᵢ）＝6%＋2（14%－6%）＝22%。',
},
'securities-trading-practice-ch03-pdf-0003': {
 'question': '發行公司之公開說明書記載內容有虛偽隱匿之情事者，下列何人無須與公司一起對善意之相對人負連帶賠償責任？',
 'options': {'1':'公司負責人','2':'於公開說明書上簽名之主辦會計','3':'財報之簽證會計師','4':'內部稽核承辦人員'},
 'explanation': '依「證券交易法」§32，公開說明書應記載之主要內容有虛偽或隱匿之情事者，下列各款之人，對於善意之相對人因而所受之損害，應就其所應負責部分與公司負連帶賠償責任：一、發行人及其負責人；二、發行人之職員，曾在公開說明書上簽章，以證實其所載內容者；三、證券承銷商；四、會計師、律師、工程師或其他專門職業或技術人員，曾在公開說明書上簽章，以證實其所載內容之全部或一部，或陳述意見者。',
},
'securities-trading-practice-ch06-pdf-0055': {
 'question': '期信ETF在最近＿＿個營業日之基金平均單位淨資產價值較其最初單位淨資產價值累積跌幅達＿＿以上者，自公告後次一營業日起暫停融資融券交易、停止有價證券借貸及當日沖銷交易。',
 'options': {'1':'10個、50%','2':'10個、65%','3':'30個、50%','4':'30個、65%'},
 'explanation': '依證交所「受益憑證買賣辦法」§23第1項規定，指數股票型期貨信託基金受益憑證最近10個營業日之基金平均單位淨資產價值較其最初單位淨資產價值累積跌幅達65%以上者，於證交所公告後次一營業日起，暫停融資融券交易、停止有價證券借貸及當日沖銷交易。',
},
'investment-ch09-pdf-0057': {
 'question': '某證券公司發行一年期結構型債券（Structured Notes）的贖回金額公式如下：贖回金額＝投資本金×{1＋Max[5%，（10%×S&P 500指數成長率）]}，下列有關此債券的敘述，何者為正確？',
 'options': {'1':'為不保本、參與率5%的股權連結商品（ELN）','2':'為不保本、參與率100%的股權連結商品（ELN）','3':'為100%保本、參與率15%的保本型商品（PGN）','4':'為105%保本、參與率10%的保本型商品（PGN）'},
 'explanation': '保本型商品（PGN）的基本設計架構是一個固定收益證券加上買進選擇權的組合；固定收益證券提供投資人到期時的固定收益（保本），而買進選擇權則是投資人可能的收益來源。該商品在S&P指數上漲時才可獲取額外收益，故為看多型保本債券。保本率是保障投資人到期時可拿回的最低金額與期初投資本金之比率，本題保障投資本金的105%；參與率是投資人參與選擇權獲利的比率，本題為10%。',
},
})


# Sixty-two final high-risk records were visually checked against the project
# scan contact sheets. Storing the complete reviewed fields here prevents a
# future OCR regeneration from restoring clipped options, page-number bleed,
# or formula fragments. No external notes or question bank were used.
merge_overrides({'investment-ch01-pdf-0039': {'question': '風險愛好者對每增加一單位風險,所要求的新增報酬率,會如何變化？',
                              'options': {'1': '遞增', '2': '遞減', '3': '不變', '4': '不一定'},
                              'explanation': '對於風險規避者、風險愛好者、風險中立者，可分別以圖形表示。風險規避者：當風險增加時，其所要求的新增報酬率會增加。風險愛好者：當風險增加時，其所要求的新增報酬率會減少。風險中立者：當風險增加時，其所要求的新增報酬率會不變。'},
 'investment-ch04-pdf-0028': {'question': '下列何者是行情多頭之訊號？',
                              'options': {'1': 'W底', '2': 'M頭', '3': '寶塔線翻紅', '4': '價穩量縮'},
                              'explanation': 'W底屬於底部區的型態,代表股價在打底完成後將會走出一波的多頭走勢,屬反轉型態。'},
 'investment-ch04-pdf-0077': {'question': '「頭肩頂」的成交量在何處最大？',
                              'options': {'1': '右肩', '2': '左肩', '3': '頭部', '4': '頸線'},
                              'explanation': '頭肩頂即M頭,在左肩處量最大。'},
 'investment-ch04-pdf-0133': {'question': '在修正型的OBV公式中,以最高價減去收盤價,表示買方或賣方的力道何者較強？',
                              'options': {'1': '買方', '2': '賣方', '3': '買賣雙方持平', '4': '無法判斷'},
                              'explanation': '在修正型OBV中,以最高價減去收盤價,表示收盤價小於最高價,則賣方力道較強。'},
 'investment-ch05-pdf-0004': {'question': '一家公司的股東權益報酬率過低,以下何者「不是」其主要原因？',
                              'options': {'1': '淨利率過低', '2': '資產週轉率太低', '3': '自有資金比率太高', '4': '股權過度集中'},
                              'explanation': '股東權益報酬率＝（淨利－特別股股利）／銷貨收入×銷貨收入／平均總資產×平均總資產／平均股東權益。'},
 'investment-ch05-pdf-0006': {'question': '進口油價上漲是屬於經濟的：',
                              'options': {'1': '需求面', '2': '供給面', '3': '貨幣面', '4': '資金面'},
                              'explanation': '需求面指消費、投資、政府支出及淨出口。供給面指勞工、原物料等。'},
 'investment-ch05-pdf-0039': {'question': '已知甲公司之總流動負債為200萬元,總流動資產為700萬元,存貨為100萬元,則速動比率為：',
                              'options': {'1': '5', '2': '4', '3': '3', '4': '2'},
                              'explanation': '速動比率＝速動資產／流動負債＝（流動資產－存貨－預付費用）／流動負債＝（700萬－100萬）／200萬＝3。'},
 'investment-ch05-pdf-0110': {'question': '何者「不是」高科技產業的特色？',
                              'options': {'1': '產業快速成長', '2': '產品市場具有世界性', '3': '產品生命週期長', '4': '涉及先進或多領域技術'},
                              'explanation': '高科技產業產品的生命週期通常較短,因為其重視研究發展, 產品汰換快。選項(1)(2)(4)皆是高科技產業的特性。'},
 'investment-ch05-pdf-0151': {'question': '失業率是指：',
                              'options': {'1': '失業人數除以就業人數', '2': '失業人數除以勞動力', '3': '失業人數除以(勞動力+非勞動力)', '4': '失業人數除以總人口'},
                              'explanation': '失業率＝失業人數／勞動力；勞動力＝就業人數＋失業人數；非勞動力包括學生、殘障、料理家務者等。'},
 'investment-ch07-pdf-0017': {'question': '理論上,充分分散風險之投資組合報酬率,與市場投資組合報酬率相關係數等於',
                              'options': {'1': '1', '2': '0.5', '3': '0', '4': '－0.5'},
                              'explanation': '充分分散風險之投資組合是指透過多角化的投資方式來消除非系統風險,而只剩下與市場因素密切相關的系統風險,所以這兩種的相關係數為+1。'},
 'investment-ch08-pdf-0066': {'question': '有關投資政策的描述通常不包括：',
                              'options': {'1': '投資目標', '2': '可採行的投資策略', '3': '投資限制', '4': '選股準則'},
                              'explanation': '投資政策的描述為包含投資目標、可採行的投資策略及投資限制,但並不包含選股準則。'},
 'investment-ch09-pdf-0029': {'question': '其他條件不變下，權證價值之敘述何者正確？甲、股價上漲，認售權證價值下跌；乙、履約價格越高，認購權證價值越高；丙、存續期間愈長，認購權證價值愈高，認售權證價值愈低；丁、股價波動大，認購權證及認售權證價值提高。',
                              'options': {'1': '僅甲、乙', '2': '僅甲、丁', '3': '僅乙、丙', '4': '甲、乙、丙、丁'},
                              'explanation': '| 因素 | 認購權證 | 認售權證 |\n'
                                             '|---|---|---|\n'
                                             '| 標的股價 | 股價上漲，權證價值提高 | 股價上漲，權證價值降低 |\n'
                                             '| 履約價格 | 履約價格愈高，權證價值愈低 | 履約價格愈高，權證價值愈高 |\n'
                                             '| 標的波動 | 波動愈大，價值愈高 | 波動愈大，價值愈高 |\n'
                                             '| 存續期間 | 期間愈長，價值愈大 | 期間愈長，價值愈大 |'},
 'financial-analysis-ch02-pdf-0004': {'question': '威廉公司的應收帳款週轉率為20,營業循環為40天,請問存貨週轉率為何(一年以365天計算)？',
                                      'options': {'1': '16.78', '2': '24.33', '3': '33.46', '4': '50.125'},
                                      'explanation': '營業循環＝存貨週轉期間＋應收帳款週轉期間；40＝365／存貨週轉率＋365／20，存貨週轉率＝16.78。'},
 'financial-analysis-ch02-pdf-0033': {'question': '彰化公司於X1年12月31日的期末存貨明細如下，試以成本與淨變現價值孰低法評價，該公司商品之期末存貨評價為多少？\n'
                                                  '\n'
                                                  '| 產品 | 數量 | 單位成本 | 單位淨變現價值 |\n'
                                                  '|---|---:|---:|---:|\n'
                                                  '| 登山腳踏車 | 11 | $14,400 | $13,200 |\n'
                                                  '| 滑板 | 13 | $8,400 | $10,200 |\n'
                                                  '| 滑翔翼 | 26 | $19,200 | $16,800 |',
                                      'options': {'1': '$714,600', '2': '$766,800', '3': '$691,200', '4': '$790,200'},
                                      'explanation': '$13,200×11＋$8,400×13＋$16,800×26＝$691,200。'},
 'financial-analysis-ch03-pdf-0017': {'question': '已知甲公司 X1年度自由現金流量為$25,000,當年度資本支出共 '
                                                  '$25,000,無任何現金股利,當年度平均流動負債$100,000、平均流動資產$80,000,假設無其他攸關項目下,請問該公司當年度營業淨現金流量對流動負債比率為若干：',
                                      'options': {'1': '0.56', '2': '0.5', '3': '0.39', '4': '0.28'},
                                      'explanation': '營業活動淨現金流量＝$25,000＋$25,000＝$50,000。營業淨現金流量對流動負債比率＝營業活動淨現金流量／平均流動負債＝$50,000／$100,000＝0.5。'},
 'financial-analysis-ch04-pdf-0030': {'question': '存出保證金之性質為：',
                                      'options': {'1': '資產', '2': '負債', '3': '收入', '4': '費用'},
                                      'explanation': '存出保證金為公司存放在他處作為保證用之現金,仍屬公司之資產。'},
 'financial-analysis-ch04-pdf-0037': {'question': '不動產重估增值之性質為：',
                                      'options': {'1': '負債', '2': '資產', '3': '收入', '4': '權益'},
                                      'explanation': '不動產重估增值應列為權益項下之其他權益項目。'},
 'financial-analysis-ch04-pdf-0059': {'question': '股票發行溢價列為：',
                                      'options': {'1': '負債', '2': '資產之減項', '3': '權益', '4': '利益'},
                                      'explanation': '公司發行股票時,發行價格大於面額部分計入資本公積,列在權益中。'},
 'financial-analysis-ch04-pdf-0102': {'question': '下列何者屬無形資產？：',
                                      'options': {'1': '預付費用', '2': '應收帳款', '3': '商標權', '4': '研究支出'},
                                      'explanation': '商標為可明確辨認之無形資產,就是沒有形體,但成本及價值可明白指出者。選項(1)屬流動資產。選項(2)屬流動資產。選項(4)為當期費用。'},
 'financial-analysis-ch05-pdf-0011': {'question': '淨值為正之公司,舉債購買不動產、廠房及設備將使權益比率：',
                                      'options': {'1': '降低', '2': '提高', '3': '不變', '4': '不一定'},
                                      'explanation': '舉債購買不動產、廠房及設備,資產總額增加而權益不變, 故權益比率(權益÷總資產)會下降。'},
 'financial-analysis-ch05-pdf-0035': {'question': '某公司稅前純益為$200,000,第一優先債券利息費用為$30,000,第二優先債券利息費用$10,000,第三優先債券利息費用$20,000,則第二優先債券盈餘支付利息倍數為何？',
                                      'options': {'1': '5', '2': '4', '3': '3', '4': '6.5'},
                                      'explanation': '第二優先債券盈餘支付利息倍數＝（$200,000＋$30,000＋$10,000＋$20,000）／（$30,000＋$10,000）＝6.5。'},
 'financial-analysis-ch05-pdf-0036': {'question': '甲公司速動比率為1.4,預付費用為流動資產的10%,存貨為流動資產的 20%,則流動比率為',
                                      'options': {'1': '2', '2': '2.22', '3': '1.75', '4': '1.94'},
                                      'explanation': '速動比率＝（流動資產－存貨－預付費用）／流動負債＝流動資產×（1－0.2－0.1）／流動負債＝1.4。流動比率＝流動資產／流動負債＝1.4／（1－0.2－0.1）＝2。'},
 'financial-analysis-ch06-pdf-0004': {'question': '大分公司本益比為60,股利支付率為75%,今知每股股利為$8,則普通股每股市價應為多少？',
                                      'options': {'1': '$32', '2': '$240', '3': '$640', '4': '$480'},
                                      'explanation': '本益比＝股利支付率／股利收益率＝75%／股利收益率＝60，故股利收益率＝75%／60＝0.0125。又股利收益率＝普通股每股股利／普通股每股市價＝$8／普通股每股市價，所以普通股每股市價＝$8／0.0125＝$640。'},
 'financial-analysis-ch06-pdf-0007': {'question': '山崎公司X1年度平均總資產$150,000,銷貨$60,000,其淨利 $3,000,稅率25%,利息前淨利率12.5%,則該公司總資產報酬率為何？',
                                      'options': {'1': '10%', '2': '8%', '3': '5%', '4': '4%'},
                                      'explanation': '總資產報酬率＝利息前淨利率×總資產週轉率＝12.5%×（$60,000／$150,000）＝5%。'},
 'financial-analysis-ch06-pdf-0015': {'question': '高知公司X1年度平均總資產$160,000,銷貨$50,000,其稅後淨利 $25,000,稅率25%,平均財務槓桿比率為2,則該公司權益報酬率為何？',
                                      'options': {'1': '18.75%', '2': '31.25%', '3': '12.5%', '4': '25%'},
                                      'explanation': '權益報酬率＝淨利率×總資產週轉率×平均財務槓桿比率＝（$25,000／$50,000）×（$50,000／$160,000）×2＝31.25%。'},
 'financial-analysis-ch06-pdf-0024': {'question': '甲公司X1年度財務資料如下，試問其權益報酬率為何？\n'
                                                  '\n'
                                                  '| 項目 | X1年度／X1年12月31日 | X1年1月1日 |\n'
                                                  '|---|---:|---:|\n'
                                                  '| 資產總額 | $200,000 | $150,000 |\n'
                                                  '| 負債總額 | $100,000 | $75,000 |\n'
                                                  '| 銷貨收入 | $500,000 | |\n'
                                                  '| 利息費用 | $8,000 | |\n'
                                                  '| 稅前淨利 | $10,000 | |\n'
                                                  '| 所得稅率 | 25% | |',
                                      'options': {'1': '8.57%', '2': '10.91%', '3': '13.33%', '4': '14.55%'},
                                      'explanation': '權益報酬率＝$10,000×（1－25%）／{[（$200,000－$100,000）＋（$150,000－$75,000）]／2}＝8.57%。'},
 'financial-analysis-ch06-pdf-0044': {'question': '偉鈞公司的總資產報酬率為12%,淨利率為6%,淨銷貨收入為 $200,000,試問平均總資產為多少？(假設公司未舉債)',
                                      'options': {'1': '$200,000', '2': '$100,000', '3': '$5,000', '4': '$8,000'},
                                      'explanation': '總資產報酬率＝淨利率×（銷貨收入淨額／平均資產總額）。12%＝6%×（$200,000／平均資產總額），故平均資產總額＝$100,000。'},
 'financial-analysis-ch07-pdf-0006': {'question': '牛津公司只生產並銷售一種產品,當銷貨量增加30%,則營業利益增加90%,X1年銷貨額$500,000,稅後淨利$124,500,無利息費用亦無其他營業外的收入與費用,稅率17%,則其變動成本及費用為何？',
                                      'options': {'1': '$350,000', '2': '$50,000', '3': '$150,000', '4': '選項(1)(2)(3)皆非'},
                                      'explanation': '營運槓桿度＝90%／30%＝3。又營運槓桿度＝邊際貢獻／EBIT，故邊際貢獻＝3×（$124,500／0.83）＝$450,000。變動成本及費用＝$500,000－$450,000＝$50,000。'},
 'financial-analysis-ch07-pdf-0054': {'question': '久久公司X1年度的營業收入為$2,000,000,營業利益為$400,000, 變動營業成本及費用$600,000,則X1年度其營運槓桿度為',
                                      'options': {'1': '1.8', '2': '2.0', '3': '2.5', '4': '3.5'},
                                      'explanation': '營運槓桿度＝（$2,000,000－$600,000）／$400,000＝3.5。'},
 'financial-analysis-ch07-pdf-0078': {'question': '華豐電子為非金融業之科技公司,其利息收入應列為：',
                                      'options': {'1': '營業收入', '2': '營業外收入', '3': '特殊損益', '4': '選項(1)(2)(3)皆可'},
                                      'explanation': '除了金融業之外,利息收入皆為營業外收入。'},
 'financial-analysis-ch07-pdf-0082': {'question': '查理公司上季季報表指出其指定用途保留盈餘為2億元,未指定用途保留盈餘是1億元：',
                                      'options': {'1': '其現金餘額至少為1億元', '2': '其可發放現金股利至少為1億元', '3': '其可發放現金股利至少為3億元', '4': '選項(1)(2)(3)皆非'},
                                      'explanation': '保留盈餘之指撥與現金之限制用途不同,且不相關。'},
 'financial-analysis-ch07-pdf-0117': {'question': '下列何種事項不會造成保留盈餘減少？',
                                      'options': {'1': '前期折舊費用低估之錯誤更正', '2': '本期淨損', '3': '宣告分配股票股利', '4': '公司分配清算股利'},
                                      'explanation': '| 保留盈餘減少 | 保留盈餘增加 |\n'
                                                     '|---|---|\n'
                                                     '| 本期淨損 | 本期淨利 |\n'
                                                     '| 前期損益調整（分錄借記者） | 前期損益調整（分錄貸記者） |\n'
                                                     '| 支付股利（不包括清算股利之支付） | 公司重整（準改組）之調整（分錄貸記者） |\n'
                                                     '| 庫藏股票交易造成淨資產減少 | |\n'
                                                     '\n'
                                                     '清算股利之宣告支付係借記「資本公積（或股本）」、貸記「現金」，不會造成保留盈餘減少，故答案為選項（4）。'},
 'financial-analysis-ch07-pdf-0146': {'question': '大安公司X1年8月1日有存貨60件,每件成本價$60,當月進貨 90件,銷售105件,採定期盤存制及加權平均成本公式。若X1年8月31日存貨成本為$2,538,請問:當月進貨單位成本為多少？',
                                      'options': {'1': '$54', '2': '$55', '3': '$56.4', '4': '$60.0'},
                                      'explanation': '期末存貨數量＝60＋90－105＝45件；加權平均單位成本＝$2,538／45＝$56.4。$60×（60／150）＋進貨單位成本×（90／150）＝$56.4，解得進貨單位成本＝$54。'},
 'financial-analysis-ch08-pdf-0019': {'question': '甲公司X3年1月1日有普通股300,000股流通在外,4月1日甲公司給予公司高級主管認股選擇權,當日成為既得,可按每股$40認購普通股120,000股,至X3年底均未行使。甲公司普通股自X3年4月初至年底平均市價為每股$50,X3年淨利為$477,000,則甲公司X3年度之稀釋每股盈餘為何？',
                                      'options': {'1': '$1.59', '2': '$1.50', '3': '$1.47', '4': '$1.22'},
                                      'explanation': '認股權行使所增加股數＝120,000－（$40×120,000／$50）＝24,000股。稀釋每股盈餘＝$477,000／[300,000＋24,000×（9／12）]＝$1.5。'},
 'financial-analysis-ch08-pdf-0047': {'question': '大南公司之資料如下,X1年度純益$6,000,000,所得稅率17%,普通股400,000股,全年流通在外,每股面額$10。另有5%累積可轉換特別股600,000股,每股面額$100,可轉換成普通股3股;可轉換公司債$6,000,000,票面利率6%,平價發行,每$1,000面額可轉換成普通股20股。試問其基本每股盈餘為何？',
                                      'options': {'1': '$7.5', '2': '$5', '3': '$8.775', '4': '$6.6'},
                                      'explanation': '基本每股盈餘＝[$6,000,000－（$100×600,000×5%）]／400,000＝$7.5。'},
 'financial-analysis-ch10-pdf-0010': {'question': '我們可以把折現率當成下列哪兩項之和？',
                                      'options': {'1': '本益比及股利收益率', '2': '投資報酬率及本益比', '3': '股利殖利率及股利成長率', '4': '純益率及資產週轉率'},
                                      'explanation': '依股利成長模式：每股市價＝次期股利／（折現率－股利成長率）。整理得折現率＝次期股利／目前每股市價＋股利成長率＝股利殖利率＋股利成長率。'},
 'financial-analysis-ch10-pdf-0025': {'question': '政府常允許企業報稅時採用加速折舊法,其目的在於',
                                      'options': {'1': '鼓勵企業從事投資', '2': '收較多的稅', '3': '讓企業儘量不要投資於長期性資產', '4': '讓企業資產在使用期間裡所提列折舊的總數增加'},
                                      'explanation': '企業報稅時採用加速折舊法，可在早期繳納較少稅額，故可鼓勵企業從事投資。'},
 'financial-analysis-ch10-pdf-0136': {'question': '投資計畫評估現金流量應採何基礎？：',
                                      'options': {'1': '稅前', '2': '稅後', '3': '機會成本', '4': '稅盾效果'},
                                      'explanation': '基於公司所收到的現金流量都必須考慮到所得稅,故評估投資案之現金流量應採稅後基礎計算,才能完全反映出此投資案對公司的真實價值。'},
 'securities-trading-regulations-ch01-pdf-0083': {'question': '董事為自己或他人與公司為買賣、借貸或其他法律行為時,由何者為公司之代表？',
                                                  'options': {'1': '股東', '2': '董事長', '3': '經理人', '4': '監察人'},
                                                  'explanation': '依「公司法」§223規定,董事為自己或他人與公司為買賣、 借貸或其他法律行為時,由監察人為公司之代表。'},
 'securities-trading-regulations-ch03-pdf-0055': {'question': '公開發行公司之內部人(如董監、經理人等)喪失其身分後,未滿多久前仍受「證券交易法」第一百五十七條之一(內線交易)的規範？',
                                                  'options': {'1': '3個月', '2': '6個月', '3': '9個月', '4': '12個月'},
                                                  'explanation': '依「證券交易法」§157-1第1項規定。'},
 'securities-trading-regulations-ch04-pdf-0113': {'question': '證券商成交回報單保存期限為：',
                                                  'options': {'1': '3年', '2': '5年', '3': '10年', '4': '永久保存'},
                                                  'explanation': '依「證券商帳表憑證保存年限表」規定得知,證券商買賣報告書、委託書、成交回報單之保存年限為五年。'},
 'securities-trading-regulations-ch05-pdf-0073': {'question': '會員制證券交易所之會員不得少於幾人？',
                                                  'options': {'1': '五人', '2': '七人', '3': '九人', '4': '十人'},
                                                  'explanation': '依「證券交易法」§104規定,會員制證券交易所之會員,不得少於七人。'},
 'securities-trading-regulations-ch05-pdf-0080': {'question': '私人間直接讓受上市公司之有價證券,而不於證券交易所開設之有價證券集中交易市場為之,除其前後兩次之讓受行為,相隔不少於三個月外,且其數量尚需符合下列何項規定？',
                                                  'options': {'1': '不超過該證券一個成交單位', '2': '不超過該證券三個成交單位', '3': '不超過該證券五個成交單位', '4': '不超過該證券十個成交單位'},
                                                  'explanation': '依「證券交易法」§150第3款規定，私人間之直接讓受，其數量不超過該證券一個成交單位；前後兩次之讓受行為，相隔不少於三個月者。'},
 'securities-trading-regulations-ch06-pdf-0061': {'question': '投資人與證券投資顧問公司簽訂之「契約」，在法律上，其性質屬於：',
                                                  'options': {'1': '承攬關係', '2': '買賣關係', '3': '委任關係', '4': '代理關係'},
                                                  'explanation': '依「證券投資信託及顧問法」§83規定,證券投資顧問事業接受客戶委任,對證券投資或交易有關事項提供分析意見或推介建議時,應訂定書面證券投資顧問契約,載明雙方權利義務;故為委任關係。'},
 'securities-trading-practice-ch01-pdf-0005': {'question': '下列何者非我國貨幣市場流通之主要信用工具？',
                                               'options': {'1': '國庫券', '2': '上市公司股票', '3': '銀行承兌匯票', '4': '商業本票'},
                                               'explanation': '我國目前在貨幣市場流通之信用工具主要有：國庫券、商業本票、銀行承兌匯票及可轉讓定期存單等。'},
 'securities-trading-practice-ch03-pdf-0038': {'question': '我國資本額達新臺幣100億元之上市上櫃公司之合併財務報告子公司,應自何時起完成溫室氣體盤查之資訊揭露？',
                                               'options': {'1': '2023年', '2': '2025年', '3': '2027年', '4': '2029年'},
                                               'explanation': '依金管證發字第11203852314號令:二、上市上櫃公司自113年起應揭露氣候相關資訊,其中有關溫室氣體盤查及確信相關資訊依下列時程辦理: '
                                                              '(一)實收資本額達新臺幣100億元以上之上市上櫃公司、鋼鐵業及水泥業之母公司個體,應自113年起完成溫室氣體盤查及確信資訊揭露。 '
                                                              '(二)實收資本額達新臺幣100億元以上之上市上櫃公司、鋼鐵業及水泥業之合併財務報告子公司,及實收資本額達新臺幣50億元以上且未達100億元之上市上櫃公司之母公司個體,應自114年起完成盤查資訊揭露,116年起完成確信資訊揭露。 '
                                                              '(三)實收資本額達新臺幣50億元以上且未達100億元之上市上櫃公司之合併財務報告子公司,及實收資本額未達新臺幣50億元之上市上櫃公司之母公司個體,應自115年起完成盤查資訊揭露,117年起完成確信資訊揭露。 '
                                                              '(四)實收資本額未達新臺幣50億元之上市上櫃公司之合併財務報告子公司,應自116年起完成盤查資訊揭露,118年起完成確信資訊揭露。'},
 'securities-trading-practice-ch03-pdf-0039': {'question': '我國資本額達新臺幣100億元之上市上櫃公司之合併財務報告子公司,應自何時起完成溫室氣體盤查之確信資訊揭露？',
                                               'options': {'1': '2023年', '2': '2025年', '3': '2027年', '4': '2029年'},
                                               'explanation': '依金管證發字第11203852314號令:二、上市上櫃公司自113年起應揭露氣候相關資訊,其中有關溫室氣體盤查及確信相關資訊依下列時程辦理: '
                                                              '(一)實收資本額達新臺幣100億元以上之上市上櫃公司、鋼鐵業及水泥業之母公司個體,應自113年起完成溫室氣體盤查及確信資訊揭露。 '
                                                              '(二)實收資本額達新臺幣100億元以上之上市上櫃公司、鋼鐵業及水泥業之合併財務報告子公司,及實收資本額達新臺幣50億元以上且未達100億元之上市上櫃公司之母公司個體,應自114年起完成盤查資訊揭露,116年起完成確信資訊揭露。 '
                                                              '(三)實收資本額達新臺幣50億元以上且未達100億元之上市上櫃公司之合併財務報告子公司,及實收資本額未達新臺幣50億元之上市上櫃公司之母公司個體,應自115年起完成盤查資訊揭露,117年起完成確信資訊揭露。 '
                                                              '(四)實收資本額未達新臺幣50億元之上市上櫃公司之合併財務報告子公司,應自116年起完成盤查資訊揭露,118年起完成確信資訊揭露。'},
 'securities-trading-practice-ch05-pdf-0003': {'question': '現行法令允許本國人可赴海外發行有價證券之種類,包括下列何者？ 甲、海外公司債;乙、海外存託憑證;丙、海外票券;丁、海外股票',
                                               'options': {'1': '僅甲、乙、丙', '2': '僅乙、丙、丁', '3': '僅甲、乙、丁', '4': '甲、乙、丙、丁皆是'},
                                               'explanation': '依「發行人募集與發行海外有價證券處理準則」§3第1項規定,上市公司或上櫃公司,得申報募集與發行海外公司債、海外股票、 '
                                                              '參與發行海外存託憑證及申報其已發行之股票於國外證券市場交易。'},
 'securities-trading-practice-ch07-pdf-0012': {'question': '依「公開發行公司出席股東會使用委託書規則」規定,持有已發行股份總數10%以上之股東,且繼續持有多少期間以上,得委託信託事業擔任委託書徵求人？',
                                               'options': {'1': '半年', '2': '一年', '3': '二年', '4': '三年'},
                                               'explanation': '依「公開發行公司出席股東會使用委託書規則」§6規定,繼續一年以上持有公司已發行股份符合下列條件之一者,得委託信託事業或股務代理機構擔任徵求人。第一項:金融控股公司、銀行法所規範之銀行及保險法所規範之保險公司召開股東會,股東及其關係人應持有公司已發行股份總數10%以上。'},
 'securities-trading-practice-ch07-pdf-0032': {'question': '上市櫃公司執行庫藏股於市場買回股份,下列何者非為法律所允許之買回目的？',
                                               'options': {'1': '轉讓股份給員工',
                                                           '2': '配合可轉讓公司債之發行,作為股權轉換之用',
                                                           '3': '為維護公司信用及股東權益,並辦理銷除股份者',
                                                           '4': '預計日後公司營運需求做抵押用'},
                                               'explanation': '依「證券交易法」§28-2第1項規定。'},
 'securities-trading-practice-ch09-pdf-0009': {'question': '科技事業申請上市,其申請上市最近期財務報告之淨值,不得低於財務報告所列示股本多少？',
                                               'options': {'1': '2／5', '2': '3／4', '3': '2／3', '4': '1／2'},
                                               'explanation': '依「證交所有價證券上市審查準則」§5規定,申請股票上市之發行公司,經中央目的事業主管機關出具其係屬科技事業或文化創意事業之明確意見書,除應符合該準則有關規定外,其申請上市最近期財務報告之淨值,不得低於財務報告所列示股本2/3者。'},
 'securities-trading-practice-ch09-pdf-0070': {'question': '證券商接受委託人以定期定股及定期定額方式委託買賣外國有價證券,買賣標的以中長期投資為原則,以下哪項不在投資範圍之內？',
                                               'options': {'1': '股票', '2': '存託憑證', '3': '反向型ETF受益憑證', '4': '選項(1)(2)(3)均在投資範圍之內'},
                                               'explanation': '依券商公會「證券商受託買賣外國有價證券管理辦法」§15-3 '
                                                              '第1項規定,證券商接受委託人以定期定股及定期定額方式委託買賣外國有價證券,買賣標的以中長期投資為原則,並以股票、受益憑證及存託憑證為限,受益憑證範圍僅限不具槓桿或放空效果之指數股票型基金…。'},
 'securities-trading-practice-ch09-pdf-0091': {'question': '上市有價證券零股交易盤後買賣之申報時間為何？',
                                               'options': {'1': '13:40～14:30', '2': '13:00～14:00', '3': '14:30～15:00', '4': '9:00～13:00'},
                                               'explanation': '依「證交所上市股票零股交易辦法」§3第1項規定,零股交易買賣申報時間為9:00~13:30,及盤後13:40~14:30;其買賣申報限各該交易時段內有效。第2項規定,零股交易買賣申報應以限價為之, '
                                                              '且限當日有效;變更買賣申報時,除減少申報數量外,應先撤銷原買賣申報,再重新申報。'},
 'securities-trading-practice-ch09-pdf-0119': {'question': '證券集中市場交割作業目前由下列哪一機構負責統籌收付股票？',
                                               'options': {'1': '臺灣集中保管結算所', '2': '證交所', '3': '證券金融公司', '4': '綜合證券商'},
                                               'explanation': '依「證交所營業細則」§101第二項規定,集中市場買賣成交之有價證券收付作業,證券交易所委由證券集中保管事業辦理。'},
 'securities-trading-practice-ch09-pdf-0135': {'question': '臺灣創新板漲跌幅限制為(除上市首5個交易日外)：',
                                               'options': {'1': '7%', '2': '10%', '3': '20%', '4': '無漲跌幅限制'},
                                               'explanation': '創新板上市首5個交易日不設漲跌幅限制,之後漲跌幅限制為10%。'},
 'securities-trading-practice-ch10-pdf-0002': {'question': '我國店頭市場受櫃買中心及下列何機構監督？',
                                               'options': {'1': '臺灣證券交易所', '2': '金融監督管理委員會', '3': '經濟部', '4': '中華民國證券商業同業公會'},
                                               'explanation': '集中市場及店頭市場的主管機關皆為金融監督管理委員會。'},
 'securities-trading-practice-ch10-pdf-0007': {'question': '公營事業申請股票在櫃檯買賣者,得不受下列哪些限制？',
                                               'options': {'1': '設立年限', '2': '股權分散', '3': '董事與大股東股份集保', '4': '選項(1)(2)(3)皆是'},
                                               'explanation': '依「櫃買中心證券商營業處所買賣有價證券審查準則」§3第2項規定,公營事業申請股票在櫃檯買賣者,得不受第1項第2~4款及第7款規定之限制。'},
 'securities-trading-practice-ch10-pdf-0008': {'question': '下列何種行業,其股票要在櫃檯買賣,需先取得目的事業主管機關之同意函？',
                                               'options': {'1': '營建業', '2': '石化業', '3': '服務業', '4': '證券業'},
                                               'explanation': '依「櫃買中心證券商營業處所買賣有價證券審查準則」§3第3項規定,證券業、期貨業、金融業及保險業申請其股票為櫃檯買賣, 應先取得目的事業主管機關之同意函。'},
 'securities-trading-practice-ch10-pdf-0111': {'question': '興櫃股票交易漲跌幅度的限制為：',
                                               'options': {'1': '7%', '2': '10%', '3': '20%', '4': '沒有漲跌幅的限制'},
                                               'explanation': '依「櫃買中心興櫃股票買賣辦法」§18規定,股票之櫃檯買賣,每一營業日之成交價格無升降幅度之限制。'},
 'securities-trading-practice-ch11-pdf-0013': {'question': '因融券而標借、議借、標購所產生之費用,由何人負擔？',
                                               'options': {'1': '融資人', '2': '可以議定', '3': '證券商', '4': '融券人'},
                                               'explanation': '依「證券商辦理有價證券買賣融資融券業務操作辦法」§52 '
                                                              '第2項規定,證券商因證券金融事業辦理標借、議借、標購應負擔之各項費用,由委託人負擔,證券商並應按證券差額發生日收取融券手續費之該種有價證券融券餘額,依所列原則計算融券人每股所應分擔之費用後,分別向各該融券人按其融券數量計收。'},
 'securities-trading-practice-ch12-pdf-0011': {'question': '一組合型基金至少會有幾個子基金？',
                                               'options': {'1': '2', '2': '3', '3': '5', '4': '10'},
                                               'explanation': '依「證券投資信託基金管理辦法」§43規定,每一組合型基金至少應投資5個以上子基金,且每個子基金最高投資上限不得超過組合型基金淨資產價值之30%。'},
 'securities-trading-practice-ch12-pdf-0030': {'question': '境外基金之銷售機構最多得在國內代理幾個境外基金之募集與銷售？',
                                               'options': {'1': '1個', '2': '3個', '3': '5個', '4': '未有限制'},
                                               'explanation': '參「境外基金管理辦法」§3第3項,銷售機構得在國內代理一個以上境外基金之募集及銷售。'}})


# Additional scan crops found by the final Unicode/anomaly audit.
# Each field below was read directly from the project scan image.
merge_overrides({
'investment-ch01-pdf-0049': {
 'explanation': '公司盈餘以股票形式分配給股東，即盈餘轉增資，也稱為盈餘配股。資本公積轉增資亦是股票股利之一。公司債發行時附上認股權，即為附認股權公司債，持有者得於約定期間內，依約定之認股價格向發行公司請求認購一定數量之股票。股票分割對公司的資本結構不會產生影響，只會使發行在外的股票總數增加。',
},
'investment-ch03-pdf-0048': {
 'question': '公司減資有三種類型，包括有庫藏股減資、現金減資與虧損減資，試問在公司沒有虧損的情況之下，三種減資對公司影響的效果，下列何者正確？I、均會使公司流通在外股數減少；II、均會使公司每股淨值增加；III、均會使公司股票價格上漲；IV、均會使公司每股盈餘上升。',
 'options': {'1':'I、II、III、IV','2':'僅I、II、IV','3':'僅II、III','4':'僅I、IV'},
 'explanation': 'II、錯。庫藏股減資時，若股票買回之股價高於面額，則每股淨值會下跌；若股票買回之股價等於或低於面額，則每股淨值會上漲。另外，現金減資及虧損減資則都會造成每股淨值上漲。III、錯。股價不一定漲，需視基本面而定。',
},
'investment-ch06-pdf-0090': {
 'explanation': 'ρ甲乙＝Cov甲乙／（σ甲×σ乙）。將σ甲＝0.3、σ乙＝0.2、ρ甲乙＝0.5代入上式：0.5＝Cov甲乙／（0.3×0.2），故Cov甲乙＝0.03。',
},
'financial-analysis-ch07-pdf-0149': {
 'explanation': '製成品成本＝$525,000＋$420,000＝$945,000。淨變現價值＝$980,000－$17,500＝$962,500。成本＜淨變現價值，製成品未產生跌價，原材料不須提列存貨跌價損失。',
},
'securities-trading-regulations-ch01-pdf-0075': {
 'explanation': '選項（1）正確，依「公司法」§177第3項規定：「一股東以出具一委託書，並以委託一人為限，應於股東會開會五日前送達公司，委託書有重複時，以最先送達者為準。但聲明撤銷前委託者，不在此限。」選項（2）錯誤，依「公司法」§172-1第1項規定：「持有已發行股份總數百分之一以上股份之股東，得向公司提出股東常會議案。但以一項為限，提案超過一項者，均不列入議案。」選項（3）正確，依「公司法」§172-1第2項規定：「公司應於股東常會召開前之停止股票過戶日前，公告受理股東之提案、書面或電子受理方式、受理處所及受理期間；其受理期間不得少於十日。」選項（4）正確，依「公司法」§172第5項規定：「選任或解任董事、監察人、變更章程、減資、申請停止公開發行、董事競業許可、盈餘轉增資、公積轉增資、公司解散、合併、分割或第一百八十五條第一項各款之事項，應在召集事由中列舉並說明其主要內容，不得以臨時動議提出。」',
},
})

SPOT_VISUAL_REVIEW_IDS = {
    'investment-ch01-pdf-0049',
    'investment-ch03-pdf-0048',
    'investment-ch06-pdf-0090',
    'financial-analysis-ch07-pdf-0149',
    'securities-trading-regulations-ch01-pdf-0075',
}

FINAL_VISUAL_REVIEW_IDS = {
    'investment-ch01-pdf-0039',
    'investment-ch04-pdf-0028',
    'investment-ch04-pdf-0077',
    'investment-ch04-pdf-0133',
    'investment-ch05-pdf-0004',
    'investment-ch05-pdf-0006',
    'investment-ch05-pdf-0039',
    'investment-ch05-pdf-0110',
    'investment-ch05-pdf-0151',
    'investment-ch07-pdf-0017',
    'investment-ch08-pdf-0066',
    'investment-ch09-pdf-0029',
    'financial-analysis-ch02-pdf-0004',
    'financial-analysis-ch02-pdf-0033',
    'financial-analysis-ch03-pdf-0017',
    'financial-analysis-ch04-pdf-0030',
    'financial-analysis-ch04-pdf-0037',
    'financial-analysis-ch04-pdf-0059',
    'financial-analysis-ch04-pdf-0102',
    'financial-analysis-ch05-pdf-0011',
    'financial-analysis-ch05-pdf-0035',
    'financial-analysis-ch05-pdf-0036',
    'financial-analysis-ch06-pdf-0004',
    'financial-analysis-ch06-pdf-0007',
    'financial-analysis-ch06-pdf-0015',
    'financial-analysis-ch06-pdf-0024',
    'financial-analysis-ch06-pdf-0044',
    'financial-analysis-ch07-pdf-0006',
    'financial-analysis-ch07-pdf-0054',
    'financial-analysis-ch07-pdf-0078',
    'financial-analysis-ch07-pdf-0082',
    'financial-analysis-ch07-pdf-0117',
    'financial-analysis-ch07-pdf-0146',
    'financial-analysis-ch08-pdf-0019',
    'financial-analysis-ch08-pdf-0047',
    'financial-analysis-ch10-pdf-0010',
    'financial-analysis-ch10-pdf-0025',
    'financial-analysis-ch10-pdf-0136',
    'securities-trading-regulations-ch01-pdf-0083',
    'securities-trading-regulations-ch03-pdf-0055',
    'securities-trading-regulations-ch04-pdf-0113',
    'securities-trading-regulations-ch05-pdf-0073',
    'securities-trading-regulations-ch05-pdf-0080',
    'securities-trading-regulations-ch06-pdf-0061',
    'securities-trading-practice-ch01-pdf-0005',
    'securities-trading-practice-ch03-pdf-0038',
    'securities-trading-practice-ch03-pdf-0039',
    'securities-trading-practice-ch05-pdf-0003',
    'securities-trading-practice-ch07-pdf-0012',
    'securities-trading-practice-ch07-pdf-0032',
    'securities-trading-practice-ch09-pdf-0009',
    'securities-trading-practice-ch09-pdf-0070',
    'securities-trading-practice-ch09-pdf-0091',
    'securities-trading-practice-ch09-pdf-0119',
    'securities-trading-practice-ch09-pdf-0135',
    'securities-trading-practice-ch10-pdf-0002',
    'securities-trading-practice-ch10-pdf-0007',
    'securities-trading-practice-ch10-pdf-0008',
    'securities-trading-practice-ch10-pdf-0111',
    'securities-trading-practice-ch11-pdf-0013',
    'securities-trading-practice-ch12-pdf-0011',
    'securities-trading-practice-ch12-pdf-0030',
}


# Additional formula transcriptions verified directly against the project scan
# crops. These replace OCR-only mathematical notation; no external source is
# consulted.
merge_overrides({
'investment-ch06-pdf-0046': {
 'explanation': '令wⱼ和wₖ分別為甲股票和乙股票之投資比重；則wⱼ＋wₖ＝1，wₖ＝1－wⱼ。σ（Rₚ）＝[wⱼ²σ²（Rⱼ）＋wₖ²σ²（Rₖ）＋2wⱼwₖρσ（Rⱼ）σ（Rₖ）]¹⁄²。當ρ＝－1時，σ（Rₚ）＝|wⱼσ（Rⱼ）－（1－wⱼ）σ（Rₖ）|＝0。故wⱼ＝σ（Rₖ）÷[σ（Rⱼ）＋σ（Rₖ）]＝45%÷（15%＋45%）＝75%；wₖ＝25%。',
},
'investment-ch07-pdf-0031': {
 'explanation': 'βⱼ＝Cov（R_m，Rⱼ）÷σ_m²＝0.108÷0.09＝1.2。E（Rⱼ）＝R_f＋[E（R_m）－R_f]×βⱼ＝1%＋（11%－1%）×1.2＝13%。',
},
'financial-analysis-ch10-pdf-0037': {
 'explanation': '根據資本資產定價模式（CAPM），一證券之期望報酬由下式決定：E（rᵢ）＝r_f＋β[E（r_m）－r_f]。其中E（rᵢ）為證券i之期望報酬率，r_f為無風險利率，E（r_m）為股票市場整體之期望報酬率；如果投資人嫌惡風險，E（r_m）將大於r_f。因此，只有當該公司股票的β（貝他係數）值低於零時，其預期報酬率才會低於無風險利率。',
},
'investment-ch03-pdf-0017': {
 'explanation': '股票理論價值P＝D₁÷（K－g）＝D₀（1＋g）÷（K－g）；又K＝R_f＋風險溢酬＝R_f＋β[E（R_m）－R_f]，R_f＝實質無風險利率＋預期通貨膨脹率。所以，影響股價之因素不含資產報酬率。',
},
'investment-ch03-pdf-0018': {
 'explanation': 'P＝D₁÷（K－g）＝D₀（1＋g）÷（K－g）＝EPS₀×d×（1＋g）÷（K－g）。其中d為股利發放率，g為股利成長率。又K＝R_f＋風險溢酬＝R_f＋β[E（R_m）－R_f]，其中R_f可假設為國庫券殖利率。因此，本益比與國庫券殖利率成反比。',
},
'investment-ch03-pdf-0019': {
 'explanation': 'P＝D₁÷（K－g），其中K為要求報酬率，g為股利成長率；當g＞K時股價會發散。',
},
'investment-ch03-pdf-0030': {
 'explanation': '根據P＝D₁÷（K－g），在其他條件相同下，股利成長率愈高，其股價愈高；反之則愈低。',
},
'investment-ch03-pdf-0034': {
 'explanation': '股票理論價值P＝D₁÷（K－g），其中g為股利之成長率；若要求報酬率K過低，則股價會高估。',
},
'investment-ch03-pdf-0036': {
 'explanation': '股票理論價值P＝D₁÷（K－g）＝D₀（1＋g）÷（K－g）。K＝R_f＋β（R_m－R_f），R_f＝實質無風險利率＋預期通貨膨脹率。所以，預期通貨膨脹率會影響R_f，進而影響K。',
},
'investment-ch07-pdf-0004': {
 'explanation': '投資人必要報酬率＝E（Rᵢ）＝R_f＋β[E（R_m）－E（R_f）]＝4%＋1.2×（14%－4%）＝16%。P＝D₁÷（K－g）＝D₀×（1＋g）÷（K－g），E（Rᵢ）即K，所以P＝4×（1＋8%）÷（16%－8%）＝54。',
},
'financial-analysis-ch06-pdf-0020': {
 'explanation': '總資產報酬率＝[本期淨利＋利息費用×（1－稅率）]÷平均資產總額。利息費用＝$1,000,000×6%＝$60,000，設稅後淨利＝X，則X＋$60,000×（1－35%）＝$4,000,000×12%，解得X＝$441,000。權益報酬率＝$441,000÷（$4,000,000－$1,000,000）＝14.7%。',
},
'financial-analysis-ch05-pdf-0031': {
 'explanation': '總資產＝流動資產＋不動產、廠房及設備＝5,000億元＋7,000億元＝12,000億元。自有資金比率＝權益÷總資產＝權益÷12,000億元＝60%，故權益＝7,200億元。權益＝總資產－流動負債－長期負債，7,200億元＝12,000億元－3,000億元－長期負債，故長期負債＝1,800億元。',
},
})


# Page-seam and isolated-number artifacts found by a full-dataset scan.
# The corrected sentences below were read directly from the corresponding
# project scan crops.
merge_overrides({
'investment-ch01-pdf-0112': {
 'explanation':'投資組合型基金的優點包括：減少挑選基金的複雜性、分散單一基金操作績效不佳的風險，以及在資產配置上較不受限制。',
},
'financial-analysis-ch01-pdf-0023': {
 'explanation':'選項（1）錯誤，確保財報內容正確應是管理當局對報表使用者的責任。選項（3）錯誤，會計師是以專業角度來審核企業的財務報表是否符合一般公認會計原則且真實表達企業之財務狀況，分析並非會計師之責任。',
},
'financial-analysis-ch10-pdf-0004': {
 'explanation':'選項（1）正確，在制定決策時應考慮機會成本。選項（2）正確，沉沒成本不影響投資及投資後現金流量，故不考慮。選項（3）錯誤，有時基於經營策略的考量，成本效益不符合經濟原則的投資計畫仍值得投資。選項（4）正確，報稅時折舊方法不同，會影響現金流量，繼而影響投資決策。',
},
'financial-analysis-ch10-pdf-0139': {
 'options':{'1':'由直線法改為加速折舊法'},
},
'securities-trading-regulations-ch01-pdf-0005': {
 'explanation':'依「證券交易法」§6規定，本法所稱有價證券，指政府債券、公司股票、公司債券及經主管機關核定之其他有價證券。新股認購權利證書、新股權利證書及前項各種有價證券之價款繳納憑證或表明其權利之證書，視為有價證券。',
},
'securities-trading-regulations-ch01-pdf-0043': {
 'explanation':'依「公司法」§172第2項，臨時股東會之召集，應於十日前通知各股東。',
},
'securities-trading-regulations-ch01-pdf-0092': {
 'explanation':'依「公司法」§240規定，公司得由有代表已發行股份總數三分之二以上股東出席之股東會，以出席股東表決權過半數之決議，將應分派股息及紅利之全部或一部，以發行新股方式為之；不滿一股之金額，以現金分派之。公開發行股票之公司出席股東之股份總數不足前項定額者，得以有代表已發行股份總數過半數股東出席，出席股東表決權三分之二以上之同意行之。',
},
'securities-trading-regulations-ch01-pdf-0136': {
 'explanation':'依「公司法」§211第1項規定，公司虧損達實收資本額二分之一時，董事會應於最近一次股東會報告。',
},
'securities-trading-regulations-ch02-pdf-0081': {
 'explanation':'依「證券交易法」§43-6第1項規定，公開發行股票之公司，得以有代表已發行股份總數過半數股東之出席，出席股東表決權三分之二以上之同意，對左列之人進行有價證券之私募，不受第二十八條之一、第一百三十九條第二項及公司法第二百六十七條第一項至第三項規定之限制：一、銀行業、票券業、信託業、保險業、證券業或其他經主管機關核准之法人或機構。二、符合主管機關所定條件之自然人、法人或基金。三、該公司或其關係企業之董事、監察人及經理人。',
},
'securities-trading-regulations-ch02-pdf-0082': {
 'explanation':'依「證券交易法」§43-6第1項規定，公開發行股票之公司，得以有代表已發行股份總數過半數股東之出席，出席股東表決權三分之二以上之同意，對左列之人進行有價證券之私募，不受第二十八條之一、第一百三十九條第二項及公司法第二百六十七條第一項至第三項規定之限制：一、銀行業、票券業、信託業、保險業、證券業或其他經主管機關核准之法人或機構。二、符合主管機關所定條件之自然人、法人或基金。三、該公司或其關係企業之董事、監察人及經理人。',
},
'securities-trading-practice-ch03-pdf-0042': {
 'explanation':'依「證券暨期貨市場各服務事業建立內部控制制度處理準則」§8，各服務事業之內部控制制度，除視事業之性質訂定各種營運循環類型之控制作業外，尚應視其需要包括對下列作業之控制（共19項）：11.對子公司之監督與管理、15.客戶資料保密、18.作業委託他人處理之管理。故選項（1）（2）（3）皆須包含。',
},
})



# Additional project-scan transcriptions from the final structural and
# punctuation audit. These repair OCR bleed, page numbers, and continuation
# lines that belong to the learner-facing question text.
merge_overrides({
'securities-trading-regulations-ch05-pdf-0067': {
 'options': {'3':'三分之一'},
},
'financial-analysis-ch04-pdf-0087': {
 'explanation':'總成本＝土地成本＋建設成本＝$800,000＋$1,200,000＝$2,000,000。利潤＝預計可出售價值－總成本＝$2,500,000－$2,000,000＝$500,000。',
},
'investment-ch01-pdf-0095': {
 'explanation':'選項（1）投資：期望在承擔適當的風險下，未來能夠賺取長期、穩定的報酬之行為。選項（2）賭博：係在公平的前提下（Fair Game），其行為結果完全取決於運氣的大小，風險最高。選項（3）投機：著重於追求短期的暴利，且能承擔較高的風險。選項（4）避險：利用衍生性商品來規避現貨市場風險之操作。',
},
'financial-analysis-ch06-pdf-0014': {
 'explanation':'選項（1）正確，兩公司今年本益比相同，可能只是因暫時性盈餘使其今年相同，不意謂公司有相同的成長率。選項（2）錯誤，產業成長性低或風險較高的公司，則其本益比會較低。選項（3）正確，公司面臨風險的改變會影響本益比變動。選項（4）正確，會計方法變動會影響本益比。',
},
'financial-analysis-ch05-pdf-0009': {
 'options': {'4':'財務槓桿指數小於1時，表示財務槓桿運用成功'},
 'explanation':'選項（1）錯誤，舉債經營不見得使公司普通股每股盈餘提高，若舉債資金成本大於資產報酬率則每股盈餘下降。選項（2）錯誤，折舊攤銷使得當年度盈餘下降，盈餘及利息倍數下降。選項（3）正確，所得稅率提高有利於舉債經營，因舉債節稅額度增加。選項（4）錯誤，財務槓桿指數小於1時對股東不利，表示使用財務槓桿導致反效果。',
},
'financial-analysis-ch01-pdf-0005': {
 'explanation':'比較分析＝（比較年度－基期年度）÷基期年度。選項（1）正確，分母為零，無法計算。選項（2）正確，計算結果無法反映出真實狀況。選項（3）正確，計算結果無法反映出真實狀況。選項（4）錯誤，兩期金額相當接近不構成比較分析的限制。',
},
'financial-analysis-ch10-pdf-0005': {
 'explanation':'營運資金＝流動資產－流動負債。選項（1）正確，存貨需求增加，則須增加營運資金。選項（2）錯誤，現金與應收帳款皆屬於流動資產，兩者間的轉換不影響流動資產總值，故營運資金不會有所變動。選項（3）正確，營運資金流動性高，其目的為維持日常營運。選項（4）正確，土地為不動產、廠房及設備，以現金出售土地，則不動產、廠房及設備減少，流動資產增加。',
},
'financial-analysis-ch10-pdf-0103': {
 'explanation':'淨營運資金（Net Working Capital）＝流動資產－流動負債。選項（1）錯誤，購買不動產、廠房及設備，現金減少，流動資產減少，淨營運資金減少。選項（2）錯誤，減少賒銷改為現銷，現金增加但應收帳款減少，流動資產不變，淨營運資金不變。選項（3）錯誤，生產線縮減，淨營運資金需求減少。選項（4）正確，流動負債減少，淨營運資金增加。',
},
'investment-ch02-pdf-0010': {
 'options': {'4':'17,260元'},
},
'investment-ch02-pdf-0011': {
 'options': {'4':'5.9%'},
},
'investment-ch02-pdf-0143': {
 'options': {'4':'8.08%'},
},
'investment-ch03-pdf-0011': {
 'options': {'4':'48.8元'},
},
'financial-analysis-ch07-pdf-0054': {
 'options': {'4':'3.5'},
 'explanation':'營運槓桿度＝（$2,000,000－$600,000）÷$400,000＝3.5。',
},
'financial-analysis-ch10-pdf-0069': {
 'question':'通常我們在估計未來預期報酬率時，可以計算過去一段時間報酬率的：',
},
'securities-trading-practice-ch09-pdf-0126': {
 'question':'經證交所列為變更交易方法之處置證券，採人工管制之撮合終端機執行撮合作業，該撮合作業約幾分鐘撮合一次？',
},
'securities-trading-practice-ch03-pdf-0020': {
 'question':'下列何種情事非屬重大影響上市公司股票價格之消息？',
},
'securities-trading-practice-ch10-pdf-0006': {
 'question':'下列何項「非」興櫃股票市場的主要功能？',
},
})


# Additional direct transcriptions from project scan crops reviewed during the
# final learner-text audit. These corrections remove page-number bleed and
# reconstruct equations whose layout was flattened by OCR.
merge_overrides({
'investment-ch01-pdf-0061': {
 'explanation':'將自有資金轉換成10萬澳幣（$60,000÷每澳幣$0.6）。將借入資金轉換成100萬澳幣（€500,000×1.2＝USD600,000；USD600,000÷0.6＝澳幣100萬），總計投資澳幣1,100,000。若匯率在下一個月沒有改變，小何獲得澳幣6,000的利潤：賺取利息澳幣11,000＝1%×澳幣1,100,000；利息支出€500,000×0.5%×1.2÷0.6＝澳幣5,000；利潤為澳幣6,000（A$11,000－A$5,000）。報酬率＝澳幣6,000÷澳幣100,000＝6%。',
},
'investment-ch02-pdf-0013': {
 'options': {'4':'小何不須支付給券商，而是券商須支付給小何'},
},
'investment-ch02-pdf-0030': {
 'explanation':'在不考慮其他成本以及轉換限制下，當可轉債之轉換價值高於其市場價格時，即存在套利機會。轉換比率＝可轉換公司債面額÷轉換價格＝100,000÷40＝2,500。假設標的股票價格為A，則轉換價值＝2,500×A＝120,000，解得A＝48。因此在不考慮其他因素時，當標的股票價格高於48元，該可轉債存在套利空間。',
},
'investment-ch04-pdf-0025': {
 'options': {'1':'為0至100'},
 'explanation':'MACD是將DIF線當K線，再取其9日的平均值而得，故DIF為快速線，而MACD為慢速線；且根據葛蘭碧八大法則，DIF線由下往上突破MACD為買進訊號，而MACD和DIF線並沒有0至100的問題。',
},
'investment-ch04-pdf-0117': {
 'options': {'4':'漲跌家數'},
},
'investment-ch05-pdf-0117': {
 'options': {'4':'12.8元'},
 'explanation':'股利殖利率＝股利÷股價，所以4%＝股利÷80元，股利＝3.2元。股利＝每股盈餘×股利支付率，所以3.2元＝每股盈餘×25%，解得每股盈餘＝12.8元。',
},
'investment-ch06-pdf-0004': {
 'options': {'3':'兩股票報酬率相關係數＝－1'},
},
'investment-ch06-pdf-0006': {
 'question':'假設兩股票報酬率之相關係數為－1，甲股票預期報酬率為0.10、報酬率標準差為0.20，乙股票預期報酬率為0.06、報酬率標準差為0.10，若想利用甲、乙兩股票組成一無風險投資組合時，則其比重分配應為何？',
},
'investment-ch06-pdf-0033': {
 'options': {'4':'風險分散優於相關係數為－1之投資組合'},
 'explanation':'當個別資產相關係數介於＋1與－1之間時，投資組合標準差小於個別資產標準差之加權平均，具有風險分散的效果。',
},
'investment-ch06-pdf-0046': {
 'question':'甲、乙兩股票的預期報酬率為10%、20%，報酬率標準差分別為15%、45%，且兩股票的相關係數為－1，若投資人欲將投資組合的報酬率標準差降為零，兩股票的投資比重應為何？',
},
'investment-ch06-pdf-0078': {
 'options': {'4':'可能為－1與1之間之任何數'},
},
'investment-ch06-pdf-0082': {
 'explanation':'兩股票報酬率的相關係數介於＋1與－1之間；隨著相關係數愈小，風險分散效果愈好，所以當相關係數為－1且不能賣空時，分散風險的效果最好。',
},
'investment-ch07-pdf-0045': {
 'options': {'4':'市場平均報酬率加上市場平均之風險溢酬'},
},
'investment-ch07-pdf-0102': {
 'explanation':'在市場投資組合右上方之投資組合，是由借入資金與買入市場投資組合所形成，故其投資於市場投資組合的權重大於1，無風險資產權重小於0，答案為1.2及－0.2。',
},
'investment-ch08-pdf-0009': {
 'explanation':'夏普指標＝（投資組合報酬率－無風險利率）÷投資組合報酬率標準差＝（10%－2%）÷20%＝40%。',
},
'financial-analysis-ch05-pdf-0047': {
 'explanation':'總資產＝流動資產＋不動產、廠房及設備＝50億元＋50億元＝100億元。權益＝總資產－流動負債－長期負債＝100億元－20億元－30億元＝50億元。長期資金占不動產、廠房及設備比率＝（權益總額＋長期負債總額）÷不動產、廠房及設備淨額×100%＝（50億元＋30億元）÷50億元＝1.6。',
},
'financial-analysis-ch06-pdf-0005': {
 'explanation':'股價淨值比＝普通股每股市價÷每股帳面金額＝本益比×（每股盈餘÷每股帳面金額）。普通股權益報酬率＝（本期淨利－特別股股利）÷平均普通股權益＝（$60,000－$10,000）÷$250,000＝20%。股價淨值比＝30×20%＝6。',
},
'financial-analysis-ch07-pdf-0056': {
 'explanation':'國外子公司報表若採外國貨幣記帳，轉換為母公司貨幣時產生差異，稱為「累積換算調整數」。',
},
'financial-analysis-ch08-pdf-0004': {
 'explanation':'權益＝$3,000,000＋$600,000＋$600,000＋$300,000＝$4,500,000。每股帳面金額＝$4,500,000÷300,000＝$15。',
},
'financial-analysis-ch10-pdf-0057': {
 'explanation':'永續年金現值＝年金金額÷資金成本率＝$60÷5%＝$1,200。',
},
'financial-analysis-ch10-pdf-0128': {
 'explanation':'固定利息支出＝$1,000,000×5%＝$50,000。浮動利息收入＝$1,000,000×（3%＋2%）＝$50,000。淨支付額＝固定利息支出－浮動利息收入＝$0。',
},
})


merge_overrides({
'investment-ch03-pdf-0011': {
 'explanation':'P＝4÷10%＝40。',
},
'investment-ch06-pdf-0006': {
 'explanation':'兩股票報酬率之相關係數為－1，則投資組合標準差σₚ＝|W₁×σ₁－W₂×σ₂|。令W甲×0.20－W乙×0.10＝0，且W甲＋W乙＝1，解得W甲＝1/3、W乙＝2/3。',
},
'investment-ch07-pdf-0045': {
 'explanation':'根據CAPM，其預期報酬率E（Rᵢ）＝R_f＋βᵢ[E（R_m）－R_f]，即由無風險利率R_f加上資產的風險溢酬βᵢ[E（R_m）－R_f]。',
},
})


# Additional formula and option transcriptions visually checked against the project scan crops.
OVERRIDES.update({
'investment-ch02-pdf-0046': {
 'explanation':'殖利率維持不變，則半年間的報酬率為4%＝8%／2。4%＝[5,000＋（P－108,111）]／108,111，解得P＝$107,435。',
},
'investment-ch02-pdf-0144': {
 'explanation':'全體債息保障係數＝息前稅前盈餘／利息費用＝6,000,000／（15,000,000×6%＋5,000,000×8%）＝4.615。',
},
'investment-ch05-pdf-0004': {
 'explanation':'杜邦方程式主要係將股東權益報酬率分解為淨利率、資產週轉率、自有資金比率倒數的乘積，因此股東權益報酬率過低，可能是因為淨利率過低、資產週轉率太低，或甚至自有資金比率太高等因素所造成的。股東權益報酬率＝（淨利－特別股股利）／銷貨收入×銷貨收入／平均總資產×平均總資產／平均股東權益。',
},
'financial-analysis-ch10-pdf-0057': {
 'options': {'4':'$1,000'},
 'explanation':'永續年金現值＝年金金額／資金成本率＝$60÷5%＝$1,200。',
},
'financial-analysis-ch08-pdf-0044': {
 'options': {
   '3':'普通股享有之淨利／加權平均流通在外普通股股數',
   '4':'普通股享有之淨利／普通股期末流通在外股數',
 },
 'explanation':'每股盈餘＝（淨利－特別股股利）÷加權平均流通在外普通股股數。',
},
'securities-trading-regulations-ch01-pdf-0084': {
 'explanation':'依「公司法」§228第1項規定，每會計年度終了，董事會應編造下列表冊，於股東常會開會三十日前交監察人查核：一、營業報告書；二、財務報表；三、盈餘分派或虧損撥補之議案。',
},
})

merge_overrides({
'financial-analysis-ch06-pdf-0010': {
 'explanation':'權益報酬率＝本期淨利÷平均權益＝[$2,800,000×12%－$140,000×（1－20%）]÷（$2,800,000－$1,600,000）＝0.18666。',
},
})


merge_overrides({
'securities-trading-regulations-ch07-pdf-0037': {
 'options': {'4':'甲、乙、丙、丁'},
 'explanation':'依「中華民國證券商業同業公會證券商防制洗錢及打擊資恐注意事項範本」第貳點第二項，確認客戶身分時機：1.與客戶建立業務關係時。2.辦理新臺幣五十萬元（含等值外幣）以上之現金交易（如以現金給付之交割價款、單筆申購並以臨櫃交付現金方式交易等）時。3.發現疑似洗錢或資恐交易時。4.對於過去所取得客戶身分資料之真實性或妥適性有所懷疑時。',
},
'securities-trading-practice-ch04-pdf-0022': {
 'explanation':'依「承銷或再行銷售有價證券處理辦法」§31第1項規定，募集普通公司債、未涉及股權之金融債券、分離型附認股權公司債其分離後之公司債、不動產資產信託受益證券、受託機構公開招募受益證券或特殊目的公司公開招募資產基礎證券之承銷案件，得全數或部分採洽商銷售方式辦理，並依§30規定訂定承銷價格。',
},
'financial-analysis-ch09-pdf-0007': {
 'explanation':'乙、丁為經常性之活動。',
},
})


# Chapter-coverage and residual artifact checks transcribed directly from scan crops.
OVERRIDES.update({
'financial-analysis-ch09-pdf-0007': {
 'explanation':'乙、丁為經常性之活動。',
},
'financial-analysis-ch09-pdf-0036': {
 'explanation':'IAS 1規定不論在損益表或附註中，均不得將任何收益費損表達為非常項目。',
},
'investment-ch03-pdf-0022': {
 'explanation':'P＝D₁／（K－g）＝D₀（1＋g）／（K－g）＝EPS×d×（1＋g）／（K－g），P／EPS＝d×（1＋g）／（K－g），其中g為預估之股利成長率。因此，本益比與g成正比。',
},
'investment-ch09-pdf-0034': {
 'explanation':'買進賣權的損益圖形顯示，在標的物下跌時，買進賣權可獲得的最大利潤為K－P（履約價減權利金）。',
},
'financial-analysis-ch04-pdf-0007': {
 'explanation':'X1年底權益＝$4,000,000×（1－0.375）＝$2,500,000。X1年初權益＝X1年底權益－本期淨利＋現金股利＝$2,500,000－$750,000＋$250,000＝$2,000,000。',
},
'financial-analysis-ch04-pdf-0112': {
 'options': {'4':'甲、乙、丙、丁'},
},
'financial-analysis-ch06-pdf-0034': {
 'explanation':'本益比＝市價（P）÷每股盈餘（E）；股利收益率＝股利（D）÷市價（P）；股利支付比率＝股利（D）÷每股盈餘（E）。本題中，P÷E＝50，故E＝P÷50＝0.02P；D÷P＝2%＝0.02，故D＝0.02P；因此D÷E＝0.02P÷0.02P＝100%。',
},
'securities-trading-practice-ch04-pdf-0022': {
 'explanation':'依「承銷或再行銷售有價證券處理辦法」§31第1項規定，募集普通公司債、未涉及股權之金融債券、分離型附認股權公司債其分離後之公司債、不動產資產信託受益證券、受託機構公開招募受益證券或特殊目的公司公開招募資產基礎證券之承銷案件，得全數或部分採洽商銷售方式辦理，並依§30規定訂定承銷價格。',
},
'securities-trading-practice-ch10-pdf-0004': {
 'explanation':'依「櫃買中心證券商營業處所買賣有價證券審查準則」§3第1項第1款：實收資本額在新臺幣5,000萬元以上者，且募集發行普通股股數達500萬股以上。第2款：依公司法設立登記滿二個完整會計年度，且財務要求須符合「獲利能力」或「淨值、營業收入及營業活動現金流量」條件之一，其中獲利能力需達成下列之一：（一）最近一個會計年度達4%以上，且決算無累積虧損；（二）近二個會計年度均達3%以上；（三）近二個會計年度平均3%以上，且最近一個會計年度之獲利能力較前年度佳。第3款：公司內部人及該等內部人持股逾50%之法人以外之記名股東人數不少於300人，且其所持股份總額合計占發行股份總額20%以上或逾1,000萬股。',
},
'securities-trading-practice-ch10-pdf-0005': {
 'explanation':'依「櫃買中心證券商營業處所買賣有價證券審查準則」§3第1項第1款：實收資本額在新臺幣5,000萬元以上者，且募集發行普通股股數達500萬股以上。第2款：依公司法設立登記滿二個完整會計年度，且財務要求須符合「獲利能力」或「淨值、營業收入及營業活動現金流量」條件之一，其中獲利能力需達成下列之一：（一）最近一個會計年度達4%以上，且決算無累積虧損；（二）近二個會計年度均達3%以上；（三）近二個會計年度平均3%以上，且最近一個會計年度之獲利能力較前年度佳。第3款：公司內部人及該等內部人持股逾50%之法人以外之記名股東人數不少於300人，且其所持股份總額合計占發行股份總額20%以上或逾1,000萬股。',
},
'securities-trading-regulations-ch07-pdf-0002': {
 'options': {'4':'僅乙、丙、丁'},
},
'securities-trading-regulations-ch07-pdf-0037': {
 'options': {'4':'甲、乙、丙、丁'},
},
})


merge_overrides({
'financial-analysis-ch04-pdf-0102': {
 'question':'下列何者屬無形資產？',
},
'financial-analysis-ch10-pdf-0136': {
 'question':'投資計畫評估現金流量應採何基礎？',
},
'investment-ch06-pdf-0034': {
 'explanation':'Cov（R甲，R乙）＝ρ甲乙×σ甲×σ乙；σ乙＝0.005÷（0.5×0.25）＝0.04。',
},
})

SECOND_SPOT_VISUAL_REVIEW_IDS = {
    'investment-ch01-pdf-0112',
    'financial-analysis-ch01-pdf-0023',
    'financial-analysis-ch10-pdf-0004',
    'financial-analysis-ch10-pdf-0139',
    'securities-trading-regulations-ch01-pdf-0005',
    'securities-trading-regulations-ch01-pdf-0043',
    'securities-trading-regulations-ch01-pdf-0092',
    'securities-trading-regulations-ch01-pdf-0136',
    'securities-trading-regulations-ch02-pdf-0081',
    'securities-trading-regulations-ch02-pdf-0082',
    'securities-trading-practice-ch03-pdf-0042',
    'securities-trading-regulations-ch05-pdf-0067',
    'financial-analysis-ch04-pdf-0087',
    'investment-ch01-pdf-0095',
    'financial-analysis-ch06-pdf-0014',
    'financial-analysis-ch05-pdf-0009',
    'financial-analysis-ch01-pdf-0005',
    'financial-analysis-ch10-pdf-0005',
    'financial-analysis-ch10-pdf-0103',
    'investment-ch02-pdf-0010',
    'investment-ch02-pdf-0011',
    'investment-ch02-pdf-0143',
    'investment-ch03-pdf-0011',
    'financial-analysis-ch10-pdf-0069',
    'securities-trading-practice-ch09-pdf-0126',
    'securities-trading-practice-ch03-pdf-0020',
    'securities-trading-practice-ch10-pdf-0006',
    'investment-ch02-pdf-0046',
    'investment-ch02-pdf-0144',
    'financial-analysis-ch10-pdf-0057',
    'financial-analysis-ch08-pdf-0044',
    'securities-trading-regulations-ch01-pdf-0084',
    'financial-analysis-ch09-pdf-0007',
    'financial-analysis-ch11-pdf-0005',
    'securities-trading-practice-ch02-pdf-0012',
    'securities-trading-practice-ch04-pdf-0022',
    'securities-trading-practice-ch06-pdf-0037',
    'securities-trading-practice-ch08-pdf-0011',
    'securities-trading-practice-ch13-pdf-0009',
    'securities-trading-regulations-ch07-pdf-0037',
    'financial-analysis-ch09-pdf-0036',
    'investment-ch03-pdf-0022',
    'investment-ch09-pdf-0034',
    'financial-analysis-ch04-pdf-0007',
    'financial-analysis-ch04-pdf-0112',
    'financial-analysis-ch06-pdf-0034',
    'securities-trading-practice-ch10-pdf-0004',
    'securities-trading-practice-ch10-pdf-0005',
    'securities-trading-regulations-ch07-pdf-0002',
}

SECOND_SPOT_VISUAL_REVIEW_IDS.update({
    'investment-ch06-pdf-0034',
    'investment-ch04-pdf-0064',
    'financial-analysis-ch09-pdf-0007',
    'financial-analysis-ch11-pdf-0005',
    'securities-trading-practice-ch02-pdf-0012',
    'securities-trading-practice-ch04-pdf-0022',
    'securities-trading-practice-ch06-pdf-0037',
    'securities-trading-practice-ch08-pdf-0011',
    'securities-trading-practice-ch13-pdf-0009',
    'securities-trading-regulations-ch07-pdf-0037',
    'financial-analysis-ch06-pdf-0010',
    'investment-ch01-pdf-0061',
    'investment-ch02-pdf-0013',
    'investment-ch02-pdf-0030',
    'investment-ch04-pdf-0025',
    'investment-ch04-pdf-0117',
    'investment-ch05-pdf-0117',
    'investment-ch06-pdf-0004',
    'investment-ch06-pdf-0006',
    'investment-ch06-pdf-0033',
    'investment-ch06-pdf-0046',
    'investment-ch06-pdf-0078',
    'investment-ch06-pdf-0082',
    'investment-ch07-pdf-0045',
    'investment-ch07-pdf-0102',
    'investment-ch08-pdf-0009',
    'financial-analysis-ch05-pdf-0047',
    'financial-analysis-ch06-pdf-0005',
    'financial-analysis-ch07-pdf-0056',
    'financial-analysis-ch08-pdf-0004',
    'financial-analysis-ch10-pdf-0057',
    'financial-analysis-ch10-pdf-0128',
})

SECOND_SPOT_VISUAL_REVIEW_IDS.update({
    'investment-ch04-pdf-0151',
    'financial-analysis-ch04-pdf-0074',
    'investment-ch06-pdf-0018',
    'investment-ch06-pdf-0056',
    'investment-ch06-pdf-0065',
    'investment-ch06-pdf-0070',
    'financial-analysis-ch02-pdf-0010',
    'securities-trading-regulations-ch06-pdf-0089',
    'financial-analysis-ch02-pdf-0053',
    'financial-analysis-ch04-pdf-0043',
    'securities-trading-regulations-ch05-pdf-0034',
    'financial-analysis-ch02-pdf-0076',
    'investment-ch05-pdf-0038',
})

MID_SCAN_PAGE_NUMBERS={
'investment-ch02-pdf-0087':'106','investment-ch07-pdf-0004':'296','investment-ch08-pdf-0056':'244',
'financial-analysis-ch05-pdf-0014':'212','financial-analysis-ch07-pdf-0048':'278','financial-analysis-ch07-pdf-0133':'294','financial-analysis-ch10-pdf-0044':'392','financial-analysis-ch10-pdf-0111':'404','financial-analysis-ch10-pdf-0122':'406',
'securities-trading-regulations-ch02-pdf-0026':'100','securities-trading-regulations-ch02-pdf-0049':'106','securities-trading-regulations-ch03-pdf-0068':'164','securities-trading-regulations-ch06-pdf-0043':'310','securities-trading-regulations-ch06-pdf-0071':'376','securities-trading-regulations-ch06-pdf-0087':'330',
'securities-trading-practice-ch01-pdf-0014':'382','securities-trading-practice-ch01-pdf-0015':'382','securities-trading-practice-ch01-pdf-0025':'204','securities-trading-practice-ch01-pdf-0026':'204','securities-trading-practice-ch03-pdf-0003':'430','securities-trading-practice-ch03-pdf-0035':'438','securities-trading-practice-ch04-pdf-0012':'458','securities-trading-practice-ch06-pdf-0018':'498','securities-trading-practice-ch06-pdf-0019':'498','securities-trading-practice-ch06-pdf-0055':'506','securities-trading-practice-ch09-pdf-0008':'564','securities-trading-practice-ch09-pdf-0036':'572','securities-trading-practice-ch09-pdf-0082':'584','securities-trading-practice-ch09-pdf-0092':'586','securities-trading-practice-ch09-pdf-0103':'588','securities-trading-practice-ch10-pdf-0025':'622','securities-trading-practice-ch10-pdf-0032':'624','securities-trading-practice-ch10-pdf-0040':'626','securities-trading-practice-ch10-pdf-0099':'640','securities-trading-practice-ch10-pdf-0109':'642','securities-trading-practice-ch11-pdf-0011':'654','securities-trading-practice-ch11-pdf-0052':'664','securities-trading-practice-ch13-pdf-0016':'700',
}

def remove_mid_scan_page_number(s:str, token:str)->str:
    # Page numbers sit on their own visual line at a cross-page crop boundary.
    # The mapping is explicit per scan, so numeric values elsewhere remain intact.
    pattern=rf'(?<![0-9A-Za-z§])\s*{re.escape(token)}\s+(?=[^0-9])'
    return re.sub(pattern,' ',s,count=1).strip()

TRAILING_SCAN_PAGE_NUMBERS={
'investment-ch01-pdf-0059':'36','investment-ch01-pdf-0076':'40','investment-ch04-pdf-0008':'172','investment-ch06-pdf-0004':'256','investment-ch09-pdf-0056':'390','investment-ch09-pdf-0074':'304',
'financial-analysis-ch01-pdf-0041':'38','financial-analysis-ch02-pdf-0004':'76','financial-analysis-ch02-pdf-0049':'86','financial-analysis-ch04-pdf-0002':'1','financial-analysis-ch07-pdf-0143':'296','financial-analysis-ch07-pdf-0149':'298','financial-analysis-ch08-pdf-0019':'112','financial-analysis-ch10-pdf-0025':'200','financial-analysis-ch10-pdf-0065':'296','financial-analysis-ch10-pdf-0133':'408',
'securities-trading-regulations-ch01-pdf-0022':'28','securities-trading-regulations-ch02-pdf-0169':'140','securities-trading-regulations-ch03-pdf-0056':'1','securities-trading-regulations-ch03-pdf-0075':'166','securities-trading-regulations-ch04-pdf-0076':'212','securities-trading-regulations-ch05-pdf-0014':'250','securities-trading-regulations-ch05-pdf-0029':'254','securities-trading-regulations-ch05-pdf-0092':'270','securities-trading-regulations-ch07-pdf-0011':'356','securities-trading-regulations-ch07-pdf-0012':'356','securities-trading-regulations-ch07-pdf-0013':'356','securities-trading-regulations-ch07-pdf-0040':'364',
'securities-trading-practice-ch02-pdf-0003':'1','securities-trading-practice-ch02-pdf-0045':'416','securities-trading-practice-ch04-pdf-0002':'456','securities-trading-practice-ch06-pdf-0061':'500','securities-trading-practice-ch07-pdf-0046':'1','securities-trading-practice-ch07-pdf-0047':'528','securities-trading-practice-ch09-pdf-0056':'578','securities-trading-practice-ch09-pdf-0113':'590','securities-trading-practice-ch09-pdf-0124':'592','securities-trading-practice-ch09-pdf-0133':'594','securities-trading-practice-ch10-pdf-0064':'632','securities-trading-practice-ch10-pdf-0080':'636','securities-trading-practice-ch10-pdf-0116':'644','securities-trading-practice-ch11-pdf-0003':'652','securities-trading-practice-ch11-pdf-0043':'662','securities-trading-practice-ch11-pdf-0060':'666','securities-trading-practice-ch12-pdf-0029':'686',
}


# Residual cross-column and formula transcriptions verified directly against the
# project scan crops. These repairs move text that the original crop split at a
# page/column boundary back into the correct option and remove OCR-only debris.
merge_overrides({
'investment-ch04-pdf-0072': {
 'options': {'3':'K值在－20以下'},
},
'securities-trading-practice-ch07-pdf-0015': {
 'explanation':'依「公開發行公司出席股東會使用委託書規則」§12規定，徵求人應編制徵得之委託書明細表一份，於開會五日前，送達公司股務代理機構。',
},
'financial-analysis-ch10-pdf-0061': {
 'options': {'4':'50%'},
 'explanation':'目前股價＝股利零成長價值＋成長機會現值＝每股盈餘／期望報酬率＋成長機會現值。成長機會現值＝$100－$4／8%＝$50，故成長機會現值對股價比率為$50÷$100＝50%。',
},
'financial-analysis-ch07-pdf-0033': {
 'options': {'4':'若以市價購回，購買價格與面額的差價應認列其他收入'},
 'explanation':'採成本法時，以購入之成本入帳。',
},
'investment-ch05-pdf-0135': {
 'options': {'4':'與經濟成長率無法比較'},
 'explanation':'新臺幣對美元貶值，則同等金額的新臺幣可兌換較少的美元。故貶值後，以美元表示的GDP成長率小於以新臺幣表示的GDP成長率（即經濟成長率）。',
},
'financial-analysis-ch05-pdf-0025': {
 'options': {'4':'不動產、廠房及設備對長期資金比率小於1，表示長期資金足夠支應不動產、廠房及設備投資之所需'},
 'explanation':'選項（1）比率愈高，自有資金愈低，保障愈低。選項（2）僅衡量償付利息之能力。選項（3）（負債÷資產）＋（權益÷資產）＝（負債＋權益）÷資產＝1。',
},
'securities-trading-regulations-ch05-pdf-0011': {
 'options': {'4':'公司買回股份，未於二個月內執行完畢者，得申報延長一個月為之'},
 'explanation':'依「上市上櫃公司買回本公司股份辦法」§4規定，公司依證券交易法第四十三條之一第二項規定之方式買回股份者，應依公開收購公開發行公司有價證券管理辦法向金融監督管理委員會申報並公告。',
},
'securities-trading-regulations-ch06-pdf-0040': {
 'options': {'4':'每一基金投資於任一公司所發行無擔保公司債之總額，不得超過該公司所發行無擔保公司債總額之百分之五'},
 'explanation':'依「證券投資信託基金管理辦法」§10第1項第10款規定，每一基金投資於任一上市或上櫃公司承銷股票之總數，不得超過該次承銷總數之百分之三；所經理之全部基金投資同一次承銷股票之總數，不得超過該次承銷總數之百分之十。',
},
'securities-trading-regulations-ch05-pdf-0051': {
 'options': {'4':'以面額百分之八十'},
 'explanation':'依114年6月17日金管證投字第1140135606號令規定，依「證券金融事業管理規則」§5第一項第七款規定核准證券金融事業得辦理以有價證券等為擔保之放款業務，以有擔保之轉（交）換公司債為擔保品者，以面額百分之六十為上限。',
},
'securities-trading-regulations-ch01-pdf-0058': {
 'options': {'4':'得指定二人以上，且無人數上限規定'},
 'explanation':'依「公司法」§181規定，政府或法人為股東時，其代表人不限於一人。但其表決權之行使，仍以其所持有之股份綜合計算。前項之代表人有二人以上時，其代表人行使表決權應共同為之。',
},
'securities-trading-regulations-ch01-pdf-0131': {
 'options': {'4':'甲公司對於持有記名股票未滿一千股股東，其股東常會之召集通知，得以公告方式為之'},
 'explanation':'依「證券交易法」§26-1規定，已依本法發行有價證券之公司召集股東會時，關於公司法第二百零九條第一項、第二百四十條第一項及第二百四十一條第一項之決議事項，應在召集事由中列舉並說明其主要內容，不得以臨時動議提出。同法§26-2規定，已依本法發行股票之公司，對於持有記名股票未滿一千股股東，其股東常會之召集通知得於開會三十日前；股東臨時會之召集通知得於開會十五日前，以公告方式為之。',
},
'securities-trading-practice-ch09-pdf-0092': {
 'explanation':'依「證交所上市股票零股交易辦法」§3規定，零股交易買賣申報時間為9:00～13:30及盤後13:40～14:30。證交所於申報截止前5分鐘之時段內，即時揭示經試算成交價格後之未成交最高買進及最低賣出申報價格。§4規定，委託人應開立集中保管劃撥帳戶，證券經紀商始得接受其委託買賣。§8規定，零股交易於申報截止後，即以集合競價撮合成交。',
},
'securities-trading-practice-ch11-pdf-0052': {
 'explanation':'依「臺灣證券交易所股份有限公司辦理上市證券標購辦法」§2第2項第4款規定，標購底價以標購當日開盤競價基準上下15%幅度範圍內為限。',
},
})


# Final formula, cross-page and page-number repairs verified directly against
# the rendered project scan crops. No external text source was used.
merge_overrides({
'investment-ch04-pdf-0030': {
 'explanation':'ADR、ADL及OBOS皆是市場寬幅的技術指標。ADR（Advance Decline Ratio）為漲跌比率，以上漲或下跌股票家數的漲跌比率分析股市是否在超買區或超賣區。ADL（Advance Decline Line）為騰落指標，利用漲跌家數的累積差值研判大盤指數全面走勢，反映股市漲跌力道的強弱。OBOS（Over Buy／Over Sell）是超買、超賣指標，運用在一段時間內股市漲跌家數的累積差，來測量大盤買賣氣勢的強弱及未來走向。',
},
'investment-ch04-pdf-0125': {
 'options': {'4':'RSI有收盤價即可算出'},
 'explanation':'一般採用6日RSI。只要有收盤價即可算出RSI。6日RSI＝6日內上漲總幅度平均值÷6日內上漲和下跌總幅度平均值。',
},
'investment-ch04-pdf-0130': {
 'explanation':'下影線＝開盤價－最低價＝60－56＝4元。',
},
'financial-analysis-ch03-pdf-0002': {
 'explanation':'現金再投資比率＝（營業之淨現金流入－現金股利）÷（不動產、廠房及設備毛額＋長期投資＋其他資產＋營運資金）＝（$35,000－$15,000）÷（$10,000＋$20,000＋$5,000＋$3,000）＝0.53。',
},
'financial-analysis-ch03-pdf-0069': {
 'explanation':'投資活動淨現金流入＝出售土地獲得現金$1,312,500＋出售設備獲得現金$995,000－購買設備支付現金$892,500＝$1,415,000。',
},
'financial-analysis-ch07-pdf-0023': {
 'explanation':'損益兩平點＝固定成本÷（售價－變動成本）。50,000＝F÷（$20－$20×80%），故F＝50,000×$4＝$200,000。',
},
'financial-analysis-ch07-pdf-0142': {
 'explanation':'機器成本＝$500,000＋$100,000＋$70,000＝$670,000。可折舊成本＝機器成本－殘值＝$670,000－$20,000＝$650,000。',
},
'financial-analysis-ch10-pdf-0002': {
 'explanation':'營運現金流量＝（△銷售額－△營運成本）×（1－稅率）＋折舊費用×稅率。由此公式可知，折舊方法的改變及收入變動會改變營運現金流量；期末資產處分損失會有節稅效果，亦會對營運現金流量造成影響。故只有折現率變動不影響營運現金流量。',
},
'financial-analysis-ch10-pdf-0027': {
 'explanation':'由於有出售利益，故淨現金流入＝售價－增加之所得稅＝$130,000－$60,000×17%＝$119,800。',
},
'financial-analysis-ch10-pdf-0038': {
 'explanation':'經濟附加價值（EVA）＝稅後淨營業利潤－總經濟帳面金額×資金成本率＝$60,000－$100×1,000×20%＝$40,000。',
},
'financial-analysis-ch10-pdf-0059': {
 'options': {
  '1':'收入＋費用＋投資',
  '2':'收入＋費用－投資',
  '3':'收入－費用－投資',
  '4':'收入－費用＋投資',
 },
 'explanation':'自由現金流量為：收入－費用－投資。',
},
'financial-analysis-ch10-pdf-0167': {
 'explanation':'淨現金流量＝（增加的收入－增加的成本）×（1－稅率）＋折舊費用×稅率＝（$400,000－$300,000）×（1－17%）＋$50,000×17%＝$91,500。',
},
'financial-analysis-ch11-pdf-0010': {
 'explanation':'甲公司帳上分錄：借記採用權益法之投資$132,000，貸記股本$60,000及資本公積－普通股股票溢價$72,000。',
},
'securities-trading-practice-ch10-pdf-0099': {
 'explanation':'依「證券櫃檯買賣交易市場共同責任制給付結算基金管理辦法」§16規定，櫃檯買賣中心所收取之本基金，應於銀行開立存款專戶保管，並應按證券商別設明細帳。其運用方式如下：一、政府債券之買進。二、銀行存款或郵政儲蓄。三、其他報經主管機關核准之運用方式。',
},
})


# Arithmetic-symbol repairs verified from the corresponding scan crops.
merge_overrides({
'investment-ch05-pdf-0034': {
 'explanation':'計算NPV需用到的資訊包括未來公司現金流量（獲利狀況）及折現率，其中折現率受到目前利率水準及公司風險的影響。NPV與PV的不同是，NPV＝PV－期始投資額，也就是NPV除了考慮到未來現金流量外，還考慮了第0期的現金流量。',
},
'investment-ch05-pdf-0040': {
 'explanation':'稅後每股現金股利＝稅前EPS×（1－稅率）×股利發放率＝$10×（1－25%）×（1－30%）＝$5.25。',
},
'investment-ch09-pdf-0011': {
 'explanation':'當買權的履約價格高於標的物價格時，該買權將沒有履約價值；反之，買權的履約價值＝標的物價格－履約價格。',
},
'investment-ch09-pdf-0064': {
 'explanation':'賣權之內含價值＝執行價格－標的物市價＝43－40＝3元。',
},
'financial-analysis-ch02-pdf-0054': {
 'explanation':'應收帳款收現天數＝360÷6＝60天。現金營業循環週期＝存貨週轉天數＋應收帳款收現天數－應付帳款週轉天數＝90＋60－30＝120天。',
},
'financial-analysis-ch03-pdf-0059': {
 'options': {'1':'（現金收入－現金支出）÷流通在外股數'},
 'explanation':'公式＝（營業活動淨現金流量－特別股股利）÷流通在外普通股股數，顯示每股的資金流量，衡量企業由營運活動產生現金之能力。',
},
'financial-analysis-ch03-pdf-0075': {
 'explanation':'銷貨收入淨額－銷貨毛利＝銷貨成本，故$3,200,000－$800,000＝$2,400,000。支付供應商現金＝銷貨成本＋期末存貨－期初存貨＋期初應付帳款－期末應付帳款＝$2,400,000＋$2,880,000－$2,560,000＋$800,000－$480,000＝$3,040,000。',
},
'financial-analysis-ch06-pdf-0042': {
 'explanation':'權益報酬率＝（純益－特別股股利）÷平均權益。降低營業費用可以增加純益，降低負債利率也可以增加純益；資產使用率增加可以增加營收，進而增加純益。',
},
'financial-analysis-ch07-pdf-0013': {
 'explanation':'銷貨收入＝60萬元÷15%＝400萬元。銷貨成本＝銷貨收入－銷貨毛利＝400萬元×（1－35%）＝260萬元。',
},
'financial-analysis-ch07-pdf-0053': {
 'explanation':'損益兩平點＝總固定成本÷（每單位售價－每單位變動成本）。',
},
'financial-analysis-ch07-pdf-0062': {
 'options': {
  '1':'銷貨收入－變動成本',
  '2':'銷貨收入－固定成本',
  '3':'銷貨收入－損益兩平銷貨收入',
  '4':'銷貨收入－銷貨成本',
 },
 'explanation':'安全邊際＝銷貨收入（或單位）－損益兩平銷貨收入（或單位）。',
},
'financial-analysis-ch07-pdf-0067': {
 'explanation':'選項（1）銷貨成本率＝1－毛利率，故兩者呈反向變動。選項（2）財務狀況須考慮其他負債之影響。選項（3）自有資金通常指權益部分，與短期流動性無直接相關。',
},
'financial-analysis-ch07-pdf-0116': {
 'explanation':'應將舊建築物之帳面金額（＝建築物之成本－建築物之累計折舊）作為舊屋之處分損益來處理。',
},
'financial-analysis-ch10-pdf-0017': {
 'explanation':'出售資產發生損失時，其淨現金流入為：售價＋（帳面金額－售價）×所得稅率。',
},
'investment-ch04-pdf-0152': {
 'options': {
  '3':'＋DI線由下往上突破－DI線',
  '4':'＋DI線由上向下跌破－DI線',
 },
 'explanation':'在DMI中，當＋DI線由下往上突破－DI線，為買進訊號。',
},
})


# Additional scan-verified formula and terminology repairs.
merge_overrides({
'investment-ch05-pdf-0016': {
 'explanation':'淨值＝資產－負債＝650萬－350萬＝300萬元。每股淨值＝$3,000,000÷100,000＝$30；市價淨值比＝$90÷$30＝3。',
},
'financial-analysis-ch02-pdf-0032': {
 'options': {
  '1':'期初存貨＋本期進貨',
  '2':'期初存貨＋期末存貨＋本期進貨',
  '3':'期初存貨－期末存貨＋本期進貨',
  '4':'期末存貨－期初存貨＋本期進貨',
 },
 'explanation':'銷貨相關公式：銷貨成本＝期初存貨＋本期進貨－期末存貨；毛利＝銷貨收入－銷貨成本。',
},
'financial-analysis-ch03-pdf-0077': {
 'options': {
  '1':'營業活動淨現金流量÷流動負債',
  '2':'營業利益÷（營業利益－利息費用）',
  '3':'最近五年度營業活動淨現金流量÷最近五年度（資本支出＋存貨增加額＋現金股利）',
  '4':'（營業活動淨現金流量－現金股利）÷（不動產、廠房及設備毛額＋長期投資＋其他非流動資產＋營運資金）',
 },
 'explanation':'選項（1）為現金流量比率公式；選項（2）為財務槓桿程度公式；選項（4）為現金再投資比率公式。',
},
'financial-analysis-ch05-pdf-0038': {
 'explanation':'權益報酬率＝稅後淨利÷權益。權益＝資產－負債＝$2,500,000－$900,000＝$1,600,000。設稅後淨利為X，則12%＝[X＋$900,000×10%×（1－17%）]÷$2,500,000，故$300,000＝X＋$74,700，解得X＝$225,300；$225,300÷$1,600,000＝14.08%。',
},
'financial-analysis-ch07-pdf-0002': {
 'options': {
  '1':'稅後損益÷銷貨淨額',
  '2':'營業活動淨現金流量÷流動負債',
  '3':'營業利益÷（營業利益－利息費用）',
  '4':'（營業收入淨額－變動營業成本及費用）÷營業利益',
 },
 'explanation':'選項（1）為稅後淨利率；選項（2）為營業淨現金流量對流動負債比率；選項（4）為營運槓桿度。',
},
'financial-analysis-ch10-pdf-0112': {
 'explanation':'轉換價值（Convertible Value）＝轉換比率×股票市價。若依據IAS 32之規定，發行公司發行可轉換公司債時，認列原則如下：一、應付公司債依公允價值或現值入帳（面額與溢折價分開列示）。現值係指以未來應支付之利息及應償還之本金按相同條件但不可轉換公司債之市場利率折現者。二、發行總金額減除應付公司債之公允價值即得轉換權之價值，應認列為「資本公積－認股權」。',
},
'financial-analysis-ch10-pdf-0125': {
 'options': {
  '1':'資產－負債－權益',
  '2':'資產－權益＋負債',
  '3':'權益＋資產－負債',
  '4':'權益＋資產＋負債',
 },
 'explanation':'外在的資金需求（EFN，External Fund Needed）＝資產－負債－權益。EFN指的是自發性資金與保留盈餘的增加仍不足因應營業擴充所需的資金。',
},
'securities-trading-regulations-ch05-pdf-0083': {
 'explanation':'同上題解析。另依「證券交易法」§154第3項規定，交割結算基金不敷清償時，其未受清償部分，得依本法第五十五條第二項之規定受償之。',
},
'investment-ch01-pdf-0096': {
 'explanation':'選項（1）貨幣市場通常沒有集中買賣交易的場所，須透過電話及其他通訊設備的店頭市場（OTC Market）進行交易。選項（2）提供一年期以下金融工具交易市場。選項（4）政府債券屬於資本市場工具。',
},
'investment-ch02-pdf-0005': {
 'explanation':'到期收益率（Yield to Maturity）：是指投資人持有債券，一直持有至到期日所得的預期報酬率。當期收益率（Current Yield）：指買入債券並且持有一期不賣出所得的報酬率。贖回收益率（Yield to Call）：指持有可贖回債券至贖回日所得的報酬率。',
},
})

LOW_TRAILING={
'investment-ch04-pdf-0128','investment-ch08-pdf-0044','investment-ch08-pdf-0117','financial-analysis-ch01-pdf-0021','financial-analysis-ch07-pdf-0078','financial-analysis-ch07-pdf-0080','financial-analysis-ch07-pdf-0081','financial-analysis-ch07-pdf-0110','financial-analysis-ch07-pdf-0122','financial-analysis-ch07-pdf-0128','financial-analysis-ch09-pdf-0007','financial-analysis-ch10-pdf-0153','securities-trading-regulations-ch03-pdf-0055','securities-trading-regulations-ch05-pdf-0080','securities-trading-practice-ch01-pdf-0005','securities-trading-practice-ch03-pdf-0038','securities-trading-practice-ch03-pdf-0039','securities-trading-practice-ch05-pdf-0003','securities-trading-practice-ch05-pdf-0013','securities-trading-practice-ch07-pdf-0012','securities-trading-practice-ch09-pdf-0047','securities-trading-practice-ch09-pdf-0070','securities-trading-practice-ch09-pdf-0091','securities-trading-practice-ch09-pdf-0119','securities-trading-practice-ch10-pdf-0002'
}

def clean_trailing_noise(s:str)->str:
    s=re.sub(r'\s+(?:_|m|n|A|E|H|Q|I|Δ|一|1|3|200|476|506|576)\s*$','',s)
    return s.strip()

def expand_cross_references(items:list[dict])->list[dict]:
    by_key={(x['bankId'],x['chapterId'],int(x['number'])):x for x in items}
    resolved=[]
    visiting=set()
    def resolve(item:dict)->str:
        qid=item['id']
        text=item['explanation']
        if qid in visiting:return text
        m=re.match(r'^同(?:上|前)題解析(?:第\s*([一二三四五六七八九十0-9]+)款)?[。；，,：:]?\s*(.*)$',text)
        m2=re.match(r'^同第\s*(\d+)\s*題解析(?:第\s*([一二三四五六七八九十0-9]+)款)?[。；，,：:]?\s*(.*)$',text)
        target=None; suffix=''
        if m:
            target=by_key.get((item['bankId'],item['chapterId'],int(item['number'])-1)); suffix=m.group(2) or ''
        elif m2:
            target=by_key.get((item['bankId'],item['chapterId'],int(m2.group(1)))); suffix=m2.group(3) or ''
        if not target:return text
        visiting.add(qid); base=resolve(target); visiting.discard(qid)
        out=base.strip()
        if suffix.strip():out=(out+' '+suffix.strip()).strip()
        if out!=text:resolved.append({'id':qid,'reference':text,'resolvedFrom':target['id']})
        return out
    for item in items:item['explanation']=resolve(item)
    return resolved

def main():
    data=json.loads(SRC.read_text(encoding='utf-8'))
    original=copy.deepcopy(data)
    changes=[]
    for item in data['items']:
        qid=item['id']
        before={'question':item['question'],'options':copy.deepcopy(item['options']),'explanation':item['explanation']}
        item['question']=question_clean(item['question'],int(item['number']))
        item['options']={str(k):normalize(v) for k,v in item['options'].items()}
        item['explanation']=normalize(item['explanation'])
        mid_page_number=MID_SCAN_PAGE_NUMBERS.get(qid)
        if mid_page_number:
            item['explanation']=remove_mid_scan_page_number(item['explanation'],mid_page_number)
        if qid in LOW_TRAILING:item['explanation']=clean_trailing_noise(item['explanation'])
        page_number=TRAILING_SCAN_PAGE_NUMBERS.get(qid)
        if page_number:
            # OCR normalization can remove the visual space before a printed page number.
            # The mapping is explicit per scan, so also allow punctuation immediately before it.
            item['explanation']=re.sub(
                rf'(?:\s+|(?<=[。；，,：:])){re.escape(page_number)}\s*$',
                '',
                item['explanation'],
            ).strip()
        ov=OVERRIDES.get(qid,{})
        if 'question' in ov:item['question']=ov['question']
        if 'options' in ov:item['options'].update({str(k):v for k,v in ov['options'].items()})
        if 'explanation' in ov:item['explanation']=ov['explanation']
        # Final typographic normalization applies to manual values too.
        item['question']=normalize(item['question'])
        item['options']={k:normalize(v) for k,v in item['options'].items()}
        item['explanation']=normalize(item['explanation'])
        after={'question':item['question'],'options':item['options'],'explanation':item['explanation']}
        if before!=after:
            fields=[k for k in before if before[k]!=after[k]]
            changes.append({'id':qid,'fields':fields,'manualOverride':qid in OVERRIDES})
        # Keep learner-facing content only; detailed OCR quality remains in separate audit docs.
        item.pop('quality',None)
    resolved_references=expand_cross_references(data['items'])
    # Hard validation
    assert len(data['items'])==3526
    ids=[x['id'] for x in data['items']]; assert len(ids)==len(set(ids))
    for x in data['items']:
        assert x['question'].strip(),x['id']
        assert x['explanation'].strip(),x['id']
        assert set(x['options'])=={'1','2','3','4'},x['id']
        assert all(x['options'][k].strip() for k in ('1','2','3','4')),x['id']
        assert x['answer'] in {'1','2','3','4'},x['id']
        assert not re.match(r'^\s*\d{1,4}[\.、]\s*', x['question']), x['id']
        combined=' '.join([x['question'],x['explanation'],*x['options'].values()])
        assert '組閤' not in combined and '適閤' not in combined and '另+外' not in combined, x['id']
        assert '\ufffd' not in combined and '\x00' not in combined, x['id']
        assert not re.match(r'^同(?:上|前|第).{0,12}題解析', x['explanation']), x['id']
        assert '3.5 $2.000.000-$600.000' not in combined, x['id']
        assert '$1.22 $40×120.000' not in combined, x['id']
        assert '資產週轉率次期股利' not in combined, x['id']
    assert len(FINAL_VISUAL_REVIEW_IDS)==62
    assert len(SPOT_VISUAL_REVIEW_IDS)==5
    assert len(SECOND_SPOT_VISUAL_REVIEW_IDS)==85
    all_visual_review_ids=FINAL_VISUAL_REVIEW_IDS | SPOT_VISUAL_REVIEW_IDS | SECOND_SPOT_VISUAL_REVIEW_IDS
    assert len(all_visual_review_ids)==152
    assert all_visual_review_ids.issubset(set(ids))
    item_by_id={item['id']:item for item in data['items']}
    visual_review_chapters={
        (item_by_id[qid]['bankId'], item_by_id[qid]['chapterId'])
        for qid in all_visual_review_ids
    }
    assert len(visual_review_chapters)==40
    data['version']=4
    data['source']='project-scan-pages-only; reconciled full-text transcription'
    data['questionCount']=len(data['items'])
    OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    OVERRIDE_OUT.write_text(json.dumps({'source':'project scan crops only','items':OVERRIDES},ensure_ascii=False,indent=2),encoding='utf-8')
    audit={
      'version':2,
      'source':'project-scan-pages-only',
      'questionCount':len(data['items']),
      'questionAndExplanationTextFieldCount':len(data['items'])*2,
      'optionTextFieldCount':len(data['items'])*4,
      'learnerTextFieldCount':len(data['items'])*6,
      'scanPageCount':818,
      'changedQuestionCount':len(changes),
      'manualOverrideQuestionCount':len(OVERRIDES),
      'finalVisualReviewQuestionCount':len(FINAL_VISUAL_REVIEW_IDS),
      'spotVisualReviewQuestionCount':len(SPOT_VISUAL_REVIEW_IDS),
      'secondSpotVisualReviewQuestionCount':len(SECOND_SPOT_VISUAL_REVIEW_IDS),
      'totalVisualReviewQuestionCount':len(all_visual_review_ids),
      'visualReviewChapterCount':len(visual_review_chapters),
      'visualReviewQuestionIds':sorted(all_visual_review_ids),
      'multiEngineConsensusQuestionCount':len(data['items'])-len(OVERRIDES),
      'expandedReferenceExplanationCount':len(resolved_references),
      'changes':changes,
      'outputSha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),
      'forbiddenExternalSourcesUsed':False,
    }
    AUDIT.write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in audit.items() if k!='changes'},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
