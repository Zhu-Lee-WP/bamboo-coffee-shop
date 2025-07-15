// 檔案路徑: netlify/functions/ecpay-map-return.js (偵錯加強版)

exports.handler = async function(event, context) {
  // 只處理來自綠界的 POST 請求
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  console.log('[偵錯日誌] ecpay-map-return 已被觸發。');
  console.log('[偵錯日誌] 收到的原始 Body:', event.body);

  try {
    const params = new URLSearchParams(event.body);
    const cvsStoreId = params.get('CVSStoreID');
    const cvsStoreName = params.get('CVSStoreName');
    const merchantTradeNo = params.get('MerchantTradeNo');

    // ▼▼▼ 加入更多日誌，看看我們是否成功解析出資料 ▼▼▼
    console.log(`[偵錯日誌] 解析後的 MerchantTradeNo: ${merchantTradeNo}`);
    console.log(`[偵錯日誌] 解析後的 CVSStoreID: ${cvsStoreId}`);
    console.log(`[偵錯日誌] 解析後的 CVSStoreName: ${cvsStoreName}`);

    if (!cvsStoreId || !cvsStoreName) {
        console.error('[錯誤] 無法從綠界的回傳中解析出 CVSStoreID 或 CVSStoreName。');
        // 即使出錯，也導回首頁，但附上錯誤訊息
        return { statusCode: 302, headers: { Location: `${process.env.URL}/?status=store-error` } };
    }

    // 我們將門市資訊編碼後，放在重新導向的 URL 參數中
    const encodedStoreName = encodeURIComponent(cvsStoreName);
    const redirectUrl = `${process.env.URL}/?cvsStoreId=${cvsStoreId}&cvsStoreName=${encodedStoreName}&status=store-selected`;

    console.log(`[偵錯日誌] 準備將使用者重新導向至: ${redirectUrl}`);

    // 將使用者導回首頁，並附上門市資訊
    return {
      statusCode: 302,
      headers: {
        Location: redirectUrl,
      },
    };
  } catch (error) {
    console.error('[錯誤] ecpay-map-return function 發生嚴重錯誤:', error);
    // 即使發生意外，也導回首頁
    return {
      statusCode: 302,
      headers: {
        Location: process.env.URL,
      },
    };
  }
};