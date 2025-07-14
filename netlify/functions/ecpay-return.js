// 檔案路徑: netlify/functions/ecpay-return.js
const crypto = require('crypto');
const fetch = require('node-fetch');

// ▼▼▼ 請將這裡的網址，換成您在步驟二中，從 n8n 取得的 Webhook 測試網址 ▼▼▼
const N8N_UPDATE_ORDER_WEBHOOK = 'https://BambooLee-n8n-free.hf.space/webhook-test/ef6119b4-5190-43f0-944d-ff29f0f3e9d7';
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

    // 2. 安全驗證：重新計算一次 CheckMacValue，比對是否與綠界送來的一致
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    const receivedMacValue = responseData.CheckMacValue;

    // 2.1 準備要驗證的資料，注意要刪除 CheckMacValue 本身
    const dataToVerify = { ...responseData };
    delete dataToVerify.CheckMacValue;
    const calculatedMacValue = generateCheckMacValue(dataToVerify, hashKey, hashIV);

    // 2.2 比對驗證碼
    if (receivedMacValue !== calculatedMacValue) {
      console.error('CheckMacValue 驗證失敗！', { received: receivedMacValue, calculated: calculatedMacValue });
      return { statusCode: 400, body: 'Invalid CheckMacValue' };
    }

    // 3. 確認付款狀態，並觸發 n8n
    // RtnCode=1 代表交易成功
    if (responseData.RtnCode === '1') {
      console.log(`訂單 ${responseData.MerchantTradeNo} 付款成功`);

      // 3.1 呼叫 n8n Webhook，去更新 Google Sheet 並發送通知
      await fetch(N8N_UPDATE_ORDER_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PAID',
          orderData: responseData
        }),
      });
    }

    // 4. 將使用者導向感謝頁面
    // 我們在網址上附上訂單編號，讓感謝頁面可以顯示
    const thankYouUrl = `/order-complete?orderId=${responseData.MerchantTradeNo}`;

    return {
      statusCode: 302, // 302 是「暫時重導向」的 HTTP 狀態碼
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