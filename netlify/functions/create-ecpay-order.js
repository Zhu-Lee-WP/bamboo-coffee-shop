// 檔案路徑: netlify/functions/create-ecpay-order.js

// 載入 Node.js 的加密模組，用來產生 SHA256 加密
const crypto = require('crypto');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // --- 步驟 1: 取得並整理訂單資料 ---
    const cartData = JSON.parse(event.body);

    // 從環境變數讀取綠界金鑰 (這些值儲存在 .env 檔案中)
    const merchantID = process.env.ECPAY_MERCHANT_ID;
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;

    // 產生一個獨一無二的訂單編號 (時間戳 + 隨機數字)
    const merchantTradeNo = `BAMBOO${Date.now()}`;

    // 計算訂單總金額
    const totalAmount = cartData.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // 組合商品名稱
    const itemName = cartData.map(item => `${item.name} x ${item.quantity}`).join('#');

    // 取得當前時間，並格式化成 yyyy/MM/dd HH:mm:ss
    const tradeDate = new Date().toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // --- 步驟 2: 組合要送給綠界的訂單參數 ---
    let order = {
      MerchantID: merchantID,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: totalAmount,
      TradeDesc: '竹意軒咖啡工坊線上訂單',
      ItemName: itemName,
      ReturnURL: 'https://www.google.com', // 消費者付款成功後，綠界會將他導回的網址 (之後要換成你的網站)
      ChoosePayment: 'ALL',
      EncryptType: 1, // 必須是 1，代表使用 SHA256 加密
    };

    // --- 步驟 3: 產生加密驗證碼 (CheckMacValue) ---
    // 這是綠界最複雜也最重要的部分，用來驗證訂單未被竄改

    // 1. 將訂單參數的 key 按照字母順序排序
    const sortedKeys = Object.keys(order).sort((a, b) => a.localeCompare(b));

    // 2. 組成查詢字串 (key1=value1&key2=value2...)
    let checkString = sortedKeys.map(key => `${key}=${order[key]}`).join('&');

    // 3. 頭尾加上 HashKey 和 HashIV
    checkString = `HashKey=${hashKey}&${checkString}&HashIV=${hashIV}`;

    // 4. 將字串進行 URL 編碼，並轉為小寫
    checkString = encodeURIComponent(checkString).toLowerCase();

    // 5. 使用 SHA256 加密，並轉為大寫
    const checkMacValue = crypto
      .createHash('sha256')
      .update(checkString)
      .digest('hex')
      .toUpperCase();

    // 將訂單參數與加密驗證碼都回傳給前端
    return {
      statusCode: 200,
      body: JSON.stringify({
        orderData: order,
        checkMacValue: checkMacValue
      })
    };

  } catch (error) {
    console.error('後端 Function 出錯:', error);
    return { statusCode: 500, body: JSON.stringify({ error: '伺服器內部錯誤' }) };
  }
};