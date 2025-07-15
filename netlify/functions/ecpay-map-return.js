// 檔案路徑: netlify/functions/ecpay-map-return.js
exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method NotAllowed' };
  }

  try {
    const params = new URLSearchParams(event.body);
    const cvsStoreId = params.get('CVSStoreID');
    const cvsStoreName = params.get('CVSStoreName');

    // 我們將門市資訊編碼後，放在重新導向的 URL 參數中
    const encodedStoreName = encodeURIComponent(cvsStoreName);
    const redirectUrl = `${process.env.URL}/?cvsStoreId=${cvsStoreId}&cvsStoreName=${encodedStoreName}&status=store-selected`;

    // 將使用者導回首頁，並附上門市資訊
    return {
      statusCode: 302,
      headers: {
        Location: redirectUrl,
      },
    };
  } catch (error) {
    console.error('ecpay-map-return 錯誤:', error);
    // 即使出錯也導回首頁
    return { statusCode: 302, headers: { Location: process.env.URL } };
  }
};