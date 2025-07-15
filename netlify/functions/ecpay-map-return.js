// 檔案路徑: netlify/functions/ecpay-map-return.js
exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const ecpayResponse = new URLSearchParams(event.body);
    const responseData = Object.fromEntries(ecpayResponse.entries());
    console.log("從綠界收到的完整回傳資料:", JSON.stringify(responseData, null, 2));

    // ... (您原本的安全驗證邏輯不變) ...
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    if (responseData.CheckMacValue !== generateCheckMacValue({ ...responseData, CheckMacValue: undefined }, hashKey, hashIV)) {
        console.error('CheckMacValue 驗證失敗！');
        return { statusCode: 400, body: 'Invalid CheckMacValue' };
    }

    if (responseData.RtnCode === '1') {
      console.log(`訂單 ${responseData.MerchantTradeNo} 付款成功。`);
      
      // ... (您原本呼叫 n8n 的邏輯可以保留) ...

      // ▼▼▼ 這是全新的物流訂單建立流程 ▼▼▼
      // 檢查 CustomField1 是否有我們偷渡的門市資訊
      if (responseData.CustomField1) {
        try {
          const storeInfo = JSON.parse(responseData.CustomField1);
          console.log(`偵測到門市資訊，準備為訂單 ${responseData.MerchantTradeNo} 建立物流訂單。`);
          
          // 呼叫我們等一下要建立的新 Function
          await fetch(`${process.env.URL}/.netlify/functions/create-shipping-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentData: responseData, // 把整包付款成功的資料傳過去
              storeInfo: storeInfo       // 把解析出來的門市資訊傳過去
            }),
          });
          console.log(`物流訂單建立請求已發送。`);

        } catch (shippingError) {
          console.error('[錯誤] 建立物流訂單時失敗:', shippingError);
          // 即使物流訂單建立失敗，金流仍然是成功的，所以流程要繼續
        }
      }
      // ▲▲▲ 物流訂單流程結束 ▲▲▲
    }

    // 將使用者導向感謝頁面
    const thankYouUrl = `/order-complete.html?orderId=${responseData.MerchantTradeNo}`;
    return {
      statusCode: 302,
      headers: { Location: thankYouUrl },
    };

  } catch (error) {
    console.error('ecpay-return function 發生錯誤:', error);
    return { statusCode: 302, headers: { Location: process.env.URL || '/' } };
  }
};
// 請確保您的 generateCheckMacValue 函式也在此檔案中