// 檔案路徑: netlify/functions/ecpay-return.js
const crypto = require('crypto');
const fetch = require('node-fetch');

// ▼▼▼ 請將這裡的網址，換成您在步驟二中，從 n8n 取得的 Webhook 測試網址 ▼▼▼
const N8N_UPDATE_ORDER_WEBHOOK = 'https://BambooLee-n8n-free.hf.space/webhook/ecfa6903-b041-47ab-9568-8e510067b7c9';
// ▲▲▲ 請將這裡的網址，換成您在步驟二中，從 n8n 取得的 Webhook 測試網址 ▲▲▲

// ... generateCheckMacValue 函式與另一支 function 相同 ...
function generateCheckMacValue(params, hashKey, hashIV) {
  const sortedKeys = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  let checkString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  checkString = `HashKey=${hashKey}&${checkString}&HashIV=${hashIV}`;
  let encodedString = encodeURIComponent(checkString).toLowerCase();
  encodedString = encodedString.replace(/'/g, "%27").replace(/~/g, "%7e").replace(/%20/g, "+");
  const hash = crypto.createHash('sha256').update(encodedString).digest('hex');
  return hash.toUpperCase();
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
      // 1. 從綠界回傳的請求中解析出訂單資料
    const ecpayResponse = new URLSearchParams(event.body);
    const responseData = Object.fromEntries(ecpayResponse.entries());
    console.log("從綠界收到的完整回傳資料:", JSON.stringify(responseData, null, 2));

    // 2. 安全驗證
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    const receivedMacValue = responseData.CheckMacValue;
    const dataToVerify = { ...responseData };
    delete dataToVerify.CheckMacValue;
    const calculatedMacValue = generateCheckMacValue(dataToVerify, hashKey, hashIV);

    if (receivedMacValue !== calculatedMacValue) {
      console.error('CheckMacValue 驗證失敗！');
      return { statusCode: 400, body: 'Invalid CheckMacValue' };
    }

    // 3. 確認付款狀態
    if (responseData.RtnCode === '1') {
      console.log(`[路標 1] 訂單 ${responseData.MerchantTradeNo} 付款成功，準備呼叫 n8n。`);
      console.log(`[路標 2] 目標 n8n URL: ${N8N_UPDATE_ORDER_WEBHOOK}`);

      // 為了更精確地捕捉錯誤，我們在 fetch 外面包一層獨立的 try...catch
      try {
        await fetch(N8N_UPDATE_ORDER_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'PAID',
            orderData: responseData
          }),
        });
        console.log('[路標 3] n8n Webhook 呼叫已發送，過程中未拋出錯誤。');

      } catch (fetchError) {
        console.error('[錯誤] 呼叫 n8n Webhook 時捕捉到錯誤:', fetchError);
      }
    }

    // 4. 將使用者導向感謝頁面
    console.log('[路標 4] 準備將使用者導向感謝頁面...');
    const thankYouUrl = `/order-complete.html?orderId=${responseData.MerchantTradeNo}`;

    return {
      statusCode: 302,
      headers: {
        Location: thankYouUrl,
      },
    };

  } catch (error) {
    console.error('ecpay-return function 發生錯誤:', error);
    // 即使發生錯誤，也盡量將使用者導回首頁，避免看到錯誤畫面
    return {
      statusCode: 302,
      headers: {
        Location: process.env.URL || '/',
      },
    };
  }
};