// 檔案路徑: netlify/functions/create-ecpay-order.js
// 【官方規則修正版】 - 嚴格按照官方文件修正排序與編碼

const crypto = require('crypto');

/**
 * 嚴格按照綠界官方文件，產生 CheckMacValue
 */
function generateCheckMacValue(params, hashKey, hashIV) {
  // 步驟 1: 將參數的 Key 值依字母排序 (不分大小寫)
  const sortedKeys = Object.keys(params).sort((a, b) => {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });

  // 步驟 2: 組成查詢字串
  let checkString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');

  // 步驟 3: 頭尾加上 HashKey 和 HashIV
  checkString = `HashKey=${hashKey}&${checkString}&HashIV=${hashIV}`;

  // 步驟 4: 進行 URL 編碼，並轉為小寫
  // 這裡我們使用官方推薦的、最純粹的編碼方式
  let encodedString = encodeURIComponent(checkString).toLowerCase();

  // 步驟 5: 處理 .net 的特殊字元，這是最關鍵的一步
  // 確保編碼結果與 C# 的 HttpUtility.UrlEncode 相同
  encodedString = encodedString
    .replace(/'/g, "%27")
    .replace(/~/g, "%7e")
    .replace(/%20/g, "+");

  // 步驟 6: 使用 SHA256 加密
  const hash = crypto.createHash('sha256').update(encodedString).digest('hex');

  // 步驟 7: 轉為大寫
  return hash.toUpperCase();
}


exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const cartData = JSON.parse(event.body);

    const merchantID = process.env.ECPAY_MERCHANT_ID;
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    // 為了讓本地測試和線上部署都能運作，我們這樣設定 ReturnURL
    // 如果是在 Netlify 環境，process.env.URL 會是你的網站網址
    const returnURL = process.env.URL || 'http://localhost:8888';

    const merchantTradeNo = `BAMBOO${Date.now()}`;
    const totalAmount = cartData.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const itemName = cartData.map(item => `${item.name} x ${item.quantity}`).join('#');
    const tradeDate = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/-/g, '/');

    let orderParams = {
      MerchantID: merchantID,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: totalAmount,
      TradeDesc: '竹意軒咖啡工坊線上訂單',
      ItemName: itemName,
      ReturnURL: returnURL, // 付款成功後的返回網址
      ChoosePayment: 'ALL',
      EncryptType: 1,
    };

    const checkMacValue = generateCheckMacValue(orderParams, hashKey, hashIV);

    return {
      statusCode: 200,
      body: JSON.stringify({
        orderData: orderParams,
        checkMacValue: checkMacValue,
        // 為了方便前端跳轉，我們也把綠界的測試 API 位置傳過去
        paymentUrl: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut'
      })
    };

  } catch (error) {
    console.error('後端 Function 出錯:', error);
    return { statusCode: 500, body: JSON.stringify({ error: `伺服器內部錯誤: ${error.message}` }) };
  }
};