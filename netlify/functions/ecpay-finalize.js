// 檔案路徑: netlify/functions/ecpay-finalize.js

exports.handler = async function(event, context) {
  // 我們只處理來自綠界的 POST 請求
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 從傳來的請求中解析出資料，以取得訂單編號
    const ecpayResponse = new URLSearchParams(event.body);
    const responseData = Object.fromEntries(ecpayResponse.entries());
    const merchantTradeNo = responseData.MerchantTradeNo;

    // 產生要導向的感謝頁面網址，並附上訂單編號
    const thankYouUrl = `/order-complete.html?orderId=${merchantTradeNo}`;

    // 發出 302 重新導向指令
    return {
      statusCode: 302,
      headers: {
        Location: thankYouUrl,
      },
    };
  } catch (error) {
    console.error('ecpay-finalize function 發生錯誤:', error);
    // 如果發生意外，將使用者導回首頁
    return {
      statusCode: 302,
      headers: {
        Location: '/',
      },
    };
  }
};