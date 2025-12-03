/**
 * ==========================================
 * 天草市 随意契約判定ロジック
 * ==========================================
 */

const CONFIG = {
    // 随意契約の金額上限 (施行令第167条の2第1項第1号、規則第15条) - 税込金額で判定
    PRICE_LIMITS: {
        '1': 200, // 工事又は製造の請負
        '2': 150, // 財産の買入れ
        '3': 80,  // 物件の借入れ
        '4': 50,  // 財産の売払い
        '5': 30,  // 物件の貸付け
        '6': 100  // 前各号に掲げる以外のもの
    },
    // 契約検査課への依頼基準金額 (万円)
    OFFICE_THRESHOLDS: {
        CONSTRUCTION: 20,
        GOODS: 20,
        RENTAL: 20,
        SERVICE: 50
    }
};

const CONTRACT_TYPE_NAMES = {
    '1': '工事又は製造の請負',
    '2': '財産の買入れ',
    '3': '物件の借入れ',
    '4': '財産の売払い',
    '5': '物件の貸付け',
    '6': '前各号に掲げる以外のもの (委託等)'
};

const REASON_DETAILS = {
    '2': { name: '第2号 (性質又は目的が競争入札に適しない)', oneParty: true, notes: '不動産の買入れ・借入れ、特殊技術、特許権等。契約の目的達成に特定の者が必要。', document: '「随意契約及び業者選定理由書」に採用した理由、業者選定理由を明確に記載すること。' },
    '3': { name: '第3号 (福祉関係施設等からの買入れ・役務)', oneParty: true, notes: '障害者支援施設等、シルバー人材センター、母子福祉団体等との契約。', document: '「随意契約及び業者選定理由書」に採用した理由、業者選定理由を明確に記載すること。**【重要】公表手続き（発注の見通し、契約締結後）が必要。**' },
    '5': { name: '第5号 (緊急の必要)', oneParty: true, notes: '天災地変等、予見し得ない緊急事態による。年度末等の予算執行上の都合は対象外。', document: '「随意契約及び業者選定理由書」に採用した理由、業者選定理由を明確に記載すること。' },
    '6': { name: '第6号 (競争入札に付することが不利)', oneParty: true, notes: '現履行中の受託者にさせた方が工期短縮、経費節減等で有利な場合。', document: '「随意契約及び業者選定理由書」に採用した理由、業者選定理由を明確に記載すること。' },
    '7': { name: '第7号 (時価に比べて著しく有利な価格)', oneParty: false, notes: '他の者に比べて著しく有利な価格で契約できる見込みがある場合。', document: '「随意契約及び業者選定理由書」に採用した理由、業者選定理由を明確に記載すること。**【重要】2者以上の者に見積書を依頼し、比較検討すること。**' },
    '8': { name: '第8号 (入札不調)', oneParty: false, notes: '入札者がない、又は再度の入札で落札者がない場合。', document: '「随意契約及び業者選定理由書」に採用した理由、業者選定理由を明確に記載すること。**【重要】契約保証金・履行期限を除き、当初の予定価格・条件を変更不可。**' },
    '9': { name: '第9号 (落札者が契約を締結しない)', oneParty: false, notes: '落札者が辞退・倒産等で契約締結しない場合。', document: '「随意契約及び業者選定理由書」に採用した理由、業者選定理由を明確に記載すること。**【重要】落札金額の制限内で見積合わせ。履行期限を除き、当初の条件を変更不可。**' },
};

const STANDARD_PROCEDURE = [
    { step: '執行(施行)伺書の作成', detail: '物品契約管理システムへ登録し、システムから出力 (工事は除く)。随意契約を採用した理由、業者を選定した理由等を記入する。**原則「随意契約及び業者選定理由書」を作成添付**。仕様書、カタログ等を添付。' },
    { step: '指名伺書の作成', detail: '業者へ通知書により見積依頼 (**原則として2者以上**)。指名業者に偏りが出ないよう考慮。見積期間は特別の場合を除き5日 (休日等を除く)が必要。' },
    { step: '見積書の開札', detail: '2名以上 (立会い者含む) で開札し、記載事項の点検。開札調書を作成。' },
    { step: '落札者の決定', detail: '開札後、見積書提出の全業者に結果を連絡。契約金額に応じた請書(案)または契約書(案)を作成。' },
    { step: '契約の締結', detail: '落札決定後速やかに (概ね1週間以内) 契約締結。' }
];

function createSafeHTML(markdownText) {
    const span = document.createElement('span');
    const parts = markdownText.split(/(\*\*.*?\*\*)/g);
    parts.forEach(part => {
        if (part.startsWith('**') && part.endsWith('**')) {
            const strong = document.createElement('strong');
            strong.textContent = part.slice(2, -2);
            span.appendChild(strong);
        } else {
            span.appendChild(document.createTextNode(part));
        }
    });
    return span;
}

function updatePricePreview(val) {
    const previewEl = document.getElementById('pricePreview');
    if (!val || val === '') { previewEl.textContent = "0 円"; return; }
    const yen = parseFloat(val) * 10000;
    if (isNaN(yen)) { previewEl.textContent = "数値エラー"; } 
    else { previewEl.textContent = new Intl.NumberFormat('ja-JP').format(yen) + " 円"; }
}

function resetForm() {
    document.getElementById('contractType').value = "";
    document.getElementById('plannedPrice').value = "";
    document.getElementById('reasonNone').checked = true;
    updatePricePreview("");
    // サマリーと結果エリアを隠す
    document.getElementById('inputSummary').classList.add('hidden');
    document.getElementById('resultOutput').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function determineContractOffice(type, price, specialReason) {
    const isOneParty = ['2', '3', '5', '6'].includes(specialReason);
    if (isOneParty) return '主管課';

    const thresholds = CONFIG.OFFICE_THRESHOLDS;
    switch (type) {
        case '1': if (price > thresholds.CONSTRUCTION) return '契約検査課 (競争入札が必要な案件)'; break;
        case '2': if (price > thresholds.GOODS) return '契約検査課'; break;
        case '3': if (price > thresholds.RENTAL) return '契約検査課'; break;
        case '6': if (price > thresholds.SERVICE) return '契約検査課'; break;
    }
    return '主管課';
}

function judgeContract() {
    const contractType = document.getElementById('contractType').value;
    const priceMan = parseFloat(document.getElementById('plannedPrice').value);
    const specialReasonElement = document.querySelector('input[name="specialReason"]:checked');
    const specialReason = specialReasonElement ? specialReasonElement.value : '0';
    
    if (!contractType || isNaN(priceMan) || priceMan < 0) {
        alert('契約の種類と予定価格を正しく入力してください。\n単位は「万円」です。');
        return;
    }

    // ------------------------------------------
    // 印刷用の入力サマリー生成
    // ------------------------------------------
    const summaryEl = document.getElementById('inputSummary');
    const typeName = CONTRACT_TYPE_NAMES[contractType] || '不明';
    let reasonName = '特になし (価格要件のみ)';
    if (specialReason !== '0' && REASON_DETAILS[specialReason]) {
        reasonName = REASON_DETAILS[specialReason].name;
    }
    // 表示内容をセットし、非表示クラスを削除
    summaryEl.innerHTML = `
        <div><strong>契約の種類:</strong> ${typeName}</div>
        <div><strong>予定価格:</strong> ${priceMan}万円 (税込)</div>
        <div><strong>選択理由:</strong> ${reasonName}</div>
    `;
    summaryEl.classList.remove('hidden');
    // ------------------------------------------

    let article = '', quotationDetail = '', notes = [], flowNote = '', contractFormDetail = ''; 
    
    const office = determineContractOffice(contractType, priceMan, specialReason);
    const resultOfficeDiv = document.getElementById('resultOffice');
    const resultOfficeNormalDiv = document.getElementById('resultOfficeNormal');
    
    if (office !== '主管課') {
        resultOfficeDiv.textContent = `${office}へ依頼してください`;
        resultOfficeDiv.classList.remove('hidden');
        resultOfficeNormalDiv.classList.add('hidden');
    } else {
        resultOfficeDiv.classList.add('hidden');
        resultOfficeNormalDiv.textContent = '主管課で事務を行います';
        resultOfficeNormalDiv.classList.remove('hidden');
    }

    // 契約形式判定
    const resultContractForm = document.getElementById('resultContractForm');
    resultContractForm.className = 'result-text-lg';
    if (priceMan > 50) {
        contractFormDetail = '【契約書が必要】(50万円超)';
        resultContractForm.classList.add('text-red');
        notes.push('**【契約締結形式】** 契約書が必要です。落札決定後速やかに契約書(案)を作成し、契約締結すること。');
    } else if (priceMan > 20) {
        contractFormDetail = '【請書が必要】(20万円超50万円以内)';
        resultContractForm.classList.add('text-orange');
        notes.push('**【契約締結形式】** 請書(案)を作成し、契約締結すること。');
    } else {
        contractFormDetail = '【契約書・請書は原則不要】(20万円以下)';
        resultContractForm.classList.add('text-emerald');
        notes.push('**【契約締結形式】** 契約書・請書は原則不要です。発注書や事務処理要領に基づき、適切に執行してください。');
    }
    resultContractForm.textContent = contractFormDetail;

    const priceLimit = CONFIG.PRICE_LIMITS[contractType];
    const isMinorContract = priceMan <= priceLimit;
    
    if (isMinorContract) {
        article = `施行令第167条の2第1項第1号 (少額随契 - 上限${priceLimit}万円)`;
        if (priceMan <= 10) {
            quotationDetail = '原則として1者のみの徴取で足りる (規則第14条第1項第3号)';
        } else if (['7','8','9'].includes(specialReason)) {
            quotationDetail = '原則として2者以上の徴取が必要 (特殊事由により競争性を確保)';
            notes.push('【競争性の確保】第7/8/9号事由が重なる場合、少額でも時価や競争性を比較検討するため、原則として2者以上の見積徴取を強く推奨します。');
        } else {
            quotationDetail = '原則として2者以上の徴取が必要';
        }
        
        if (priceMan <= 50) notes.push('予定価格調書の作成は省略可能 (50万円以下)');
        else notes.push('予定価格調書を作成すること (50万円超)');
        
        if (priceMan <= priceLimit && priceMan > 10 && specialReason === '0' && quotationDetail.includes('2者以上')) {
            notes.push('見積予定業者が複数で、執行伺書に根拠条文と見積予定業者(複数者)の記載があれば、理由書の添付は**不要**です。');
        } else if (specialReason !== '0') {
            notes.push('【特殊事由あり】第1号優先適用ですが、特殊事由が重なる場合は「随意契約及び業者選定理由書」を作成添付し、業者選定理由を明確にすること。');
            if (specialReason === '3') notes.push('**【重要】第3号(福祉施設等)の公表手続きが必要です。**');
        } else if (priceMan <= 10) {
            notes.push('1者随契で処理する場合、業者選定理由等を執行伺書に記載してください。');
        }
        flowNote = `判定は「第1号優先適用」の原則に基づき行われました。（予定価格 ${priceMan}万円は上限額 ${priceLimit}万円以下）`;

    } else if (specialReason !== '0') {
        const detail = REASON_DETAILS[specialReason];
        article = `施行令第167条の2第1項第${specialReason}号 (${detail.name.split('(')[1].replace(')', '')})`;
        if (detail.oneParty) {
            quotationDetail = '原則として1者のみの徴取で足りる (規則第14条第1項による)';
            if (specialReason === '5') notes.push('【緊急時】可能であれば複数の業者から見積を徴取するなど競争性を確保するよう心がけてください。');
        } else {
            quotationDetail = '原則として2者以上の徴取が必要';
        }
        notes.push(detail.notes);
        notes.push(detail.document);
        notes.push('価格が50万円を超えているため、予定価格調書の作成は必須です。');
        flowNote = `（予定価格 ${priceMan}万円は第1号の上限額 ${priceLimit}万円を超過しています。特殊事由（第${specialReason}号）が適用されました。）`;
    } else {
        article = '随意契約の適用不可';
        quotationDetail = '一般競争入札又は指名競争入札が必要です。';
        notes.push('**【原則】** 地方自治法第234条第2項により、この場合は随意契約は適用できません。**一般競争入札**を原則として検討してください。');
        notes.push('価格が50万円を超えているため、予定価格調書の作成は必須です。');
        contractFormDetail = '入札により、落札金額に応じて契約書または請書が必要です。';
        resultContractForm.textContent = contractFormDetail; 
        flowNote = `（予定価格 ${priceMan}万円は上限額 ${priceLimit}万円を超過しており、かつ特殊事由が選択されていません。）`;
    }

    document.getElementById('resultArticle').textContent = article;
    
    const quoteEl = document.getElementById('resultQuotation');
    quoteEl.innerHTML = ''; 
    quoteEl.appendChild(createSafeHTML(quotationDetail));

    const notesEl = document.getElementById('resultNotes');
    notesEl.innerHTML = '';
    notes.forEach(note => {
        const p = document.createElement('p');
        p.appendChild(createSafeHTML(note));
        notesEl.appendChild(p);
    });

    document.getElementById('resultFlow').textContent = flowNote;

    const procEl = document.getElementById('resultProcedure');
    procEl.innerHTML = '';
    if (office !== '主管課') {
        const div = document.createElement('div');
        div.className = 'step-item';
        div.innerHTML = `
            <div class="step-number danger">1</div>
            <div class="step-content">
                <p class="step-title danger">契約検査課への依頼</p>
                <p class="step-detail">物品契約管理システムに入力し、出力した伺書に必要書類を添付して提出してください。</p>
                <p class="step-detail" style="margin-top:4px;">※依頼案件については、「随意契約及び業者選定理由書」の添付は不要です。</p>
            </div>
        `;
        procEl.appendChild(div);
    } else {
        STANDARD_PROCEDURE.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'step-item';
            const numDiv = document.createElement('div');
            numDiv.className = 'step-number';
            numDiv.textContent = index + 1;
            const contentDiv = document.createElement('div');
            contentDiv.className = 'step-content';
            const titleP = document.createElement('p');
            titleP.className = 'step-title';
            titleP.textContent = item.step;
            const detailP = document.createElement('p');
            detailP.className = 'step-detail';
            detailP.appendChild(createSafeHTML(item.detail));
            contentDiv.appendChild(titleP);
            contentDiv.appendChild(detailP);
            div.appendChild(numDiv);
            div.appendChild(contentDiv);
            procEl.appendChild(div);
        });
    }

    const output = document.getElementById('resultOutput');
    output.classList.remove('hidden');
    output.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.error('SW failed', err));
    }

    let deferredPrompt;
    const installBtnContainer = document.getElementById('installBtnContainer');
    const installBtn = document.getElementById('installBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installBtnContainer.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtnContainer.classList.add('hidden');
    });

    document.getElementById('plannedPrice').addEventListener('input', (e) => updatePricePreview(e.target.value));
    document.getElementById('plannedPrice').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); judgeContract(); }
    });
    document.getElementById('judgeBtn').addEventListener('click', judgeContract);
    document.getElementById('clearBtn').addEventListener('click', (e) => {
        e.preventDefault(); resetForm();
    });
    document.getElementById('resetBtn').addEventListener('click', resetForm);
    document.getElementById('printBtn').addEventListener('click', () => window.print());
});
