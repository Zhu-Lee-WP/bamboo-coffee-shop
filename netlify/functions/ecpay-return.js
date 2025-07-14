// 檔案路徑: netlify/functions/ecpay-return.js
// 【偵錯導向版】 - 暫時移除 n8n 呼叫，專心測試頁面重新導向

const crypto = require('crypto');
const fetch = require('node-fetch');

// ... generateCheckMacValue 函式維持不變 ...
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
    const ecpayResponse = new URLSearchParams(event.body);
    const responseData = Object.fromEntries(ecpayResponse.entries());

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

    if (responseData.RtnCode === '1') {
      console.log(`訂單 ${responseData.MerchantTradeNo} 付款成功，準備重新導向...`);

      // ▼▼▼ 我們暫時將呼叫 n8n 的這段程式碼「註解」掉 ▼▼▼
      /*
      await fetch(N8N_UPDATE_ORDER_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PAID',
          orderData: responseData
        }),
      });
      */
      // ▲▲▲ 我們暫時將呼叫 n8n 的這段程式碼「註解」掉 ▲▲▲
    }

    // 將使用者導向感謝頁面
    const thankYouUrl = `${process.env.URL}/thankyou.html?orderId=${responseData.MerchantTradeNo}`;

    return {
      statusCode: 302,
      headers: {
        Location: thankYouUrl,
      },
    };

  } catch (error) {
    console.error('ecpay-return function 發生錯誤:', error);
    return {
      statusCode: 302,
      headers: {
        Location: process.env.URL || '/',
      },
    };
  }
};